// ASSEMBLY: register the built-in interaction controllers (mirrors
// src/tools/index.ts for placeable tools). A new interactive tool is one new
// file + one registerInteraction(...) call here — no BoardCanvas edits.

import { registerInteraction } from "@/canvas/interactions/registry";
import { penController, eraserController } from "@/canvas/interactions/brush";
import { selectController } from "@/canvas/interactions/select";
import { panController } from "@/canvas/interactions/pan";
import { textController } from "@/canvas/interactions/text";
import { mathController } from "@/canvas/interactions/math";

registerInteraction(penController);
registerInteraction(eraserController);
registerInteraction(selectController);
registerInteraction(panController);
registerInteraction(textController);
registerInteraction(mathController);

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
