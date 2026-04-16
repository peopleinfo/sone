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

  it("recovers missing root from OpenAI-compatible patch output", async () => {
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
                content:
                  `{"op":"add","path":"/elements/root","value":{"type":"Column","props":{"padding":20},"children":["title"]}}\n` +
                  `{"op":"add","path":"/elements/title","value":{"type":"Text","props":{"segments":[{"text":"Recovered root"}]},"children":[]}}`,
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

  it("extracts JSONL patches when model adds non-patch prose lines", async () => {
    const openAiConfig: StoredLlmConfig = {
      mode: "openai-compatible",
      url: "http://localhost:11434/v1/chat/completions",
      model: "qwen3.5-flash",
      apiKey: "",
    };

    const fetchMock: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "I will build a button spec now.\\n" +
                  "{\"op\":\"add\",\"path\":\"/root\",\"value\":\"buttonContainer\"}\\n" +
                  "{\"op\":\"add\",\"path\":\"/elements/buttonContainer\",\"value\":{\"type\":\"Column\",\"props\":{\"padding\":16},\"children\":[\"label\"]}}\\n" +
                  "{\"op\":\"add\",\"path\":\"/elements/label\",\"value\":{\"type\":\"Text\",\"props\":{\"text\":\"Get Started\"},\"children\":[]}}\\n" +
                  "Done.",
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
      { prompt: "Design fancy button" },
      undefined,
      { config: openAiConfig, fetch: fetchMock },
    );

    expect(spec?.root).toBe("buttonContainer");
    expect(spec?.elements.label.type).toBe("Text");
  });

  it("coerces loose JSONL root patches without explicit op fields", async () => {
    const openAiConfig: StoredLlmConfig = {
      mode: "openai-compatible",
      url: "http://localhost:11434/v1/chat/completions",
      model: "qwen3.5-flash",
      apiKey: "",
    };

    const fetchMock: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  `{"path":"/root","value":{"type":"Column","props":{"padding":24},"children":[]}}\n` +
                  `{"path":"/root/children/0","value":{"type":"Text","props":{"text":"Real G4F"},"children":[]}}`,
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
      { prompt: "Generate a minimal Sone spec." },
      undefined,
      { config: openAiConfig, fetch: fetchMock },
    );

    expect(spec?.root).toBe("root");
    expect(spec?.elements.root.type).toBe("Column");
    expect(spec?.elements.root.children).toHaveLength(1);
    expect(spec?.elements[spec?.elements.root.children[0] || ""].type).toBe("Text");
  });

  it("auto-retries once with validation feedback on invalid first response", async () => {
    const openAiConfig: StoredLlmConfig = {
      mode: "openai-compatible",
      url: "http://localhost:11434/v1/chat/completions",
      model: "qwen3.5-flash",
      apiKey: "",
    };

    let callCount = 0;
    const fetchMock: typeof fetch = (async () => {
      callCount += 1;
      const content =
        callCount === 1
          ? `{"op":"add","path":"/root","value":"root"}\n{"op":"add","path":"/elements/root","value":{"type":"Column","props":{"totallyUnknown":true},"children":[]}}`
          : `{"op":"add","path":"/root","value":"root"}\n{"op":"add","path":"/elements/root","value":{"type":"Column","props":{},"children":["title"]}}\n{"op":"add","path":"/elements/title","value":{"type":"Text","props":{"text":"Recovered"},"children":[]}}`;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content } }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const spec = await generateSpec(
      { prompt: "Generate a simple title card" },
      undefined,
      { config: openAiConfig, fetch: fetchMock },
    );

    expect(callCount).toBe(2);
    expect(spec?.root).toBe("root");
    expect(spec?.elements.title.type).toBe("Text");
  });

  it("normalizes missing children arrays and inline child objects", async () => {
    const openAiConfig: StoredLlmConfig = {
      mode: "openai-compatible",
      url: "http://localhost:11434/v1/chat/completions",
      model: "qwen3.5-flash",
      apiKey: "",
    };

    const fetchMock: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  root: "invoice-root",
                  elements: {
                    "invoice-root": {
                      type: "Column",
                      props: { gap: 12 },
                      children: [
                        "invoice-title",
                        {
                          type: "Row",
                          props: { justifyContent: "space-between" },
                          children: [
                            { type: "Text", props: { text: "Subtotal" } },
                            { type: "Text", props: { text: "$120.00" } },
                          ],
                        },
                      ],
                    },
                    "invoice-title": {
                      type: "Text",
                      props: { text: "Invoice #1001" },
                    },
                  },
                }),
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
      { prompt: "Generate invoice layout" },
      undefined,
      { config: openAiConfig, fetch: fetchMock },
    );

    expect(spec?.root).toBe("invoice-root");
    expect(spec?.elements["invoice-title"]?.children).toEqual([]);
    const inlineRowId = spec?.elements["invoice-root"]?.children?.find((id) =>
      String(id).startsWith("invoice-root-child-"),
    );
    expect(inlineRowId).toBeTruthy();
    expect(spec?.elements[String(inlineRowId)]?.type).toBe("Row");
    expect(spec?.elements[String(inlineRowId)]?.children).toHaveLength(2);
  });

  it("reconciles child references with different id styles", async () => {
    const openAiConfig: StoredLlmConfig = {
      mode: "openai-compatible",
      url: "http://localhost:11434/v1/chat/completions",
      model: "qwen3.5-flash",
      apiKey: "",
    };

    const fetchMock: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  root: "root",
                  elements: {
                    root: {
                      type: "Column",
                      props: { gap: 12 },
                      children: ["header", "table-section", "footer"],
                    },
                    header: {
                      type: "Text",
                      props: { text: "Invoice" },
                      children: [],
                    },
                    tableSection: {
                      type: "Column",
                      props: { gap: 8 },
                      children: ["grand-total"],
                    },
                    grandTotal: {
                      type: "Text",
                      props: { text: "$128.00", weight: "bold" },
                      children: [],
                    },
                    footer: {
                      type: "Text",
                      props: { text: "Thank you" },
                      children: [],
                    },
                  },
                }),
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
      { prompt: "Generate invoice layout" },
      undefined,
      { config: openAiConfig, fetch: fetchMock },
    );

    expect(spec?.elements.root.children).toEqual(["header", "tableSection", "footer"]);
    expect(spec?.elements.tableSection.children).toEqual(["grandTotal"]);
  });

  it("reconciles a single suffix-drift child reference", async () => {
    const openAiConfig: StoredLlmConfig = {
      mode: "openai-compatible",
      url: "http://localhost:11434/v1/chat/completions",
      model: "qwen3.5-flash",
      apiKey: "",
    };

    const fetchMock: typeof fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  root: "root",
                  elements: {
                    root: {
                      type: "Column",
                      props: {},
                      children: ["text"],
                    },
                    text1: {
                      type: "Text",
                      props: { text: "Recovered child id" },
                      children: [],
                    },
                  },
                }),
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
      { prompt: "Generate a simple text layout" },
      undefined,
      { config: openAiConfig, fetch: fetchMock },
    );

    expect(spec?.elements.root.children).toEqual(["text1"]);
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
    const calls: Array<{
      url: string;
      body: string;
      method: string;
      headers: Record<string, string>;
    }> = [];
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

      if (url.endsWith("/models/AnyProvider")) {
        return new Response(
          JSON.stringify([{ group: "Default", models: [{ id: "default", default: true }] }]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        `event: content\n` +
          `data: ${JSON.stringify({ type: "content", content: "OK" })}\n\n`,
        {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        },
      );
    }) as typeof fetch;

    const result = await testLlmConnection(getDefaultLlmConfig(), {
      fetch: fetchMock,
      g4fEncryptSecret: () => "encrypted-secret",
    });

    expect(result).toEqual({
      mode: "g4f",
      endpoint: DEFAULT_G4F_CHAT_ENDPOINT,
      model: DEFAULT_G4F_MODEL,
    });
    expect(calls).toHaveLength(3);
    expect(calls[0]?.url).toBe("https://g4f.space/backend-api/v2/public-key");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[1]?.url).toBe(DEFAULT_G4F_CHAT_ENDPOINT);
    expect(calls[1]?.body).toContain(DEFAULT_OPENAI_TEST_MESSAGE);
    expect(calls[1]?.body).toContain(`"model":"${DEFAULT_G4F_MODEL}"`);
    expect(calls[1]?.headers["x-secret"]).toBe("encrypted-secret");
    expect(calls[2]?.url).toBe("https://g4f.space/backend-api/v2/models/AnyProvider");
    expect(calls[2]?.headers["x-api-key"]).toBe("[object Object]");
    expect(calls[2]?.headers.Authorization).toBeUndefined();
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
