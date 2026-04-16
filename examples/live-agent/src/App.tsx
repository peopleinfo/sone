import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearStoredLlmConfig,
  DEFAULT_CHAT_ENDPOINT,
  DEFAULT_G4F_CHAT_ENDPOINT,
  DEFAULT_G4F_MODEL,
  getDefaultLlmConfig,
  isG4fDefaultEndpoint,
  persistStoredLlmConfig,
  readStoredLlmConfig,
  streamSpec,
  TEST_CONNECTION_MESSAGE,
  testLlmConnection,
  type ChatAttachment,
  type LlmBackendMode,
  type StoredLlmConfig,
} from "@/client";
import { Preview } from "@/components/Preview";
import { exportAsJPEG, exportAsPNG } from "@/export";
import { soneCatalog } from "@/catalog";
import type { SoneSpec } from "@/types";

const IMAGE_MIME = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
]);
const DOC_MIME = new Set([
  "text/plain", "text/csv", "text/markdown", "text/x-markdown", "application/json",
]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const DOC_EXTENSIONS = new Set(["txt", "csv", "md", "json"]);

const ALL_ACCEPTED = [
  ...IMAGE_MIME, ...DOC_MIME,
  ...Array.from(IMAGE_EXTENSIONS, (e) => `.${e}`),
  ...Array.from(DOC_EXTENSIONS, (e) => `.${e}`),
].join(",");

const MAX_FILE_SIZE_MB = 10;
const MAX_ATTACHMENTS = 10;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_QUALITY = 0.85;

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function isImageFile(file: File): boolean {
  if (IMAGE_MIME.has(file.type)) return true;
  return IMAGE_EXTENSIONS.has(fileExtension(file.name));
}

function isDocFile(file: File): boolean {
  if (DOC_MIME.has(file.type)) return true;
  return DOC_EXTENSIONS.has(fileExtension(file.name));
}

function isSupportedFile(file: File): boolean {
  return isImageFile(file) || isDocFile(file);
}

interface PendingAttachment {
  file: File;
  name: string;
  kind: "image" | "document";
  objectUrl: string;
}

function createPendingAttachment(file: File): PendingAttachment {
  return {
    file,
    name: file.name,
    kind: isImageFile(file) ? "image" : "document",
    objectUrl: URL.createObjectURL(file),
  };
}

function revokePendingAttachments(items: PendingAttachment[]) {
  for (const item of items) {
    URL.revokeObjectURL(item.objectUrl);
  }
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for resizing"));
    img.src = src;
  });
}

async function resizeImageToDataUrl(file: File, objectUrl: string): Promise<string> {
  const img = await loadImage(objectUrl);
  const { naturalWidth: w, naturalHeight: h } = img;

  if (w <= MAX_IMAGE_DIMENSION && h <= MAX_IMAGE_DIMENSION) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  const scale = MAX_IMAGE_DIMENSION / Math.max(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const isPng = file.type === "image/png" || fileExtension(file.name) === "png";
  const outputType = isPng ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(outputType, IMAGE_QUALITY);

  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
}

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  gif: "image/gif", webp: "image/webp",
  txt: "text/plain", csv: "text/csv", md: "text/markdown", json: "application/json",
};

function resolveMime(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  return EXT_TO_MIME[fileExtension(file.name)] ?? "application/octet-stream";
}

async function pendingToApiAttachment(att: PendingAttachment): Promise<ChatAttachment> {
  const mimeType = resolveMime(att.file);
  if (att.kind === "image") {
    const dataUrl = await resizeImageToDataUrl(att.file, att.objectUrl);
    return { name: att.name, kind: "image", mimeType, dataUrl };
  }

  const textContent = await readFileAsText(att.file);
  return {
    name: att.name,
    kind: "document",
    mimeType,
    dataUrl: "",
    textContent,
  };
}

const DEFAULT_PROMPT =
  "Design a fancy primary button component with a subtle gradient background, rounded corners, bold label text, and a small supporting caption below it.";
const OLLAMA_EXAMPLE_URL = "http://localhost:11434/v1/chat/completions";
const LM_STUDIO_EXAMPLE_URL = "http://localhost:1234/v1/chat/completions";

type ConnectionState =
  | { status: "idle"; message: string }
  | { status: "testing"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function modeLabel(mode: LlmBackendMode) {
  if (mode === "sone-chat") return "Local Sone backend";
  if (mode === "g4f") return "g4f";
  return "OpenAI-compatible";
}

function modeSupportsAttachments(mode: LlmBackendMode | undefined): boolean {
  return mode === "g4f" || mode === "openai-compatible";
}

function formatEndpointDisplay(url: string, maxLength = 52) {
  if (url.length <= maxLength) return url;
  return "...";
}

export default function App() {
  const [storedConfig, setStoredConfig] = useState<StoredLlmConfig | null>(() =>
    readStoredLlmConfig(),
  );
  const [draftConfig, setDraftConfig] = useState<StoredLlmConfig>(() =>
    getDefaultLlmConfig(),
  );
  const [isChatReady, setIsChatReady] = useState(() => readStoredLlmConfig() != null);
  const [isSpecVisible, setIsSpecVisible] = useState(false);
  const [isCatalogPromptVisible, setIsCatalogPromptVisible] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [spec, setSpec] = useState<SoneSpec | null>(null);
  const [previewSpec, setPreviewSpec] = useState<SoneSpec | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const previewThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPreviewRef = useRef<SoneSpec | null>(null);
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: "idle",
    message: "",
  });
  const [renderError, setRenderError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const attachmentsEnabled = modeSupportsAttachments(storedConfig?.mode);

  useEffect(() => {
    if (!attachmentsEnabled && attachments.length > 0) {
      revokePendingAttachments(attachments);
      setAttachments([]);
    }
  }, [attachmentsEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const prettySpec = useMemo(() => (spec ? JSON.stringify(spec, null, 2) : ""), [spec]);
  const catalogPrompt = useMemo(
    () =>
      soneCatalog.prompt({
        customRules: [
          "Use compact layouts that fit comfortably in a single image or card-sized canvas.",
          "Prefer Column or Row as the root layout container; use root id root and ensure elements.root exists.",
          "Use the prompt-friendly rows/items shapes for Table and List.",
          "Stay within the documented v1 Sone prop subset (e.g. background not color on containers).",
        ],
      }),
    [],
  );

  const openSetupDialog = useCallback(() => {
    setDraftConfig(storedConfig ?? getDefaultLlmConfig());
    setConnectionState({ status: "idle", message: "" });
    setIsSetupDialogOpen(true);
  }, [storedConfig]);

  const flushPreview = useCallback(() => {
    if (previewThrottleRef.current !== null) {
      clearTimeout(previewThrottleRef.current);
      previewThrottleRef.current = null;
    }
    setPreviewSpec(pendingPreviewRef.current);
    pendingPreviewRef.current = null;
  }, []);

  const throttledSetPreview = useCallback((next: SoneSpec | null) => {
    pendingPreviewRef.current = next;
    if (next === null) {
      flushPreview();
      return;
    }
    if (previewThrottleRef.current !== null) return;
    previewThrottleRef.current = setTimeout(flushPreview, 800);
  }, [flushPreview]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    const accepted: File[] = [];
    const skipped: string[] = [];

    for (const f of Array.from(files)) {
      if (f.size > maxBytes) {
        skipped.push(`${f.name} (too large)`);
      } else if (!isSupportedFile(f)) {
        skipped.push(`${f.name} (unsupported type)`);
      } else {
        accepted.push(f);
      }
    }

    if (skipped.length > 0) {
      setStreamError(`Skipped: ${skipped.join(", ")}`);
    }
    if (accepted.length === 0) return;

    setAttachments((prev) => {
      const totalCount = prev.length + accepted.length;
      if (totalCount > MAX_ATTACHMENTS) {
        setStreamError(`Too many attachments (max ${MAX_ATTACHMENTS}).`);
        return prev;
      }
      const totalSize =
        prev.reduce((s, a) => s + a.file.size, 0) +
        accepted.reduce((s, f) => s + f.size, 0);
      if (totalSize > MAX_TOTAL_BYTES) {
        setStreamError(`Total attachment size exceeds ${MAX_TOTAL_BYTES / 1024 / 1024} MB.`);
        return prev;
      }
      return [...prev, ...accepted.map(createPendingAttachment)];
    });
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.objectUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const runStream = useCallback(async () => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsStreaming(true);
      setStreamError(null);

      try {
        let apiAttachments: ChatAttachment[] | undefined;
        if (attachments.length > 0) {
          apiAttachments = await Promise.all(attachments.map(pendingToApiAttachment));
        }

        await streamSpec(
          { prompt, previousSpec: spec, attachments: apiAttachments },
          {
            onSpec: (next) => setSpec(next),
            onPartialSpec: throttledSetPreview,
          },
          controller.signal,
          storedConfig ? { config: storedConfig } : {},
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setStreamError(error instanceof Error ? error.message : String(error));
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsStreaming(false);
          if (previewThrottleRef.current !== null) {
            clearTimeout(previewThrottleRef.current);
            previewThrottleRef.current = null;
          }
          pendingPreviewRef.current = null;
          setPreviewSpec(null);
        }
      }
    }, [prompt, spec, storedConfig, throttledSetPreview, attachments]);

  const handleSend = useCallback(() => {
    if (!isChatReady || !storedConfig) {
      setStreamError(null);
      openSetupDialog();
      return;
    }

    void runStream();
  }, [isChatReady, openSetupDialog, runStream, storedConfig]);

  const handleReset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    if (previewThrottleRef.current !== null) {
      clearTimeout(previewThrottleRef.current);
      previewThrottleRef.current = null;
    }
    pendingPreviewRef.current = null;
    setSpec(null);
    setPreviewSpec(null);
    setCanvas(null);
    setRenderError(null);
    setStreamError(null);
    setIsStreaming(false);
    setAttachments((prev) => {
      revokePendingAttachments(prev);
      return [];
    });
  }, []);

  const handleCloseSetupDialog = useCallback(() => {
    setIsSetupDialogOpen(false);
  }, []);

  const handleModeChange = useCallback((mode: LlmBackendMode) => {
    setDraftConfig((current) => {
      if (mode === "sone-chat") {
        return {
          ...current,
          mode,
          url: DEFAULT_CHAT_ENDPOINT,
          model: "",
          apiKey: "",
        };
      }
      if (mode === "g4f") {
        return {
          ...current,
          mode,
          url: DEFAULT_G4F_CHAT_ENDPOINT,
          model: DEFAULT_G4F_MODEL,
          apiKey: "",
        };
      }
      const url =
        current.mode === "g4f" || isG4fDefaultEndpoint(current.url)
          ? OLLAMA_EXAMPLE_URL
          : current.url;
      return {
        ...current,
        mode,
        url,
        model: current.mode === "g4f" ? "" : current.model,
      };
    });
  }, []);

  const handleTestConnection = useCallback(async () => {
    setConnectionState({ status: "testing", message: "Testing LLM connection..." });

    try {
      const result = await testLlmConnection(draftConfig);
      const saved = persistStoredLlmConfig(draftConfig);
      setStoredConfig(saved);
      setIsChatReady(true);
      setConnectionState({
        status: "success",
        message: `Connection successful. Saved ${modeLabel(result.mode)} at ${result.endpoint}.`,
      });
      setIsSetupDialogOpen(false);
    } catch (error) {
      setConnectionState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [draftConfig]);

  const handleClearSavedConnection = useCallback(() => {
    clearStoredLlmConfig();
    setStoredConfig(null);
    setIsChatReady(false);
    setDraftConfig(getDefaultLlmConfig());
    setConnectionState({ status: "idle", message: "" });
    setIsSetupDialogOpen(false);
  }, []);

  const handleExport = useCallback(
    (format: "png" | "jpeg") => {
      if (!canvas) return;
      if (format === "png") exportAsPNG(canvas);
      else exportAsJPEG(canvas);
    },
    [canvas],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Sone Live Agent</h1>
          <p>
            Prompt a bounded{" "}
            <a
              href="https://github.com/vercel-labs/json-render"
              target="_blank"
              rel="noreferrer"
            >
              json-render
            </a>{" "}
            catalog and preview the translated Sone output entirely in the browser.
          </p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className={storedConfig ? "primary-button" : undefined}
            onClick={openSetupDialog}
          >
            {storedConfig ? "LLM Settings" : "Setup LLM"}
          </button>
          <button type="button" onClick={handleReset} disabled={isStreaming && !spec}>
            Reset
          </button>
          <button type="button" onClick={() => handleExport("png")} disabled={!canvas}>
            Export PNG
          </button>
          <button type="button" onClick={() => handleExport("jpeg")} disabled={!canvas}>
            Export JPG
          </button>
          <button type="button" onClick={() => setIsSpecVisible((value) => !value)}>
            {isSpecVisible ? "Hide Spec" : "Show Spec"}
          </button>
        </div>
      </header>

      <main className={`workspace${isSpecVisible ? "" : " workspace-spec-hidden"}`}>
        <section className="panel prompt-panel">
          <header className="panel-header">
            <strong>Prompt</strong>
          </header>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the design you want..."
            onDrop={(event) => {
              if (attachmentsEnabled && event.dataTransfer.files.length > 0) {
                event.preventDefault();
                void handleFiles(event.dataTransfer.files);
              }
            }}
            onDragOver={(event) => {
              if (attachmentsEnabled && event.dataTransfer.types.includes("Files")) event.preventDefault();
            }}
          />
          {attachments.length > 0 && (
            <div className="attachment-list">
              {attachments.map((att, i) => (
                <div key={`${att.name}-${i}`} className="attachment-chip">
                  {att.kind === "image" ? (
                    <img
                      src={att.objectUrl}
                      alt={att.name}
                      className="attachment-thumb"
                    />
                  ) : (
                    <span className="attachment-doc-icon">&#128196;</span>
                  )}
                  <span className="attachment-name" title={att.name}>
                    {att.name}
                  </span>
                  <button
                    type="button"
                    className="attachment-remove"
                    onClick={() => removeAttachment(i)}
                    aria-label={`Remove ${att.name}`}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ALL_ACCEPTED}
            multiple
            className="sr-only"
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="panel-actions">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || !attachmentsEnabled}
              title={
                attachmentsEnabled
                  ? "Attach images or documents"
                  : storedConfig
                    ? `${modeLabel(storedConfig.mode)} does not support file attachments`
                    : "Connect an LLM first"
              }
            >
              Attach File
            </button>
            <button
              type="button"
              className={storedConfig ? "primary-button" : undefined}
              onClick={handleSend}
              disabled={isStreaming}
            >
              Send
            </button>
          </div>
          <div className="status-stack">
            {!storedConfig ? (
              <div className="status info status-compact">
                <div className="status-row">
                  <strong>LLM not connected</strong>
                  <button
                    type="button"
                    className="status-action"
                    onClick={openSetupDialog}
                  >
                    Setup LLM
                  </button>
                </div>
                <div className="status-meta">
                  Click <code>Send</code> or <code>Setup LLM</code> to connect.
                  Connection details are shown in the setup dialog.
                </div>
              </div>
            ) : (
              <div className="status success status-compact">
                <div className="status-row">
                  <strong>{modeLabel(storedConfig.mode)}</strong>
                  <button
                    type="button"
                    className="status-action"
                    onClick={openSetupDialog}
                  >
                    Edit
                  </button>
                </div>
                <div className="status-meta">
                  <code title={storedConfig.url}>
                    {formatEndpointDisplay(storedConfig.url)}
                  </code>
                  {storedConfig.model ? (
                    <>
                      {" "}
                      · model <code>{storedConfig.model}</code>
                    </>
                  ) : null}
                </div>
              </div>
            )}
            {isStreaming ? (
              <div className="status info">Streaming patches...</div>
            ) : null}
            {streamError ? <div className="status error">{streamError}</div> : null}
            {renderError ? <div className="status error">{renderError}</div> : null}
            {connectionState.status === "success" ? (
              <div className="status success">{connectionState.message}</div>
            ) : null}
          </div>
          <div className="catalog-panel">
            <div className="panel-header">
              <h2>Catalog Prompt</h2>
              <button
                type="button"
                onClick={() => setIsCatalogPromptVisible((value) => !value)}
              >
                {isCatalogPromptVisible ? "Collapse" : "Expand"}
              </button>
            </div>
            {isCatalogPromptVisible ? <pre>{catalogPrompt}</pre> : null}
          </div>
        </section>

        <Preview
          spec={spec}
          previewSpec={previewSpec}
          isRunning={isStreaming}
          onCanvas={setCanvas}
          onError={setRenderError}
        />

        {isSpecVisible ? (
          <section className="panel spec-panel">
            <header className="panel-header">
              <strong>Generated Spec</strong>
              <div className="panel-actions">
                {spec ? <span className="meta">Root ready</span> : null}
                <button type="button" onClick={() => setIsSpecVisible(false)}>
                  Collapse
                </button>
              </div>
            </header>
            <pre>{prettySpec || "No spec generated yet."}</pre>
          </section>
        ) : null}
      </main>

      {isSetupDialogOpen ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onClick={handleCloseSetupDialog}
        >
          <dialog
            className="setup-dialog"
            open
            aria-labelledby="llm-setup-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="llm-setup-title">Setup LLM</h2>
            <p>
              Choose <strong>g4f</strong> (default), a local Sone backend, or
              another OpenAI-compatible endpoint. Settings are saved only after
              the connection test passes.
            </p>

            <div className="setup-form">
              <label className="setup-field">
                <span>Connection Type</span>
                <select
                  value={draftConfig.mode}
                  onChange={(event) =>
                    handleModeChange(event.target.value as LlmBackendMode)
                  }
                >
                  <option value="g4f">g4f (default)</option>
                  <option value="sone-chat">Local Sone backend</option>
                  <option value="openai-compatible">OpenAI-compatible</option>
                </select>
              </label>

              <label className="setup-field">
                <span>Endpoint URL</span>
                <input
                  type="text"
                  value={draftConfig.url}
                  onChange={(event) =>
                    setDraftConfig((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                  placeholder={
                    draftConfig.mode === "sone-chat"
                      ? DEFAULT_CHAT_ENDPOINT
                      : draftConfig.mode === "g4f"
                        ? DEFAULT_G4F_CHAT_ENDPOINT
                        : OLLAMA_EXAMPLE_URL
                  }
                />
              </label>

              {draftConfig.mode === "sone-chat" ? null : (
                <>
                  <label className="setup-field">
                    <span>Model (Optional)</span>
                    <input
                      type="text"
                      value={draftConfig.model || ""}
                      onChange={(event) =>
                        setDraftConfig((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                      placeholder="openai, deepseek-v3, openai/gpt-4o-mini"
                    />
                  </label>

                  <label className="setup-field">
                    <span>API Key (Optional)</span>
                    <input
                      type="password"
                      value={draftConfig.apiKey || ""}
                      onChange={(event) =>
                        setDraftConfig((current) => ({
                          ...current,
                          apiKey: event.target.value,
                        }))
                      }
                      placeholder="Leave blank for Ollama or LM Studio if not required"
                      autoComplete="off"
                    />
                  </label>
                </>
              )}
            </div>

            {draftConfig.mode === "sone-chat" ? (
              <pre>{`curl -X 'POST' \\\n  '${draftConfig.url || DEFAULT_CHAT_ENDPOINT}' \\\n  -H 'accept: application/json' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\n  \"message\": \"${TEST_CONNECTION_MESSAGE}\"\n}'`}</pre>
            ) : draftConfig.mode === "g4f" ? (
              <div className="setup-hint">
                <div>
                  Default connection: <code>{DEFAULT_G4F_CHAT_ENDPOINT}</code>
                </div>
                <div>
                  Default model: <code>{DEFAULT_G4F_MODEL}</code>
                </div>
                <div>
                  Uses g4f public-key bootstrap, conversation SSE, and model discovery.
                </div>
              </div>
            ) : (
              <div className="setup-hint">
                <div>Examples:</div>
                <div>
                  Vercel AI Gateway model format:{" "}
                  <code>provider/model-name</code> (for example{" "}
                  <code>openai/gpt-4o-mini</code>)
                </div>
                <div>
                  Ollama: <code>{OLLAMA_EXAMPLE_URL}</code>
                </div>
                <div>
                  LM Studio: <code>{LM_STUDIO_EXAMPLE_URL}</code>
                </div>
                <div>
                  API key can stay blank for local servers that do not require
                  authentication.
                </div>
              </div>
            )}

            {connectionState.status === "testing" ? (
              <div className="status info">{connectionState.message}</div>
            ) : null}
            {connectionState.status === "error" ? (
              <div className="status error">{connectionState.message}</div>
            ) : null}

            <div className="setup-dialog-actions">
              {storedConfig ? (
                <button type="button" onClick={handleClearSavedConnection}>
                  Clear Saved LLM
                </button>
              ) : null}
              <button type="button" onClick={handleCloseSetupDialog}>
                Close
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleTestConnection}
              >
                Test Connection & Save
              </button>
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
}
