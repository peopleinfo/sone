import { useEffect, useRef } from "react";
import { render, type SoneRenderer as SoneRendererType } from "sone";
import { browserRenderer, previewRenderer } from "@/renderer";
import { specToSoneNode, specToSoneNodeLenient } from "@/spec-to-sone";
import type { SoneSpec } from "@/types";

const MAX_CANVAS_PIXELS = 8_000_000;
const RENDER_YIELD_MS = 60;

export interface SoneRendererProps {
  /** Validated final spec. */
  spec: SoneSpec | null;
  /** Partial streaming spec — rendered with lenient builder. */
  previewSpec?: SoneSpec | null;
  className?: string;
  /** Fires when a new canvas is produced (or null on clear). */
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  /** Fires on render error (or null when cleared). */
  onError?: (error: string | null) => void;
  /** Custom renderer — defaults to browserRenderer. */
  renderer?: SoneRendererType;
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function yieldToMain(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Self-contained Sone spec-to-canvas React component.
 *
 * Analogous to `<Renderer>` from `@json-render/react`, but outputs to an
 * HTML canvas via the Sone render engine instead of DOM components.
 *
 * Internally manages:
 * - Lenient vs strict node building (preview vs final)
 * - Single in-flight render with queued re-render on completion
 * - Canvas memory management and lifecycle cleanup
 */
export function SoneRenderer({
  spec,
  previewSpec,
  className,
  onCanvas,
  onError,
  renderer = browserRenderer,
}: SoneRendererProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const renderingRef = useRef(false);
  const pendingSpecRef = useRef<{ active: SoneSpec; isPreview: boolean } | null>(null);
  const unmountedRef = useRef(false);
  const lastCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const onCanvasRef = useRef(onCanvas);
  const onErrorRef = useRef(onError);
  const rendererRef = useRef(renderer);
  onCanvasRef.current = onCanvas;
  onErrorRef.current = onError;
  rendererRef.current = renderer;

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (lastCanvasRef.current) {
        releaseCanvas(lastCanvasRef.current);
        lastCanvasRef.current = null;
      }
    };
  }, []);

  const activeSpec = previewSpec ?? spec;
  const isPreview = !!previewSpec;

  useEffect(() => {
    const mount = mountRef.current;
    if (!activeSpec) {
      pendingSpecRef.current = null;
      if (mount) {
        while (mount.firstChild) mount.removeChild(mount.firstChild);
      }
      if (lastCanvasRef.current) {
        releaseCanvas(lastCanvasRef.current);
        lastCanvasRef.current = null;
      }
      onCanvasRef.current?.(null);
      onErrorRef.current?.(null);
      return;
    }

    pendingSpecRef.current = { active: activeSpec, isPreview };

    if (renderingRef.current) return;

    async function processQueue() {
      if (renderingRef.current) return;

      while (pendingSpecRef.current && !unmountedRef.current) {
        const { active, isPreview: preview } = pendingSpecRef.current;
        pendingSpecRef.current = null;
        renderingRef.current = true;

        try {
          const node = preview
            ? specToSoneNodeLenient(active)
            : specToSoneNode(active);
          if (!node || unmountedRef.current) continue;

          if (lastCanvasRef.current) {
            releaseCanvas(lastCanvasRef.current);
            lastCanvasRef.current = null;
          }

          const activeRenderer = preview ? previewRenderer : rendererRef.current;
          const canvas = await render<HTMLCanvasElement>(node, activeRenderer);
          if (unmountedRef.current) {
            releaseCanvas(canvas);
            break;
          }

          if (canvas.width * canvas.height > MAX_CANVAS_PIXELS) {
            releaseCanvas(canvas);
            continue;
          }

          lastCanvasRef.current = canvas;

          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.maxWidth = "100%";
          canvas.style.display = "block";

          const m = mountRef.current;
          if (m) {
            while (m.firstChild) m.removeChild(m.firstChild);
            m.appendChild(canvas);
          }
          onCanvasRef.current?.(canvas);
          onErrorRef.current?.(null);
        } catch (error) {
          if (!unmountedRef.current) {
            onErrorRef.current?.(error instanceof Error ? error.message : String(error));
          }
        } finally {
          renderingRef.current = false;
        }

        if (pendingSpecRef.current) {
          await yieldToMain(RENDER_YIELD_MS);
        }
      }
    }

    requestAnimationFrame(() => {
      if (!unmountedRef.current) void processQueue();
    });
  }, [activeSpec, isPreview]);

  return <div ref={mountRef} className={className} />;
}
