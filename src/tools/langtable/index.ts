// WIDGET TOOL — "My words": an editable table to capture your own vocabulary
// and sentences with their translations. No dialog — it drops onto the board
// ready to type into; the languages label its two columns from the learner's
// current pair. Row structure is undoable document state; cell text is live
// widget-state per row id (see LangTable.tsx).

import { defineWidgetTool } from "@/tools/registry";
import { currentPair } from "@/lang/store";
import { id as newId } from "@/board/types";
import { LangTable } from "@/tools/langtable/LangTable";

export interface LangTableParams {
  known: string;
  learning: string;
  /** Row order (structural, undoable). Cell text lives as ca:<id>/cb:<id>. */
  rowIds: string[];
  // "hide:a" / "hide:b" (widget state) cover a column for self-testing.
}

export function defaultLangTableParams(): LangTableParams {
  const pair = currentPair();
  return {
    known: pair.known,
    learning: pair.learning,
    // Start with a few blank rows so the table is immediately usable.
    rowIds: [newId(), newId(), newId()],
  };
}

const langTableTool = defineWidgetTool<LangTableParams>({
  kind: "widget",
  type: "langtable",
  name: "My words",
  blurb: "your own words & sentences",
  category: "lang-vocab",
  defaults: defaultLangTableParams,
  // Self-measures its size from its content (like the worksheet), so it is NOT
  // opted into box resizing — it grows as rows are added.
  defaultSize: { w: 320, h: 220 },
  Component: LangTable,
});

export default langTableTool;
