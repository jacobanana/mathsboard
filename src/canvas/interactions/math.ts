// The maths interaction controller — a tap-edit tool (see tapEdit.ts for the
// shared gesture): a tap either re-opens an existing maths-notation object in
// the in-place MathLive editor or creates a fresh empty one and edits it.
// Tap-only (no drag create); pointerdown prewarms the (lazily loaded) editor.

import { id as newId } from "@/board/types";
import { mathTextTool, MATH_BASE_PX } from "@/tools/mathtext";
import { prewarmMathEditor } from "@/canvas/mathEditor";
import { makeTapEditController } from "@/canvas/interactions/tapEdit";

export const mathController = makeTapEditController({
  tool: "math",
  type: "mathtext",
  cursor: "text",

  // Usually a no-op: BoardCanvas prewarms the moment the tool is picked.
  onPress: prewarmMathEditor,

  // A fresh, empty maths object in the current draw colour (like text). The
  // params are the tool's defaults; the real natW/natH land at editor commit.
  // The maths size option maps onto the uniform resize scale, so the box is
  // pre-scaled here — the editor's font-size and the commit box both derive
  // from it.
  create: (st, at) => {
    const params = { ...mathTextTool.defaults(), color: st.color };
    const sz = mathTextTool.size(params);
    const k = st.sizes.math / MATH_BASE_PX;
    return {
      id: newId(),
      type: "mathtext",
      x: at.x,
      y: at.y,
      w: sz.w * k,
      h: sz.h * k,
      ...params,
    };
  },
});
