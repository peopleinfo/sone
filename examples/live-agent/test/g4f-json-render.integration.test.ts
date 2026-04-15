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

  it("POSTs to g4f default URL with model and messages, then compiles assistant JSONL to spec", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchMock: typeof fetch = (async (input, init) => {
      calls.push({
        url: String(input),
        body: String(init?.body || ""),
      });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: minimalJsonlPatch,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;

    const spec = await generateSpec(
      { prompt: "Design a fancy primary button with label and caption." },
      undefined,
      { config: getDefaultLlmConfig(), fetch: fetchMock },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(DEFAULT_G4F_CHAT_ENDPOINT);
    const body = calls[0]?.body ?? "";
    expect(body).toContain(`"model":"${DEFAULT_G4F_MODEL}"`);
    expect(body).toContain("fancy primary button");
    expect(body).toContain('"role":"system"');
    expect(body).toContain('"role":"user"');
    expect(spec?.root).toBe("root");
    expect(spec?.elements.t?.type).toBe("Text");
  });
});
