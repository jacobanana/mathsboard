// PNG EXPORT (the T3.5 tidy in docs/canvas-app-architecture.md).
//
// BoardCanvas registers its two layer elements here on mount; the shell calls
// exportPNG(). This removes the one place App used to reach into BoardCanvas's
// DOM (querySelector "#stage #template") — the shell no longer knows canvas
// internals.

import { theme } from "@/styles/theme";
import { track } from "@/analytics";

let layers: { template: HTMLCanvasElement; ink: HTMLCanvasElement } | null =
  null;

/** Called by BoardCanvas on mount; returns the matching unregister cleanup. */
export function registerExportLayers(
  template: HTMLCanvasElement,
  ink: HTMLCanvasElement,
): () => void {
  layers = { template, ink };
  return () => {
    if (layers?.template === template) layers = null;
  };
}

/**
 * Composite the two stacked canvases onto a paper-filled buffer and download
 * as PNG. No-op when no canvas is mounted.
 */
export function exportPNG(): void {
  if (!layers) return;
  const { template, ink } = layers;
  const out = document.createElement("canvas");
  out.width = template.width;
  out.height = template.height;
  const o = out.getContext("2d");
  if (!o) return;
  o.fillStyle = theme.paper;
  o.fillRect(0, 0, out.width, out.height);
  o.drawImage(template, 0, 0);
  o.drawImage(ink, 0, 0);
  const a = document.createElement("a");
  a.download = "maths-board-" + new Date().toISOString().slice(0, 10) + ".png";
  a.href = out.toDataURL("image/png");
  a.click();
  track("board_exported");
}
