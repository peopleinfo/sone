import { gateway } from "@ai-sdk/gateway";
import {
  buildUserPrompt,
} from "@json-render/core";
import { streamText } from "ai";
import { createSoneSystemPrompt } from "./catalog-prompt.mjs";
import { createFixtureJsonlStream } from "./fixture-stream.mjs";

const MAX_PROMPT_LENGTH = 1200;
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

const CUSTOM_RULES = [
  "Generate only RFC 6902 JSON Patch lines in standalone mode.",
  "Use the custom Sone catalog exactly; never invent component names.",
  "Prefer Column and Row for layout and Text with segments for copy.",
  "Keep output within the documented v1 prop subset.",
  "Use Table.rows/cells and List.items instead of emitting wrapper nodes.",
  "Do not include markdown, prose, code fences, or comments in successful output.",
];

class HttpError extends Error {
  constructor(status, error, message, details) {
    super(message);
    this.status = status;
    this.error = error;
    this.details = details;
  }
}

function validateGenerateRequest(body) {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be a JSON object.");
  }

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    throw new HttpError(400, "invalid_request", "`prompt` must be a non-empty string.");
  }

  if (body.previousSpec != null && typeof body.previousSpec !== "object") {
    throw new HttpError(400, "invalid_request", "`previousSpec` must be an object when provided.");
  }

  return {
    prompt: body.prompt.trim(),
    previousSpec: body.previousSpec ?? null,
    fixture: body.fixture === true,
  };
}

function hasUsableSpec(spec) {
  return (
    spec != null &&
    typeof spec === "object" &&
    typeof spec.root === "string" &&
    spec.root.length > 0 &&
    spec.elements != null &&
    typeof spec.elements === "object" &&
    Object.keys(spec.elements).length > 0
  );
}

function assertCredentials() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new HttpError(
      503,
      "missing_credentials",
      "AI_GATEWAY_API_KEY is required for live generation. Send `{ \"fixture\": true }` to use the deterministic fixture stream.",
    );
  }
}

function buildPatchOnlyUserPrompt({ prompt, previousSpec }) {
  return buildUserPrompt({
    prompt,
    currentSpec: hasUsableSpec(previousSpec) ? previousSpec : undefined,
    editModes: ["patch"],
    maxPromptLength: MAX_PROMPT_LENGTH,
  });
}

export async function createGenerationStream(body, { signal } = {}) {
  const request = validateGenerateRequest(body);

  if (request.fixture || process.env.LIVE_AGENT_PROVIDER === "fixture") {
    return {
      stream: createFixtureJsonlStream({ signal }),
      contentType: "text/plain; charset=utf-8",
    };
  }

  assertCredentials();

  const system = createSoneSystemPrompt(CUSTOM_RULES);
  const userPrompt = buildPatchOnlyUserPrompt(request);

  const result = streamText({
    model: gateway(process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL),
    system,
    prompt: userPrompt,
    temperature: 0.4,
    abortSignal: signal,
  });

  return {
    stream: result.textStream,
    contentType: "text/plain; charset=utf-8",
  };
}

export function toErrorResponse(error) {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: {
        error: error.error,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "server_error",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}
