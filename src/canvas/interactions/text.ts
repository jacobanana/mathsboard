// The text interaction controller — a tap-edit tool (see tapEdit.ts for the
// shared gesture: deferred taps, drag-to-create, straight into the in-place
// editor). Text is the one tool with a DRAG create: rubber-band a rectangle
// to make a fixed-width TEXT BOX whose width is the dragged width — text
// wraps to it and the height grows with the content (the drag height is only
// the intent hint). A plain tap creates AUTO-sizing text (the box hugs the
// text as you type), or re-opens an existing text object.

import { textSizeOf } from "@/canvas/drawHelpers";
import { id as newId } from "@/board/types";
import { makeTapEditController } from "@/canvas/interactions/tapEdit";

/** Smallest wrap width (world px) a dragged box may have — a near-vertical
 *  drag still yields a usable box, not a one-character-per-line sliver. */
const MIN_BOX_W = 48;

export const textController = makeTapEditController({
  tool: "text",
  type: "text",
  cursor: "text",

  // Tap: auto-sizing text at the point, in the current defaults.
  create: (st, at) => {
    const size = st.sizes.text;
    const sz = textSizeOf("", size);
    return {
      id: newId(),
      type: "text",
      x: at.x,
      y: at.y,
      w: sz.w,
      h: sz.h,
      text: "",
      size,
      color: st.color,
      align: st.textAlign,
    };
  },

  // Drag: a fixed-width text box anchored at the rect's top-left, wrapping to
  // the dragged width.
  dragCreate: (st, a, b) => {
    const size = st.sizes.text;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const boxW = Math.max(Math.abs(b.x - a.x), MIN_BOX_W);
    const sz = textSizeOf("", size, boxW);
    return {
      id: newId(),
      type: "text",
      x,
      y,
      w: sz.w,
      h: sz.h,
      text: "",
      size,
      color: st.color,
      align: st.textAlign,
      boxW,
    };
  },
});
