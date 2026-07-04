// HTMLImageElement cache for the maths-notation tool's canvas draw.
//
// Mirrors tools/image/cache.ts: draw() is synchronous, so each distinct LaTeX
// string is rasterised in the background (svg.ts, loaded lazily so the KaTeX
// engine stays out of the eager bundle); when the image becomes ready (or
// fails) the canvas is nudged to repaint by re-wrapping the board mirror -
// the same reference-change signal every other redraw uses.

import { useBoardStore } from "@/board/store";

type MathState = "loading" | "ready" | "error";
interface Entry {
  img: HTMLImageElement | null;
  state: MathState;
}
const cache = new Map<string, Entry>();

let repaintQueued = false;
function requestRepaint(): void {
  if (repaintQueued) return;
  repaintQueued = true;
  setTimeout(() => {
    repaintQueued = false;
    // New board reference (same contents) -> BoardCanvas renderAll. Does not
    // touch dirty/undo - nothing about the document changed.
    useBoardStore.setState((s) => ({ board: { ...s.board } }));
  }, 0);
}

function entry(latex: string): Entry {
  let e = cache.get(latex);
  if (!e) {
    const fresh: Entry = { img: null, state: "loading" };
    cache.set(latex, fresh);
    void import("@/tools/mathtext/svg")
      .then(({ renderMathToImage }) => renderMathToImage(latex))
      .then((img) => {
        fresh.img = img;
        fresh.state = "ready";
      })
      .catch(() => {
        fresh.state = "error";
      })
      .finally(requestRepaint);
    e = fresh;
  }
  return e;
}

/** The rasterised notation if ready, else null (kicks off rendering). */
export function getMathImage(latex: string): HTMLImageElement | null {
  if (!latex) return null;
  const e = entry(latex);
  return e.state === "ready" ? e.img : null;
}

export function mathImageState(latex: string): MathState {
  if (!latex) return "error";
  return entry(latex).state;
}
