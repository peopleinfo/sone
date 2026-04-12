function triggerDownload(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

export function exportAsPNG(canvas: HTMLCanvasElement, filename = "sone-live-agent") {
  triggerDownload(canvas.toDataURL("image/png"), `${filename}.png`);
}

export function exportAsJPEG(canvas: HTMLCanvasElement, quality = 0.95, filename = "sone-live-agent") {
  triggerDownload(canvas.toDataURL("image/jpeg", quality), `${filename}.jpg`);
}
