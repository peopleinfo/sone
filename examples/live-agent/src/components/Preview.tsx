import { useCallback, useEffect, useState } from "react";
import { browserRenderer } from "@/renderer";
import { SoneRenderer } from "@/components/SoneRenderer";
import type { SoneSpec } from "@/types";

interface PreviewProps {
  spec: SoneSpec | null;
  previewSpec?: SoneSpec | null;
  isRunning: boolean;
  onCanvas?: (canvas: HTMLCanvasElement | null) => void;
  onError?: (error: string | null) => void;
}

export function Preview({ spec, previewSpec, isRunning, onCanvas, onError }: PreviewProps) {
  const [zoom, setZoom] = useState(1);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);

  const handleCanvas = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas) {
        const dpr = browserRenderer.dpr();
        setDimensions({ w: Math.round(canvas.width / dpr), h: Math.round(canvas.height / dpr) });
        setZoom(1);
      } else {
        setDimensions(null);
      }
      onCanvas?.(canvas);
    },
    [onCanvas],
  );

  useEffect(() => {
    if (!spec && !previewSpec) {
      setDimensions(null);
      setZoom(1);
    }
  }, [spec, previewSpec]);

  return (
    <section className="panel preview-panel">
      <header className="panel-header">
        <div>
          <strong>Preview</strong>
          {isRunning ? (
            <span className="meta streaming-badge">Streaming...</span>
          ) : dimensions ? (
            <span className="meta">
              {dimensions.w} x {dimensions.h} px
            </span>
          ) : null}
        </div>
        <div className="zoom-controls">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value / 1.25))}>
            -
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.min(4, value * 1.25))}>
            +
          </button>
        </div>
      </header>

      <div className="preview-canvas-shell">
        {spec || previewSpec ? (
          <div className="preview-center">
            <div
              className="canvas-mount"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
            >
              <SoneRenderer
                spec={spec}
                previewSpec={previewSpec}
                onCanvas={handleCanvas}
                onError={onError}
              />
            </div>
          </div>
        ) : (
          <div className="preview-empty">Generate a design or run the fixture stream.</div>
        )}
      </div>
    </section>
  );
}
