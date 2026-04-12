import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { render, type SoneNode } from "sone";
import { streamSpec } from "@/client";
import { Preview } from "@/components/Preview";
import { exportAsJPEG, exportAsPNG } from "@/export";
import { browserRenderer } from "@/renderer";
import { soneCatalog } from "@/catalog";
import { specToSoneNode } from "@/spec-to-sone";
import type { SoneSpec } from "@/types";

const DEFAULT_PROMPT = "Design a clean launch card with a bold title, a short subtitle, two feature bullets, and a primary action area.";

export default function App() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [spec, setSpec] = useState<SoneSpec | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [lastNode, setLastNode] = useState<SoneNode>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const prettySpec = useMemo(() => (spec ? JSON.stringify(spec, null, 2) : ""), [spec]);
  const catalogPrompt = useMemo(
    () =>
      soneCatalog.prompt({
        customRules: [
          "Use compact layouts that fit comfortably in a single image or card-sized canvas.",
          "Prefer Column or Row as the root layout container.",
          "Use the prompt-friendly rows/items shapes for Table and List.",
          "Stay within the documented v1 Sone prop subset.",
        ],
      }),
    [],
  );

  const runStream = useCallback(
    async ({ fixture = false }: { fixture?: boolean } = {}) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsStreaming(true);
      setStreamError(null);

      try {
        await streamSpec(
          "/api/generate",
          { prompt, previousSpec: spec, ...(fixture ? { fixture: true } : {}) },
          {
            onSpec: (next) => setSpec(next),
          },
          controller.signal,
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setStreamError(error instanceof Error ? error.message : String(error));
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsStreaming(false);
        }
      }
    },
    [prompt, spec],
  );

  const handleGenerate = useCallback(() => {
    void runStream();
  }, [runStream]);

  const handleFixture = useCallback(() => {
    void runStream({ fixture: true });
  }, [runStream]);

  const handleReset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSpec(null);
    setCanvas(null);
    setLastNode(null);
    setRenderError(null);
    setStreamError(null);
    setIsStreaming(false);
  }, []);

  const handleExport = useCallback(
    (format: "png" | "jpeg") => {
      if (!canvas) return;
      if (format === "png") exportAsPNG(canvas);
      else exportAsJPEG(canvas);
    },
    [canvas],
  );

  useEffect(() => {
    if (!spec) {
      setCanvas(null);
      setLastNode(null);
      setRenderError(null);
      return;
    }

    let cancelled = false;

    async function renderSpec() {
      try {
        const node = specToSoneNode(spec);
        const nextCanvas = await render<HTMLCanvasElement>(node, browserRenderer);
        if (!cancelled) {
          setLastNode(node);
          setCanvas(nextCanvas);
          setRenderError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void renderSpec();

    return () => {
      cancelled = true;
    };
  }, [spec]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Sone Live Agent</h1>
          <p>Prompt a bounded json-render catalog and preview the translated Sone output.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={handleFixture} disabled={isStreaming}>
            Run fixture
          </button>
          <button type="button" onClick={handleGenerate} disabled={isStreaming}>
            {spec ? "Refine" : "Generate"}
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
        </div>
      </header>

      <main className="workspace">
        <section className="panel prompt-panel">
          <header className="panel-header">
            <strong>Prompt</strong>
          </header>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the design you want..."
          />
          <div className="status-stack">
            {isStreaming ? <div className="status info">Streaming patches...</div> : null}
            {streamError ? <div className="status error">{streamError}</div> : null}
            {renderError ? <div className="status error">{renderError}</div> : null}
          </div>
          <div className="catalog-panel">
            <h2>Catalog Prompt</h2>
            <pre>{catalogPrompt}</pre>
          </div>
        </section>

        <Preview canvas={canvas} isRunning={isStreaming} />

        <section className="panel spec-panel">
          <header className="panel-header">
            <strong>Generated Spec</strong>
            {lastNode ? <span className="meta">Root ready</span> : null}
          </header>
          <pre>{prettySpec || "No spec generated yet."}</pre>
        </section>
      </main>
    </div>
  );
}
