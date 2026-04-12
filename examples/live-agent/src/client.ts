import { createSpecStreamCompiler } from "@json-render/core";
import type { SoneSpec } from "@/types";

export interface GeneratePayload {
  prompt: string;
  previousSpec?: SoneSpec | null;
  fixture?: boolean;
}

export interface StreamCallbacks {
  onSpec: (spec: SoneSpec | null) => void;
  onError?: (message: string) => void;
}

async function readJsonError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string; message?: string };
    return data.message || data.error || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export async function streamSpec(
  endpoint: string,
  payload: GeneratePayload,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readJsonError(response));
  }

  if (!response.body) {
    throw new Error("The server did not return a readable stream.");
  }

  const compiler = createSpecStreamCompiler<SoneSpec>();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const { result, newPatches } = compiler.push(chunk);
    if (newPatches.length > 0) {
      callbacks.onSpec(result ?? null);
    }
  }

  callbacks.onSpec(compiler.getResult() ?? null);
}
