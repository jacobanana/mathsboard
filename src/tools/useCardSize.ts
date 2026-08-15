// Keep a widget object's BOX matched to the card its component actually renders.
//
// A widget draws itself as real HTML, so its natural size is whatever the content
// needs — but the board model (selection frame, resize handles, float buttons,
// collision-free placement) only knows obj.w / obj.h. This hook measures the
// rendered card and writes any drift back as LIVE widget state (shared, persisted,
// never an undo step), so model and card can't disagree.
//
// offset sizes are the UNSCALED layout size (the camera scale is a CSS transform,
// which doesn't affect them), and at scale 1 one CSS px is one world unit — so
// they ARE the box.
//
// The card decides how much of its box it owns, purely in CSS:
//   • no width/height set          -> both axes follow the content (the worksheet,
//                                     the vocabulary table).
//   • width: obj.w, height unset   -> the learner sizes the width, the height grows
//                                     with the content (the games; those tools set
//                                     `autoHeight` so only the side handles show).
// Either way the measurement is the same, which is why there is only one hook.

import { useLayoutEffect } from "react";
import type { RefObject } from "react";
import { useBoardStore } from "@/board/store";

export function useCardSize(
  obj: { id: string; w: number; h: number },
  ref: RefObject<HTMLElement | null>,
): void {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  // Compared against the OBJECT's box, not a remembered measurement, and re-run
  // whenever that box changes: the two also drift when the box moves and the
  // render doesn't — squeeze a card past its min-content width and the box shrinks
  // while the card can't, which fires no ResizeObserver callback at all. The
  // correction then puts the box back on the card, so a too-narrow drag settles at
  // the narrowest width the content can actually draw in.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (Math.abs(w - obj.w) > 0.5 || Math.abs(h - obj.h) > 0.5) {
        updateWidgetState(obj.id, { w, h });
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [obj.id, obj.w, obj.h, ref, updateWidgetState]);
}
