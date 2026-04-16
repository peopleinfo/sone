/**
 * g4f (fetch) + user prompt + @json-render/core patch pipeline.
 * @json-render/core is published from https://github.com/vercel-labs/json-render
 */
import { createSpecStreamCompiler } from "@json-render/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGenerationTextStream,
  DEFAULT_G4F_CHAT_ENDPOINT,
  DEFAULT_G4F_MODEL,
  generateSpec,
  getDefaultLlmConfig,
  resetProviderCache,
  testLlmConnection,
} from "@/client";
import type { SoneSpec } from "@/types";

const minimalJsonlPatch =
  '{"op":"add","path":"/root","value":"root"}\n' +
  '{"op":"add","path":"/elements/root","value":{"type":"Column","props":{"padding":8},"children":["t"]}}\n' +
  '{"op":"add","path":"/elements/t","value":{"type":"Text","props":{"segments":[{"text":"g4f+json-render"}],"size":14},"children":[]}}\n';

describe("g4f LLM + prompt + @json-render/core", () => {
  it("compiles JSONL patches with createSpecStreamCompiler (json-render core)", () => {
    const compiler = createSpecStreamCompiler<SoneSpec>();
    compiler.push(minimalJsonlPatch);
    const result = compiler.getResult();
    expect(result?.root).toBe("root");
    expect(result?.elements.t?.type).toBe("Text");
  });

  it("bootstraps g4f headers, POSTs conversation SSE, then compiles assistant JSONL to spec", async () => {
    const calls: Array<{ url: string; body: string; method: string; headers: Record<string, string> }> = [];
    const fetchMock: typeof fetch = (async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        body: String(init?.body || ""),
        method: String(init?.method || "GET"),
        headers: (init?.headers || {}) as Record<string, string>,
      });

      if (url.endsWith("/public-key")) {
        return new Response(
          JSON.stringify({
            data: "secret-payload",
            public_key: "-----BEGIN PUBLIC KEY-----mock-----END PUBLIC KEY-----",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        `event: content\n` +
          `data: ${JSON.stringify({ type: "content", content: minimalJsonlPatch })}\n\n`,
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        },
      );
    }) as typeof fetch;

    const spec = await generateSpec(
      { prompt: "Design a fancy primary button with label and caption." },
      undefined,
      {
        config: getDefaultLlmConfig(),
        fetch: fetchMock,
        g4fEncryptSecret: () => "encrypted-secret",
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toBe("https://g4f.space/backend-api/v2/public-key");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[1]?.url).toBe(DEFAULT_G4F_CHAT_ENDPOINT);
    expect(calls[1]?.headers["x-secret"]).toBe("encrypted-secret");
    const body = calls[1]?.body ?? "";
    expect(body).toContain(`"model":"${DEFAULT_G4F_MODEL}"`);
    expect(body).toContain('"provider":"AnyProvider"');
    expect(body).toContain("fancy primary button");
    expect(body).toContain('"role":"system"');
    expect(body).toContain('"role":"user"');
    expect(spec?.root).toBe("root");
    expect(spec?.elements.t?.type).toBe("Text");
  });

  it("finishes g4f generation when SSE emits finish but the stream stays open", async () => {
    const fetchMock: typeof fetch = (async (input) => {
      const url = String(input);
      if (url.endsWith("/public-key")) {
        return new Response(
          JSON.stringify({
            data: "secret-payload",
            public_key: "-----BEGIN PUBLIC KEY-----mock-----END PUBLIC KEY-----",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: content\n` +
                `data: ${JSON.stringify({ type: "content", content: minimalJsonlPatch })}\n\n` +
                `event: finish\n` +
                `data: ${JSON.stringify({ type: "finish", finish: { reason: "stop" } })}\n\n`,
            ),
          );
          // Intentionally leave the stream open to mirror the live g4f SSE behavior.
        },
        cancel() {
          return;
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;

    const spec = await generateSpec(
      { prompt: "Generate a minimal Sone spec." },
      undefined,
      {
        config: getDefaultLlmConfig(),
        fetch: fetchMock,
        g4fEncryptSecret: () => "encrypted-secret",
      },
    );

    expect(spec?.root).toBe("root");
    expect(spec?.elements.t?.type).toBe("Text");
  });

  afterEach(() => {
    resetProviderCache();
  });

  it("retries with a different provider from /providers API on token-limit error", async () => {
    const providers = [
      { name: "AnyProvider", active_by_default: true, auth: false, live: 20, nodriver: false },
      { name: "DeepInfra", active_by_default: true, auth: false, live: 17, nodriver: false },
      { name: "Qwen", active_by_default: true, auth: false, live: 15, nodriver: false },
    ];

    const conversationBodies: string[] = [];
    let conversationCallCount = 0;
    const fetchMock: typeof fetch = (async (input, init) => {
      const url = String(input);

      if (url.endsWith("/public-key")) {
        return new Response(
          JSON.stringify({
            data: "secret-payload",
            public_key: "-----BEGIN PUBLIC KEY-----mock-----END PUBLIC KEY-----",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/providers")) {
        return new Response(JSON.stringify(providers), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      conversationCallCount++;
      conversationBodies.push(String(init?.body || ""));

      if (conversationCallCount === 1) {
        return new Response(
          JSON.stringify({ message: "Token limit (500,000 per day) exceeded." }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        `event: content\ndata: ${JSON.stringify({ type: "content", content: minimalJsonlPatch })}\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const spec = await generateSpec(
      { prompt: "Generate a minimal Sone spec." },
      undefined,
      { config: getDefaultLlmConfig(), fetch: fetchMock, g4fEncryptSecret: () => "enc" },
    );

    expect(conversationCallCount).toBe(2);
    expect(conversationBodies[0]).toContain('"provider":"AnyProvider"');
    expect(conversationBodies[1]).toContain('"provider":"DeepInfra"');
    expect(spec?.root).toBe("root");
    expect(spec?.elements.t?.type).toBe("Text");
  });

  it("retries with a different provider when SSE stream emits a token-limit error", async () => {
    const providers = [
      { name: "AnyProvider", active_by_default: true, auth: false, live: 20, nodriver: false },
      { name: "Groq", active_by_default: true, auth: false, live: 1, nodriver: false },
    ];

    const conversationBodies: string[] = [];
    let conversationCallCount = 0;
    const fetchMock: typeof fetch = (async (input, init) => {
      const url = String(input);

      if (url.endsWith("/public-key")) {
        return new Response(
          JSON.stringify({
            data: "secret-payload",
            public_key: "-----BEGIN PUBLIC KEY-----mock-----END PUBLIC KEY-----",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/providers")) {
        return new Response(JSON.stringify(providers), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      conversationCallCount++;
      conversationBodies.push(String(init?.body || ""));

      if (conversationCallCount === 1) {
        return new Response(
          `event: error\ndata: ${JSON.stringify({ type: "error", error: "Token limit (500,000 per day) exceeded." })}\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }

      return new Response(
        `event: content\ndata: ${JSON.stringify({ type: "content", content: minimalJsonlPatch })}\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const spec = await generateSpec(
      { prompt: "Generate a minimal Sone spec." },
      undefined,
      { config: getDefaultLlmConfig(), fetch: fetchMock, g4fEncryptSecret: () => "enc" },
    );

    expect(conversationCallCount).toBe(2);
    expect(conversationBodies[0]).toContain('"provider":"AnyProvider"');
    expect(conversationBodies[1]).toContain('"provider":"Groq"');
    expect(spec?.root).toBe("root");
  });

  it("cycles through all fallback providers and throws when all are exhausted", async () => {
    const providers = [
      { name: "AnyProvider", active_by_default: true, auth: false, live: 20, nodriver: false },
      { name: "ProviderA", active_by_default: true, auth: false, live: 5, nodriver: false },
      { name: "ProviderB", active_by_default: true, auth: false, live: 3, nodriver: false },
    ];

    const conversationBodies: string[] = [];
    const fetchMock: typeof fetch = (async (input, init) => {
      const url = String(input);

      if (url.endsWith("/public-key")) {
        return new Response(
          JSON.stringify({
            data: "secret-payload",
            public_key: "-----BEGIN PUBLIC KEY-----mock-----END PUBLIC KEY-----",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/providers")) {
        return new Response(JSON.stringify(providers), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      conversationBodies.push(String(init?.body || ""));
      return new Response(
        JSON.stringify({ message: "Token limit exceeded." }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await expect(
      generateSpec(
        { prompt: "Generate a minimal Sone spec." },
        undefined,
        { config: getDefaultLlmConfig(), fetch: fetchMock, g4fEncryptSecret: () => "enc" },
      ),
    ).rejects.toThrow(/token limit/i);

    expect(conversationBodies).toHaveLength(3);
    expect(conversationBodies[0]).toContain('"provider":"AnyProvider"');
    expect(conversationBodies[1]).toContain('"provider":"ProviderA"');
    expect(conversationBodies[2]).toContain('"provider":"ProviderB"');
  });

  it("does not retry or fetch providers on a non-retryable error", async () => {
    let providersFetched = false;
    const fetchMock: typeof fetch = (async (input) => {
      const url = String(input);

      if (url.endsWith("/public-key")) {
        return new Response(
          JSON.stringify({
            data: "secret-payload",
            public_key: "-----BEGIN PUBLIC KEY-----mock-----END PUBLIC KEY-----",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/providers")) {
        providersFetched = true;
        return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      }

      return new Response(
        JSON.stringify({ message: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await expect(
      generateSpec(
        { prompt: "Generate a minimal Sone spec." },
        undefined,
        { config: getDefaultLlmConfig(), fetch: fetchMock, g4fEncryptSecret: () => "enc" },
      ),
    ).rejects.toThrow(/internal server error/i);

    expect(providersFetched).toBe(false);
  });

  it("falls back to static provider list when /providers API fails", async () => {
    const conversationBodies: string[] = [];
    let conversationCallCount = 0;
    const fetchMock: typeof fetch = (async (input, init) => {
      const url = String(input);

      if (url.endsWith("/public-key")) {
        return new Response(
          JSON.stringify({
            data: "secret-payload",
            public_key: "-----BEGIN PUBLIC KEY-----mock-----END PUBLIC KEY-----",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/providers")) {
        return new Response("Server error", { status: 500 });
      }

      conversationCallCount++;
      conversationBodies.push(String(init?.body || ""));

      if (conversationCallCount === 1) {
        return new Response(
          JSON.stringify({ message: "Token limit exceeded." }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        `event: content\ndata: ${JSON.stringify({ type: "content", content: minimalJsonlPatch })}\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const spec = await generateSpec(
      { prompt: "Generate a minimal Sone spec." },
      undefined,
      { config: getDefaultLlmConfig(), fetch: fetchMock, g4fEncryptSecret: () => "enc" },
    );

    expect(conversationCallCount).toBe(2);
    expect(conversationBodies[0]).toContain('"provider":"AnyProvider"');
    expect(conversationBodies[1]).toContain('"provider":"DeepInfra"');
    expect(spec?.root).toBe("root");
  });

  it("retries connection test with fallback provider on token-limit error", async () => {
    const providers = [
      { name: "AnyProvider", active_by_default: true, auth: false, live: 20, nodriver: false },
      { name: "Nvidia", active_by_default: true, auth: false, live: 1, nodriver: false },
    ];

    const conversationBodies: string[] = [];
    let conversationCallCount = 0;
    const fetchMock: typeof fetch = (async (input, init) => {
      const url = String(input);

      if (url.endsWith("/public-key")) {
        return new Response(
          JSON.stringify({
            data: "secret-payload",
            public_key: "-----BEGIN PUBLIC KEY-----mock-----END PUBLIC KEY-----",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/providers")) {
        return new Response(JSON.stringify(providers), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/models/AnyProvider")) {
        return new Response(
          JSON.stringify([{ group: "Default", models: [{ id: "default", default: true }] }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      conversationCallCount++;
      conversationBodies.push(String(init?.body || ""));

      if (conversationCallCount === 1) {
        return new Response(
          `event: error\ndata: ${JSON.stringify({ type: "error", error: "Token limit (500,000 per day) exceeded." })}\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        );
      }

      return new Response(
        `event: content\ndata: ${JSON.stringify({ type: "content", content: "OK" })}\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as typeof fetch;

    const result = await testLlmConnection(getDefaultLlmConfig(), {
      fetch: fetchMock,
      g4fEncryptSecret: () => "enc",
    });

    expect(result.mode).toBe("g4f");
    expect(conversationCallCount).toBe(2);
    expect(conversationBodies[0]).toContain('"provider":"AnyProvider"');
    expect(conversationBodies[1]).toContain('"provider":"Nvidia"');
  });

  it("emits g4f SSE content before the response finishes", async () => {
    let finishStream: (() => void) | null = null;
    const fetchMock: typeof fetch = (async (input) => {
      const url = String(input);
      if (url.endsWith("/public-key")) {
        return new Response(
          JSON.stringify({
            data: "secret-payload",
            public_key: "-----BEGIN PUBLIC KEY-----mock-----END PUBLIC KEY-----",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `event: content\n` +
                `data: ${JSON.stringify({
                  type: "content",
                  content: '{"op":"add","path":"/root","value":"root"}\n',
                })}\n\n`,
            ),
          );
          finishStream = () => {
            controller.enqueue(
              encoder.encode(
                `event: finish\n` +
                  `data: ${JSON.stringify({ type: "finish", finish: { reason: "stop" } })}\n\n`,
              ),
            );
          };
        },
        cancel() {
          return;
        },
      });

      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;

    const stream = await createGenerationTextStream(
      { prompt: "Generate a minimal Sone spec." },
      {
        config: getDefaultLlmConfig(),
        fetch: fetchMock,
        g4fEncryptSecret: () => "encrypted-secret",
      },
    );

    const reader = stream.getReader();
    const firstChunk = await reader.read();
    expect(firstChunk.done).toBe(false);
    expect(firstChunk.value).toBe('{"op":"add","path":"/root","value":"root"}\n');
    finishStream?.();
    reader.releaseLock();
  });
});
