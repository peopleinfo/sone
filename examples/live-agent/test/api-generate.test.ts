import { describe, expect, it } from "vitest";
import { createGenerationStream, toErrorResponse } from "../server/generate.mjs";

async function streamToText(stream: ReadableStream<Uint8Array> | AsyncIterable<string | Uint8Array>) {
  if (Symbol.asyncIterator in stream) {
    let result = "";
    for await (const chunk of stream as AsyncIterable<string | Uint8Array>) {
      result += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    }
    return result;
  }

  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result;
}

describe("createGenerationStream", () => {
  it("returns the deterministic fixture stream when requested", async () => {
    const { stream, contentType } = await createGenerationStream({
      prompt: "fixture please",
      fixture: true,
    });

    expect(contentType).toContain("text/plain");
    const text = await streamToText(stream);
    expect(text).toContain('"path":"/root"');
    expect(text).toContain('"type":"Column"');
  });

  it("returns a missing_credentials error for live generation without credentials", async () => {
    const original = process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;

    try {
      await createGenerationStream({ prompt: "live generation" });
      expect.unreachable();
    } catch (error) {
      const response = toErrorResponse(error);
      expect(response.status).toBe(503);
      expect(response.body.error).toBe("missing_credentials");
    } finally {
      if (original !== undefined) {
        process.env.AI_GATEWAY_API_KEY = original;
      }
    }
  });
});
