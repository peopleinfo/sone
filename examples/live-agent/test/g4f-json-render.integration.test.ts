/**
 * g4f (fetch) + user prompt + @json-render/core patch pipeline.
 * @json-render/core is published from https://github.com/vercel-labs/json-render
 */
import { createSpecStreamCompiler } from "@json-render/core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_G4F_CHAT_ENDPOINT,
  DEFAULT_G4F_MODEL,
  generateSpec,
  getDefaultLlmConfig,
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
});
