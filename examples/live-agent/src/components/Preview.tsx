import { useEffect, useRef, useState } from "react";
import { browserRenderer } from "@/renderer";

interface PreviewProps {
  canvas: HTMLCanvasElement | null;
  isRunning: boolean;
}

export function Preview({ canvas, isRunning }: PreviewProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (canvas) setZoom(1);
  }, [canvas]);

  return (
    <section className="panel preview-panel">
      <header className="panel-header">
        <div>
          <strong>Preview</strong>
          {isRunning ? (
            <span className="meta streaming-badge">Streaming...</span>
          ) : canvas ? (
            <span className="meta">
              {Math.round(canvas.width / browserRenderer.dpr())} x {Math.round(canvas.height / browserRenderer.dpr())} px
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
        {canvas ? (
          <div className="preview-center">
            <CanvasDisplay canvas={canvas} zoom={zoom} />
          </div>
        ) : (
          <div className="preview-empty">Generate a design or run the fixture stream.</div>
        )}
      </div>
    </section>
  );
}

function CanvasDisplay({ canvas, zoom }: { canvas: HTMLCanvasElement; zoom: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    while (mount.firstChild) mount.removeChild(mount.firstChild);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.maxWidth = "100%";
    canvas.style.display = "block";
    mount.appendChild(canvas);
  }, [canvas]);

  return (
    <div
      className="canvas-mount"
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: "top center",
      }}
    >
      <div ref={mountRef} />
    </div>
  );
}
