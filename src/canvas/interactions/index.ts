// ASSEMBLY: register the built-in interaction controllers (mirrors
// src/tools/index.ts for placeable tools). A new interactive tool is one new
// file + one registerInteraction(...) call here — no BoardCanvas edits.

import { registerInteraction } from "@/canvas/interactions/registry";
import { eraserController } from "@/canvas/interactions/brush";
import { drawController } from "@/canvas/interactions/draw";
import { selectController } from "@/canvas/interactions/select";
import { panController } from "@/canvas/interactions/pan";
import { textController } from "@/canvas/interactions/text";
import { mathController } from "@/canvas/interactions/math";
import { laserController } from "@/canvas/interactions/laser";

// The draw controller owns the "pen" tool: freehand delegates to the brush
// controller, the shape modes drag-create shape objects (roadmap A2).
registerInteraction(drawController);
registerInteraction(eraserController);
registerInteraction(selectController);
registerInteraction(panController);
registerInteraction(textController);
registerInteraction(mathController);
registerInteraction(laserController);

export {
  getInteraction,
  listInteractions,
  registerInteraction,
} from "@/canvas/interactions/registry";
export type {
  InputCtx,
  InteractionController,
  OverlayKit,
  Pt,
  InPlaceEditorHandle,
} from "@/canvas/interactions/types";
