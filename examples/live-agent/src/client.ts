import {
  buildUserPrompt,
  createSpecStreamCompiler,
  type Spec,
} from "@json-render/core";
import { JSEncrypt } from "jsencrypt";
import { soneCatalog } from "@/catalog";
import { createFixtureJsonlStream, createSpecJsonlStream } from "@/fixture-stream";
import { prepareSpec } from "@/spec-normalize";
import { validateSoneSpec } from "@/spec-to-sone";
import type { SoneElement, SoneSpec } from "@/types";

export const DEFAULT_CHAT_ENDPOINT = "http://localhost:8080/api/agent/chat";
export const DEFAULT_G4F_API_BASE = "https://g4f.space/backend-api/v2";
/** g4f conversation endpoint (fetch-based SSE). */
export const DEFAULT_G4F_CHAT_ENDPOINT =
  `${DEFAULT_G4F_API_BASE}/conversation`;
export const DEFAULT_G4F_MODEL = "default";
export const TEST_CONNECTION_MESSAGE = "What tools do you have?";
export const DEFAULT_OPENAI_TEST_MESSAGE = "Reply with OK.";

const STORAGE_LLM_CONFIG = "sone.live-agent.llm-config";
const OPENAI_COMPAT_CUSTOM_RULES = [
  "Output ONLY JSONL patches. No prose, markdown, code fences, or explanations.",
  "Return schema-valid Sone patches on first attempt. Invalid keys or malformed shapes are not allowed.",
  "Generate concise Sone layouts that fit within a single card or image canvas.",
  "Use the custom Sone catalog exactly: component type must be one of Column, Row, Grid, Text, TextDefault, PageBreak, Photo, Table, List, Path, ClipGroup.",
  "The spec field root must exactly match an existing key under elements (e.g. root \"root\" with /elements/root). Never set root to a name you did not add under elements.",
  "Prefer Column or Row as the root layout container with a simple id like root.",
  "Each element value MUST have exactly this shape: {\"type\":\"<CatalogComponent>\",\"props\":{},\"children\":[]}. Never omit children or props.",
  "children must be string ids only. Never put objects inside children.",
  "On Column, Row, Grid, Photo, Path, ClipGroup, Table cells, and List items: use background for fills, not color. Use Text.props.segments[].style.color for text color.",
  "Only Text and table/list cell text styles may use text-related keys such as text, segments, color, weight, font, align.",
  "Use Table.rows/cells and List.items instead of wrapper nodes.",
  "Never emit unknown CSS keys like fontWeight, borderBottom (use allowed schema keys instead).",
  "Patch ordering requirement: /root first, then /elements/root, then remaining /elements/*.",
  "Minimal valid starter example: {\"op\":\"add\",\"path\":\"/root\",\"value\":\"root\"} then {\"op\":\"add\",\"path\":\"/elements/root\",\"value\":{\"type\":\"Column\",\"props\":{},\"children\":[]}}",
] as const;
const MAX_AUTO_REPAIR_ATTEMPTS = 1;

export type LlmBackendMode = "sone-chat" | "g4f" | "openai-compatible";

export interface StoredLlmConfig {
  mode: LlmBackendMode;
  url: string;
  model?: string;
  apiKey?: string;
}

export interface GeneratePayload {
  prompt: string;
  previousSpec?: SoneSpec | null;
  fixture?: boolean;
}

export interface StreamCallbacks {
  onSpec: (spec: SoneSpec | null) => void;
  onError?: (message: string) => void;
}

export interface ClientGenerationOptions {
  signal?: AbortSignal;
  config?: StoredLlmConfig | null;
  fetch?: typeof fetch;
  g4fEncryptSecret?: G4fEncryptSecret;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface RuntimeOptions {
  signal?: AbortSignal;
  config: StoredLlmConfig | null;
  fetch?: typeof fetch;
  g4fEncryptSecret: G4fEncryptSecret;
}

type OpenAiCompatResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            text?: string;
            type?: string;
          }>;
    };
  }>;
};

type G4fPublicKeyResponse = {
  data?: string;
  public_key?: string;
  user?: string;
};

type G4fConversationEvent =
  | {
      type?: string;
      content?: string;
      message?: string;
      error?: string | { message?: string };
      response?: {
        error?: { message?: string };
        choices?: Array<{
          delta?: {
            content?: string;
          };
          message?: {
            content?:
              | string
              | Array<{
                  text?: string;
                }>;
          };
        }>;
      };
    }
  | null;

type G4fEncryptSecret = (publicKey: string, data: string) => string;

const DEFAULT_G4F_PROVIDER = "AnyProvider";
const DEFAULT_G4F_IGNORED = [
  "AIBadgr",
  "Anthropic",
  "Azure",
  "BlackboxPro",
  "CachedSearch",
  "Cerebras",
  "Chatai",
  "Claude",
  "Cohere",
  "Custom",
  "DeepSeek",
  "FenayAI",
  "GigaChat",
  "GithubCopilotAPI",
  "GlhfChat",
  "GoogleSearch",
  "GradientNetwork",
  "Grok",
  "HailuoAI",
  "ItalyGPT",
  "MarkItDown",
  "MetaAI",
  "MicrosoftDesigner",
  "BingCreateImages",
  "MiniMax",
  "OpenaiAPI",
  "OpenAIFM",
  "OpenRouter",
  "PerplexityApi",
  "Pi",
  "Replicate",
  "TeachAnything",
  "ThebApi",
  "Together",
  "WeWordle",
  "WhiteRabbitNeo",
  "xAI",
  "YouTube",
  "Yqcloud",
] as const;

function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access failures in non-browser or restricted contexts.
  }

  return null;
}

export function getDefaultLlmConfig(): StoredLlmConfig {
  return {
    mode: "g4f",
    url: DEFAULT_G4F_CHAT_ENDPOINT,
    model: DEFAULT_G4F_MODEL,
    apiKey: "",
  };
}

function normalizeConfig(config: StoredLlmConfig): StoredLlmConfig {
  const normalizedUrl = config.url.trim();
  const canonicalG4fUrl =
    config.mode === "g4f" && isG4fDefaultEndpoint(normalizedUrl)
      ? DEFAULT_G4F_CHAT_ENDPOINT
      : normalizedUrl;

  return {
    mode: config.mode,
    url: canonicalG4fUrl,
    model: config.model?.trim() || "",
    apiKey: config.apiKey?.trim() || "",
  };
}

function isStoredLlmConfig(value: unknown): value is StoredLlmConfig {
  const mode = value != null && typeof value === "object" ? (value as { mode?: unknown }).mode : undefined;
  return (
    value != null &&
    typeof value === "object" &&
    (mode === "sone-chat" || mode === "g4f" || mode === "openai-compatible") &&
    typeof (value as { url?: unknown }).url === "string"
  );
}

export function readStoredLlmConfig(
  storage: StorageLike | null = getBrowserStorage(),
): StoredLlmConfig | null {
  const raw = storage?.getItem(STORAGE_LLM_CONFIG);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isStoredLlmConfig(parsed)) {
      return null;
    }

    let normalized = normalizeConfig(parsed);
    if (normalized.mode === "openai-compatible" && isG4fDefaultEndpoint(normalized.url)) {
      normalized = {
        ...normalized,
        mode: "g4f",
        url: DEFAULT_G4F_CHAT_ENDPOINT,
      };
    }
    return normalized.url ? normalized : null;
  } catch {
    return null;
  }
}

export function persistStoredLlmConfig(
  config: StoredLlmConfig,
  storage: StorageLike | null = getBrowserStorage(),
) {
  if (!storage) {
    throw new Error("Local storage is not available in this runtime.");
  }

  const normalized = normalizeConfig(config);
  if (!normalized.url) {
    throw new Error("Endpoint URL is required before saving LLM settings.");
  }

  storage.setItem(STORAGE_LLM_CONFIG, JSON.stringify(normalized));
  return normalized;
}

export function clearStoredLlmConfig(storage: StorageLike | null = getBrowserStorage()) {
  storage?.removeItem(STORAGE_LLM_CONFIG);
}

function getRuntimeOptions(options: ClientGenerationOptions = {}): RuntimeOptions {
  const defaultFetch =
    typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : undefined;

  return {
    signal: options.signal,
    config: options.config === undefined ? readStoredLlmConfig() : options.config,
    fetch: options.fetch || defaultFetch,
    g4fEncryptSecret: options.g4fEncryptSecret || encryptG4fSecret,
  };
}

async function readJsonError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof data.message === "string" && data.message) {
      return data.message;
    }
    if (typeof data.error === "string" && data.error) {
      return data.error;
    }
    if (typeof data.error === "object" && typeof data.error?.message === "string") {
      return data.error.message;
    }
  } catch {
    try {
      const text = await response.text();
      if (text.trim().length > 0) {
        return text.trim();
      }
    } catch {
      // ignore fallback parsing failures
    }
  }

  return `Request failed with status ${response.status}`;
}

function ensureFetch(fetchImpl: typeof fetch | undefined): typeof fetch {
  if (!fetchImpl) {
    throw new Error("Fetch API is not available in this runtime.");
  }
  return fetchImpl;
}

function buildPatchOnlyUserPrompt({ prompt, previousSpec }: GeneratePayload) {
  return buildUserPrompt({
    prompt,
    currentSpec:
      previousSpec != null ? (previousSpec as unknown as Spec) : undefined,
    maxPromptLength: 1200,
  });
}

function createOpenAiCompatSystemPrompt() {
  return soneCatalog.prompt({
    customRules: [...OPENAI_COMPAT_CUSTOM_RULES],
  });
}

function buildRepairPrompt(
  payload: GeneratePayload,
  reason: string,
  attempt: number,
) {
  const issues = reason
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => `- ${line}`)
    .join("\n");
  return [
    `Your previous output was invalid for Sone (attempt ${attempt}).`,
    "Fix it by returning ONLY JSONL patches.",
    "Do not include prose, markdown, or explanations.",
    `Original request: ${payload.prompt}`,
    "Validation errors:",
    issues || "- Unknown validation error",
  ].join("\n");
}

function buildHeaders(config: StoredLlmConfig) {
  const headers: Record<string, string> = {
    accept: "application/json",
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  return headers;
}

function encryptG4fSecret(publicKey: string, data: string) {
  const encryptor = new JSEncrypt();
  encryptor.setPublicKey(publicKey);
  const encrypted = encryptor.encrypt(data);
  if (!encrypted) {
    throw new Error("g4f public key encryption failed.");
  }
  return encrypted;
}

function resolveG4fApiBase(url: string) {
  const parsed = new URL(url.trim());
  return `${parsed.origin}/backend-api/v2`;
}

function buildG4fApiKeyPayload(config: StoredLlmConfig) {
  if (config.apiKey) {
    return config.apiKey;
  }

  return {
    PollinationsAI: null,
    HuggingFace: null,
    Together: null,
    GeminiPro: null,
    OpenRouter: null,
    OpenRouterFree: null,
    Groq: null,
    DeepInfra: null,
    Replicate: null,
    PuterJS: null,
    Azure: null,
    Nvidia: null,
    Ollama: null,
  };
}

async function getG4fConversationHeaders(
  config: StoredLlmConfig,
  runtime: RuntimeOptions,
): Promise<Record<string, string>> {
  const fetchImpl = ensureFetch(runtime.fetch);
  const publicKeyUrl = `${resolveG4fApiBase(config.url)}/public-key`;
  let response = await fetchImpl(publicKeyUrl, {
    method: "POST",
    headers: {
      accept: "*/*",
    },
    signal: runtime.signal,
  });

  if (!response.ok) {
    response = await fetchImpl(publicKeyUrl, {
      headers: {
        accept: "*/*",
      },
      signal: runtime.signal,
    });
  }

  if (!response.ok) {
    throw new Error(await readJsonError(response));
  }

  const data = (await response.json()) as G4fPublicKeyResponse;
  if (!data.public_key || !data.data) {
    throw new Error("g4f public-key endpoint returned an incomplete payload.");
  }

  return {
    accept: "text/event-stream",
    "Content-Type": "application/json",
    "x-secret": runtime.g4fEncryptSecret(data.public_key, data.data),
  };
}

function parseG4fEventData(streamText: string) {
  const normalized = streamText.replace(/\r\n/g, "\n");
  const rawEvents = normalized
    .split("\n\n")
    .map((event) => event.trim())
    .filter(Boolean);

  const events: G4fConversationEvent[] = [];
  for (const rawEvent of rawEvents) {
    const dataLines = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6));

    if (dataLines.length === 0) {
      continue;
    }

    try {
      events.push(JSON.parse(dataLines.join("\n")) as G4fConversationEvent);
    } catch {
      // Ignore malformed SSE chunks and continue scanning.
    }
  }

  return events;
}

function extractAssistantTextFromG4fEvent(event: G4fConversationEvent) {
  if (!event) return "";
  if (event.type === "content" && typeof event.content === "string") {
    return event.content;
  }
  return "";
}

function extractAssistantTextFromG4fResponse(event: G4fConversationEvent) {
  if (!event?.response) {
    return "";
  }

  const choiceTexts =
    event.response.choices?.map((choice) => {
      const deltaContent = choice.delta?.content;
      if (typeof deltaContent === "string") {
        return deltaContent;
      }

      const messageContent = choice.message?.content;
      if (typeof messageContent === "string") {
        return messageContent;
      }

      if (Array.isArray(messageContent)) {
        return messageContent
          .map((part) => (typeof part?.text === "string" ? part.text : ""))
          .join("");
      }

      return "";
    }) || [];

  return choiceTexts.join("");
}

function readG4fError(event: G4fConversationEvent) {
  if (!event) return "";
  if (typeof event.message === "string" && event.message.trim()) {
    return event.message.trim();
  }
  if (typeof event.error === "string" && event.error.trim()) {
    return event.error.trim();
  }
  if (typeof event.error === "object" && typeof event.error?.message === "string") {
    return event.error.message.trim();
  }
  if (typeof event.response?.error?.message === "string") {
    return event.response.error.message.trim();
  }
  return "";
}

function parseG4fConversationText(streamText: string) {
  const events = parseG4fEventData(streamText);
  const contentText = events.map(extractAssistantTextFromG4fEvent).join("");
  const responseText = events.map(extractAssistantTextFromG4fResponse).join("");
  const assistantText = contentText || responseText;
  if (assistantText.trim()) {
    return assistantText;
  }

  const errors = events.map(readG4fError).filter(Boolean);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  throw new Error("g4f conversation endpoint returned no assistant content.");
}

async function readG4fConversationStream(
  response: Response,
  signal?: AbortSignal,
) {
  if (!response.body) {
    throw new Error("g4f conversation endpoint returned no response body.");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let currentDataLines: string[] = [];
  let assistantText = "";
  const terminalErrors: string[] = [];
  const deferredErrors: string[] = [];
  let sawContentEvent = false;

  const flushEvent = () => {
    if (currentDataLines.length === 0) {
      return null;
    }

    const payload = currentDataLines.join("\n");
    currentDataLines = [];

    try {
      return JSON.parse(payload) as G4fConversationEvent;
    } catch {
      return null;
    }
  };

  const handleEvent = (event: G4fConversationEvent) => {
    if (!event) {
      return null;
    }

    const contentText = extractAssistantTextFromG4fEvent(event);
    if (contentText) {
      sawContentEvent = true;
      assistantText += contentText;
    } else if (!sawContentEvent) {
      const responseText = extractAssistantTextFromG4fResponse(event);
      if (responseText) {
        assistantText += responseText;
      }
    }

    const responseError =
      typeof event.response?.error?.message === "string"
        ? event.response.error.message.trim()
        : "";
    if (responseError) {
      deferredErrors.push(responseError);
    }

    if (event.type === "error" || event.type === "auth") {
      const terminalError = readG4fError(event);
      if (terminalError) {
        terminalErrors.push(terminalError);
      }
      return "done";
    }

    if (event.type === "finish" || event.type === "usage") {
      return "done";
    }

    return null;
  };

  while (true) {
    if (signal?.aborted) {
      throw new Error("The operation was aborted.");
    }

    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, "");
      if (line.startsWith("data: ")) {
        currentDataLines.push(line.slice(6));
        continue;
      }

      if (line === "") {
        const event = flushEvent();
        if (handleEvent(event) === "done") {
          await reader.cancel();
          if (assistantText.trim()) {
            return assistantText;
          }
          if (terminalErrors.length > 0) {
            throw new Error(terminalErrors.join("\n"));
          }
          if (deferredErrors.length > 0) {
            throw new Error(deferredErrors.join("\n"));
          }
          throw new Error("g4f conversation endpoint returned no assistant content.");
        }
      }
    }
  }

  const finalEvent = flushEvent();
  handleEvent(finalEvent);

  if (assistantText.trim()) {
    return assistantText;
  }
  if (terminalErrors.length > 0) {
    throw new Error(terminalErrors.join("\n"));
  }
  if (deferredErrors.length > 0) {
    throw new Error(deferredErrors.join("\n"));
  }

  return parseG4fConversationText(buffer);
}

function createConversationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `g4f-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function requestG4fConversationText(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  config: StoredLlmConfig,
  runtime: RuntimeOptions,
) {
  const response = await ensureFetch(runtime.fetch)(config.url, {
    method: "POST",
    headers: await getG4fConversationHeaders(config, runtime),
    body: JSON.stringify({
      id: String(Date.now()),
      conversation_id: createConversationId(),
      model: config.model || DEFAULT_G4F_MODEL,
      web_search: false,
      provider: DEFAULT_G4F_PROVIDER,
      messages,
      action: "next",
      download_media: true,
      debug_mode: false,
      api_key: buildG4fApiKeyPayload(config),
      ignored: [...DEFAULT_G4F_IGNORED],
      aspect_ratio: "16:9",
    }),
    signal: runtime.signal,
  });

  if (!response.ok) {
    throw new Error(await readJsonError(response));
  }

  return readG4fConversationStream(response, runtime.signal);
}

async function fetchG4fModels(
  config: StoredLlmConfig,
  runtime: RuntimeOptions,
) {
  const response = await ensureFetch(runtime.fetch)(
    `${resolveG4fApiBase(config.url)}/models/${DEFAULT_G4F_PROVIDER}`,
    {
      headers: {
        accept: "*/*",
        "Content-Type": "application/json",
        "x-api-key":
          typeof buildG4fApiKeyPayload(config) === "string"
            ? String(buildG4fApiKeyPayload(config))
            : "[object Object]",
        "x-ignored": DEFAULT_G4F_IGNORED.join(" "),
      },
      signal: runtime.signal,
    },
  );

  if (!response.ok) {
    throw new Error(await readJsonError(response));
  }

  return response.json();
}

/** True for known g4f endpoint variants (used for stored-config migration). */
export function isG4fDefaultEndpoint(url: string) {
  const normalized = url.trim().replace(/\/+$/, "");
  return (
    normalized === DEFAULT_G4F_CHAT_ENDPOINT.replace(/\/+$/, "") ||
    normalized === "https://g4f.space/backend-api/v2" ||
    normalized === "https://g4f.space/api/pollinations/chat/completions" ||
    normalized === "https://g4f.space/ai"
  );
}

async function requestSoneChatSpec(
  prompt: string,
  config: StoredLlmConfig,
  runtime: RuntimeOptions,
): Promise<SoneSpec> {
  const response = await ensureFetch(runtime.fetch)(config.url, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify({ message: prompt }),
    signal: runtime.signal,
  });

  if (!response.ok) {
    throw new Error(await readJsonError(response));
  }

  const data = (await response.json()) as { spec?: SoneSpec };
  if (!data?.spec || typeof data.spec !== "object") {
    throw new Error("Chat endpoint did not return a valid `spec` payload.");
  }

  return data.spec;
}

function extractAssistantText(data: OpenAiCompatResponse) {
  const content = data.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
  }

  return "";
}

function stripMarkdownFences(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

function tryParseSpecObject(text: string): SoneSpec | null {
  try {
    const parsed = JSON.parse(text) as SoneSpec;
    if (
      parsed != null &&
      typeof parsed.root === "string" &&
      parsed.elements != null &&
      typeof parsed.elements === "object"
    ) {
      return parsed;
    }
  } catch {
    // Ignore parse errors and fall back to patch compilation.
  }

  return null;
}

function isLooseElementNode(value: unknown): value is {
  type: string;
  props?: Record<string, unknown>;
  children?: unknown[];
} {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function coerceLooseSpecObject(value: unknown): SoneSpec | null {
  if (value == null || typeof value !== "object") {
    return null;
  }

  const rootValue = (value as { root?: unknown }).root;
  if (!isLooseElementNode(rootValue)) {
    return null;
  }

  const elements: Record<string, SoneElement> = {};
  let generatedId = 0;

  const visit = (node: unknown, id: string): string | null => {
    if (!isLooseElementNode(node)) {
      return null;
    }

    const props =
      node.props != null && typeof node.props === "object"
        ? ({ ...(node.props as Record<string, unknown>) } as Record<string, unknown>)
        : {};
    const children: string[] = [];

    for (const child of Array.isArray(node.children) ? node.children : []) {
      if (typeof child === "string") {
        children.push(child);
        continue;
      }

      const childId = `${id}-child-${generatedId++}`;
      const normalizedChildId = visit(child, childId);
      if (normalizedChildId) {
        children.push(normalizedChildId);
      }
    }

    elements[id] = {
      type: node.type as SoneElement["type"],
      props: props as SoneElement["props"],
      children,
    };

    return id;
  };

  const rootId = visit(rootValue, "root");
  if (!rootId) {
    return null;
  }

  return {
    root: rootId,
    elements,
  };
}

function parseOpenAiCompatSpec(text: string): SoneSpec {
  const normalized = stripMarkdownFences(text);

  const compiler = createSpecStreamCompiler<SoneSpec>();
  compiler.push(normalized.endsWith("\n") ? normalized : `${normalized}\n`);
  const compilerResult = compiler.getResult();
  const compiled =
    prepareSpec(compilerResult) ?? prepareSpec(coerceLooseSpecObject(compilerResult));
  if (compiled) {
    return compiled;
  }

  const parsedObject = tryParseSpecObject(normalized);
  const parsed =
    prepareSpec(parsedObject) ?? prepareSpec(coerceLooseSpecObject(parsedObject));
  if (parsed) {
    return parsed;
  }

  const extractedJsonl = extractJsonlPatchLines(normalized);
  if (extractedJsonl) {
    const extractedCompiler = createSpecStreamCompiler<SoneSpec>();
    extractedCompiler.push(
      extractedJsonl.endsWith("\n") ? extractedJsonl : `${extractedJsonl}\n`,
    );
    const extractedCompilerResult = extractedCompiler.getResult();
    const extractedCompiled =
      prepareSpec(extractedCompilerResult) ??
      prepareSpec(coerceLooseSpecObject(extractedCompilerResult));
    if (extractedCompiled) {
      return extractedCompiled;
    }
  }

  throw new Error(
    "OpenAI-compatible endpoint did not return valid JSONL patches or a Sone spec object.",
  );
}

function extractJsonlPatchLines(text: string): string | null {
  const candidates = [
    text,
    text.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n"),
  ];

  for (const candidate of candidates) {
    const lines = candidate
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const patchLines: string[] = [];
    for (const line of lines) {
      if (!line.startsWith("{") || !line.endsWith("}")) {
        continue;
      }

      try {
        const parsed = JSON.parse(line) as {
          op?: unknown;
          path?: unknown;
          value?: unknown;
        };
        if (typeof parsed.path === "string") {
          patchLines.push(
            typeof parsed.op === "string"
              ? line
              : JSON.stringify({
                  op: "add",
                  path: parsed.path,
                  value: parsed.value,
                }),
          );
        }
      } catch {
        // ignore non-JSON lines
      }
    }

    if (patchLines.length > 0) {
      return patchLines.join("\n");
    }
  }
  return null;
}

async function requestG4fSpec(
  payload: GeneratePayload,
  config: StoredLlmConfig,
  runtime: RuntimeOptions,
): Promise<SoneSpec> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system" as const,
      content: createOpenAiCompatSystemPrompt(),
    },
    {
      role: "user" as const,
      content: buildPatchOnlyUserPrompt(payload),
    },
  ];

  for (let attempt = 0; attempt <= MAX_AUTO_REPAIR_ATTEMPTS; attempt += 1) {
    const content = await requestG4fConversationText(messages, config, runtime);
    if (!content.trim()) {
      throw new Error("g4f conversation endpoint returned an empty assistant message.");
    }

    messages.push({ role: "assistant", content });

    try {
      const spec = parseOpenAiCompatSpec(content);
      const issues = validateSoneSpec(spec);
      if (issues.length === 0) {
        return spec;
      }
      if (attempt >= MAX_AUTO_REPAIR_ATTEMPTS) {
        throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
      }
      messages.push({
        role: "user",
        content: buildRepairPrompt(
          payload,
          issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
          attempt + 1,
        ),
      });
    } catch (error) {
      if (attempt >= MAX_AUTO_REPAIR_ATTEMPTS) {
        throw error;
      }
      messages.push({
        role: "user",
        content: buildRepairPrompt(
          payload,
          error instanceof Error ? error.message : String(error),
          attempt + 1,
        ),
      });
    }
  }

  throw new Error("OpenAI-compatible endpoint did not produce a valid spec.");
}

async function requestOpenAiCompatSpec(
  payload: GeneratePayload,
  config: StoredLlmConfig,
  runtime: RuntimeOptions,
): Promise<SoneSpec> {
  return requestOpenAiLikeSpec(payload, config, runtime);
}

async function requestOpenAiLikeSpec(
  payload: GeneratePayload,
  config: StoredLlmConfig,
  runtime: RuntimeOptions,
): Promise<SoneSpec> {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system" as const,
      content: createOpenAiCompatSystemPrompt(),
    },
    {
      role: "user" as const,
      content: buildPatchOnlyUserPrompt(payload),
    },
  ];

  for (let attempt = 0; attempt <= MAX_AUTO_REPAIR_ATTEMPTS; attempt += 1) {
    const body: Record<string, unknown> = {
      messages,
      temperature: 0.4,
      stream: false,
    };
    if (config.model) {
      body.model = config.model;
    }

    const response = await ensureFetch(runtime.fetch)(config.url, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(body),
      signal: runtime.signal,
    });

    if (!response.ok) {
      throw new Error(await readJsonError(response));
    }

    const data = (await response.json()) as OpenAiCompatResponse;
    const content = extractAssistantText(data);
    if (!content.trim()) {
      throw new Error("OpenAI-compatible endpoint returned an empty assistant message.");
    }

    messages.push({ role: "assistant", content });

    try {
      const spec = parseOpenAiCompatSpec(content);
      const issues = validateSoneSpec(spec);
      if (issues.length === 0) {
        return spec;
      }
      if (attempt >= MAX_AUTO_REPAIR_ATTEMPTS) {
        throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
      }
      messages.push({
        role: "user",
        content: buildRepairPrompt(
          payload,
          issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
          attempt + 1,
        ),
      });
    } catch (error) {
      if (attempt >= MAX_AUTO_REPAIR_ATTEMPTS) {
        throw error;
      }
      messages.push({
        role: "user",
        content: buildRepairPrompt(
          payload,
          error instanceof Error ? error.message : String(error),
          attempt + 1,
        ),
      });
    }
  }

  throw new Error("OpenAI-compatible endpoint did not produce a valid spec.");
}

export async function testLlmConnection(
  config: StoredLlmConfig,
  options: Omit<ClientGenerationOptions, "signal" | "config"> = {},
) {
  const runtime = getRuntimeOptions({ ...options, config });
  const normalized = normalizeConfig(config);

  if (!normalized.url) {
    throw new Error("Endpoint URL is required before testing the connection.");
  }

  if (normalized.mode === "sone-chat") {
    const response = await ensureFetch(runtime.fetch)(normalized.url, {
      method: "POST",
      headers: buildHeaders(normalized),
      body: JSON.stringify({ message: TEST_CONNECTION_MESSAGE }),
    });

    if (!response.ok) {
      throw new Error(await readJsonError(response));
    }

    return {
      mode: normalized.mode,
      endpoint: normalized.url,
    };
  }

  if (normalized.mode === "g4f") {
    await requestG4fConversationText(
      [{ role: "user", content: DEFAULT_OPENAI_TEST_MESSAGE }],
      normalized,
      runtime,
    );
    await fetchG4fModels(normalized, runtime);

    return {
      mode: normalized.mode,
      endpoint: normalized.url,
      model: normalized.model || DEFAULT_G4F_MODEL,
    };
  }

  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: DEFAULT_OPENAI_TEST_MESSAGE }],
    stream: false,
    max_tokens: 8,
    temperature: 0,
  };

  if (normalized.model) {
    body.model = normalized.model;
  }

  const response = await ensureFetch(runtime.fetch)(normalized.url, {
    method: "POST",
    headers: buildHeaders(normalized),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readJsonError(response));
  }

  return {
    mode: normalized.mode,
    endpoint: normalized.url,
    model: normalized.model,
  };
}

function resolveActiveConfig(options: RuntimeOptions): StoredLlmConfig {
  if (!options.config) {
    throw new Error(
      "LLM is not configured yet. Open Setup LLM and pass the connection test first.",
    );
  }

  return normalizeConfig(options.config);
}

export async function createGenerationTextStream(
  payload: GeneratePayload,
  options: ClientGenerationOptions = {},
) {
  const request = {
    prompt: typeof payload.prompt === "string" ? payload.prompt.trim() : "",
    previousSpec: payload.previousSpec ?? null,
    fixture: payload.fixture === true,
  };
  const runtime = getRuntimeOptions(options);

  if (request.fixture || request.prompt.length === 0) {
    return createFixtureJsonlStream({ signal: runtime.signal });
  }

  const config = resolveActiveConfig(runtime);
  const spec =
    config.mode === "sone-chat"
      ? await requestSoneChatSpec(request.prompt, config, runtime)
      : config.mode === "g4f"
        ? await requestG4fSpec(request, config, runtime)
        : await requestOpenAiCompatSpec(request, config, runtime);

  return createSpecJsonlStream(spec, { signal: runtime.signal });
}

export async function streamSpec(
  payload: GeneratePayload,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  options: Omit<ClientGenerationOptions, "signal"> = {},
) {
  const compiler = createSpecStreamCompiler<SoneSpec>();
  const stream = await createGenerationTextStream(payload, { ...options, signal });
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const { result, newPatches } = compiler.push(value);
      if (newPatches.length > 0) {
        const prepared = prepareSpec(result);
        callbacks.onSpec(prepared ?? result ?? null);
      }
    }

    const finalResult = compiler.getResult();
    const preparedFinal = prepareSpec(finalResult);
    callbacks.onSpec(preparedFinal ?? finalResult ?? null);
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function generateSpec(
  payload: GeneratePayload,
  signal?: AbortSignal,
  options: Omit<ClientGenerationOptions, "signal"> = {},
) {
  let latest: SoneSpec | null = null;
  await streamSpec(
    payload,
    {
      onSpec: (spec) => {
        latest = spec;
      },
    },
    signal,
    options,
  );
  return latest;
}
