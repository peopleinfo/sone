import { describe, expect, it } from "vitest";
import {
  clearStoredLlmConfig,
  createGenerationTextStream,
  DEFAULT_CHAT_ENDPOINT,
  DEFAULT_G4F_CHAT_ENDPOINT,
  DEFAULT_G4F_MODEL,
  DEFAULT_OPENAI_TEST_MESSAGE,
  generateSpec,
  getDefaultLlmConfig,
  persistStoredLlmConfig,
  readStoredLlmConfig,
  testLlmConnection,
  type StoredLlmConfig,
} from "@/client";

async function streamToText(stream: ReadableStream<string>) {
  const reader = stream.getReader();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += value;
  }

  return result;
}

describe("createGenerationTextStream", () => {
  it("returns the deterministic fixture stream when requested", async () => {
    const stream = await createGenerationTextStream({
      prompt: "fixture please",
      fixture: true,
    });

    const text = await streamToText(stream);
    expect(text).toContain('"path":"/root"');
    expect(text).toContain('"type":"Column"');
  });

  it("compiles a local backend spec into JSONL patches", async () => {
    const fetchMock: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          spec: {
            root: "root",
            elements: {
              root: {
                type: "Column",
                props: { padding: 24 },
                children: ["title"],
              },
              title: {
                type: "Text",
                props: {
                  segments: [{ text: "Mock success", style: { weight: "bold" } }],
                  size: 24,
                },
                children: [],
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )) as typeof fetch;

    const stream = await createGenerationTextStream(
      { prompt: "generate something" },
      {
        config: {
          mode: "sone-chat",
          url: DEFAULT_CHAT_ENDPOINT,
          model: "",
          apiKey: "",
        },
        fetch: fetchMock,
      },
    );

    const text = await streamToText(stream);
    expect(text).toContain('"path":"/elements/title"');
    expect(text).toContain('"Mock success"');
  });

  it("compiles OpenAI-compatible JSONL patch output into a spec", async () => {
    const openAiConfig: StoredLlmConfig = {
      mode: "openai-compatible",
      url: "http://localhost:11434/v1/chat/completions",
      model: "llama3.2",
      apiKey: "",
    };

    const fetchMock: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `{"op":"add","path":"/root","value":"root"}\n{"op":"add","path":"/elements/root","value":{"type":"Column","props":{"padding":24},"children":["title"]}}\n{"op":"add","path":"/elements/title","value":{"type":"Text","props":{"segments":[{"text":"OpenAI compatible"}],"size":24},"children":[]}}`,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      )) as typeof fetch;

    const spec = await generateSpec(
      { prompt: "generate something" },
      undefined,
      { config: openAiConfig, fetch: fetchMock },
    );

    expect(spec?.root).toBe("root");
    expect(spec?.elements.title.type).toBe("Text");
  });

  it("persists stored LLM config to storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
    };

    persistStoredLlmConfig(
      {
        mode: "openai-compatible",
        url: "http://localhost:1234/v1/chat/completions",
        model: "qwen2.5-coder",
        apiKey: "",
      },
      storage,
    );

    expect(readStoredLlmConfig(storage)).toEqual({
      mode: "openai-compatible",
      url: "http://localhost:1234/v1/chat/completions",
      model: "qwen2.5-coder",
      apiKey: "",
    });

    clearStoredLlmConfig(storage);
    expect(readStoredLlmConfig(storage)).toBeNull();
  });

  it("passes g4f connection test via fetch", async () => {
    const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const fetchMock: typeof fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        body: String(init?.body || ""),
        headers: (init?.headers || {}) as Record<string, string>,
      });

      return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await testLlmConnection(getDefaultLlmConfig(), {
      fetch: fetchMock,
    });

    expect(result).toEqual({
      mode: "g4f",
      endpoint: DEFAULT_G4F_CHAT_ENDPOINT,
      model: DEFAULT_G4F_MODEL,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(DEFAULT_G4F_CHAT_ENDPOINT);
    expect(calls[0]?.body).toContain(DEFAULT_OPENAI_TEST_MESSAGE);
    expect(calls[0]?.body).toContain(`"model":"${DEFAULT_G4F_MODEL}"`);
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });

  it("passes the OpenAI-compatible connection test without an API key", async () => {
    const calls: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const fetchMock: typeof fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        body: String(init?.body || ""),
        headers: (init?.headers || {}) as Record<string, string>,
      });

      return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await testLlmConnection(
      {
        mode: "openai-compatible",
        url: "http://localhost:11434/v1/chat/completions",
        model: "",
        apiKey: "",
      },
      { fetch: fetchMock },
    );

    expect(result).toEqual({
      mode: "openai-compatible",
      endpoint: "http://localhost:11434/v1/chat/completions",
      model: "",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(calls[0]?.body).toContain(DEFAULT_OPENAI_TEST_MESSAGE);
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });
});
