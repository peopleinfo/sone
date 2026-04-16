import {
  DEFAULT_TEXT_PROPS,
  defaultLineBreakerIterator,
  fontBuilder,
  type SoneRenderer,
} from "sone";

export interface RenderDebugOptions {
  layout: boolean;
  text: boolean;
}

const measureCanvas = document.createElement("canvas");
const registeredFonts = new Set<string>();

const sharedMethods: Omit<SoneRenderer, "dpr"> = {
  breakIterator: defaultLineBreakerIterator,

  createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.getContext("2d")?.scale(window.devicePixelRatio, window.devicePixelRatio);
    return canvas;
  },

  measureText(text: string, props: Parameters<SoneRenderer["measureText"]>[1]) {
    const ctx = measureCanvas.getContext("2d")!;
    ctx.font = fontBuilder(props);
    ctx.letterSpacing = `${props.letterSpacing ?? 0}px`;
    ctx.wordSpacing = `${props.wordSpacing ?? 0}px`;
    return ctx.measureText(text);
  },

  hasFont: (name: string) => registeredFonts.has(name),

  async registerFont(name: string, source: string | string[]) {
    const srcs = Array.isArray(source) ? source : [source];
    const face = new FontFace(name, srcs.map((value) => `url(${value})`).join(", "));
    await face.load();
    document.fonts.add(face);
    registeredFonts.add(name);
  },

  async unregisterFont(name: string) {
    for (const face of document.fonts) {
      if (face.family === name || face.family === `"${name}"`) {
        document.fonts.delete(face);
      }
    }
    registeredFonts.delete(name);
  },

  resetFonts() {
    for (const name of registeredFonts) {
      for (const face of document.fonts) {
        if (face.family === name || face.family === `"${name}"`) {
          document.fonts.delete(face);
        }
      }
    }
    registeredFonts.clear();
  },

  async loadImage(src: string | Uint8Array): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (error) => reject(error);

      if (typeof src === "string") {
        img.src = src;
      } else {
        const blob = new Blob([src.buffer as ArrayBuffer]);
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = (error) => {
          URL.revokeObjectURL(url);
          reject(error);
        };
        img.src = url;
      }
    });
  },

  getDefaultTextProps: () => DEFAULT_TEXT_PROPS,
  Path2D,
  debug: () => ({ layout: false, text: false }),
};

export function createRenderer(
  dpr: number,
  debug: RenderDebugOptions = { layout: false, text: false },
): SoneRenderer {
  return { ...sharedMethods, dpr: () => dpr, debug: () => debug };
}

export const browserRenderer: SoneRenderer = createRenderer(window.devicePixelRatio);

/** Low-memory renderer for streaming previews (1x DPR, no retina). */
export const previewRenderer: SoneRenderer = createRenderer(1);
