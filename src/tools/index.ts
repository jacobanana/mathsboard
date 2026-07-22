// ASSEMBLY: the tool registry barrel.
//
// Imports every tool module and registers it via registerTool in gallery order.
// This module MUST be imported once at app startup (see src/main.tsx) so the
// registry is populated before the first render reads it (InsertGallery,
// App placement, BoardCanvas draw dispatch).
//
// Tool authors do NOT register themselves; the Assembly phase owns this file.

import { registerTool } from "@/tools/registry";
import { COLLAB_ENABLED } from "@/config";
import { IS_LANGUAGE } from "@/subject";

// Most tools default-export their Tool; three reference tools only name-export.
import { textTool } from "@/tools/text";
import { mathTextTool } from "@/tools/mathtext";
import shapeTool from "@/tools/shape";
import { numberLineTool } from "@/tools/numberline";
import fractionTool from "@/tools/fraction";
import fractionWallTool from "@/tools/fractionwall";
import placeValueTool from "@/tools/placevalue";
import timesTableTool from "@/tools/timestable";
import gridMethodTool from "@/tools/gridmethod";
import longMultTool from "@/tools/longmult";
import shortMultTool from "@/tools/shortmult";
import arrayTool from "@/tools/array";
import areaLatticeTool from "@/tools/arealattice";
import busStopTool from "@/tools/bustop";
import longDivTool from "@/tools/longdiv";
import chunkingTool from "@/tools/chunking";
import coordGridTool from "@/tools/coordgrid";
import protractorTool from "@/tools/protractor";
import fracAmountTool from "@/tools/fracamount";
import { percAmountTool } from "@/tools/percamount";
import fdpTool from "@/tools/fdp";
import clockTool from "@/tools/clock";
import timerTool from "@/tools/timer";
import diceTool from "@/tools/dice";
import moneyTool from "@/tools/money";
import numberOrderTool from "@/tools/numberorder";
import noteTool from "@/tools/note";
import worksheetTool from "@/tools/worksheet";
import flashCardsTool from "@/tools/flashcards";
import imageTool from "@/tools/image";

// Language board tools (registered only on the /language/ build — see below).
import langFlashCardsTool from "@/tools/langflashcards";
import langPhrasesTool from "@/tools/langphrases";
import langTableTool from "@/tools/langtable";
import langMatchTool from "@/tools/langmatch";
import langSentenceTool from "@/tools/langsentence";

// The always-available foundation tools shared by BOTH subjects: free text and
// the draw-tool primitives (maths notation, shapes). They are inGallery:false —
// created by clicking/dragging, not from the gallery — so they belong on every
// board regardless of subject, and the canvas must be able to draw/edit them.
const CORE_TOOLS = [
  textTool,
  mathTextTool,
  shapeTool,
  // Pictures — useful on either board (illustrate a vocab card, drop a diagram).
  // Collab builds only: the upload goes through the backend, so the static
  // single-user build omits it rather than offer an insert that can't complete.
  ...(COLLAB_ENABLED ? [imageTool] : []),
];

// The maths widgets — the original board's gallery.
const MATHS_TOOLS = [
  // Number & calculating (prototype gallery order: place value comes LAST here).
  numberLineTool,
  timesTableTool,
  gridMethodTool,
  longMultTool,
  shortMultTool,
  arrayTool,
  areaLatticeTool,
  busStopTool,
  longDivTool,
  chunkingTool,
  placeValueTool,
  // A rollable 3D die (probability / number games) — a widget overlay, not a
  // canvas tool, but it lives with the number tools in the gallery.
  diceTool,
  // A 3D money mat (count coins & notes) — also a widget overlay in the number
  // section of the gallery.
  moneyTool,
  // A number-ordering game (compare & sort) — tap the biggest/smallest, or put a
  // set of numbers in order. A widget overlay, alongside the other number games.
  numberOrderTool,
  // Practice
  worksheetTool,
  // A colourful flash-cards game — one arithmetic card at a time, flip to check,
  // with a summary at the end. A widget overlay, like the quiz above it.
  flashCardsTool,
  // Fractions, decimals & %
  fractionTool,
  fractionWallTool,
  fracAmountTool,
  percAmountTool,
  fdpTool,
  // Geometry
  coordGridTool,
  protractorTool,
  // Time
  clockTool,
  // A shared 3D-hourglass timer (countdown / stopwatch) — a widget overlay that
  // syncs start/pause/reset and shows a board-wide "Time's up!" to everyone.
  timerTool,
  // Word problems
  noteTool,
];

// The language widgets — the /language/ board's gallery. Gallery order groups
// the study tools (Learn) before the games (Practise).
const LANG_TOOLS = [
  // Learn — words & sentences
  langFlashCardsTool,
  langPhrasesTool,
  langTableTool,
  // Practise — games
  langMatchTool,
  langSentenceTool,
];

// Assemble the registry for THIS subject: the shared core tools plus the maths
// OR the language widgets. A given build only ever draws one subject's tools, so
// the Insert gallery (which reads the registry) shows exactly the right set and
// the two subjects never collide on a tool type.
const ALL_TOOLS = [...CORE_TOOLS, ...(IS_LANGUAGE ? LANG_TOOLS : MATHS_TOOLS)];

for (const tool of ALL_TOOLS) registerTool(tool);

// Convenience re-exports so callers can `import { getTool } from "@/tools"`.
export {
  getTool,
  listTools,
  listByCategory,
  registerTool,
} from "@/tools/registry";
export type { Tool, CanvasTool, WidgetTool } from "@/tools/registry";
