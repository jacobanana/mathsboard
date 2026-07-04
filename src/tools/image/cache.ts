// HTMLImageElement cache for the image tool's canvas draw.
//
// draw() is synchronous, so images load in the background here; when one
// becomes ready (or fails) the canvas is nudged to repaint by re-wrapping the
// board mirror - the same reference-change signal every other redraw uses.

import { useBoardStore } from "@/board/store";

type ImgState = "loading" | "ready" | "error";
const cache = new Map<string, { img: HTMLImageElement; state: ImgState }>();

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

function entry(url: string) {
  let e = cache.get(url);
  if (!e) {
    const img = new Image();
    const fresh = { img, state: "loading" as ImgState };
    cache.set(url, fresh);
    img.onload = () => {
      fresh.state = "ready";
      requestRepaint();
    };
    img.onerror = () => {
      fresh.state = "error";
      requestRepaint();
    };
    img.src = url;
    e = fresh;
  }
  return e;
}

/** The decoded image if ready, else null (kicks off loading). */
export function getImageEl(url: string): HTMLImageElement | null {
  if (!url) return null;
  const e = entry(url);
  return e.state === "ready" ? e.img : null;
}

export function imageState(url: string): ImgState {
  if (!url) return "error";
  return entry(url).state;
}
