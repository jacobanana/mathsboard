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

// Most tools default-export their Tool; three reference tools only name-export.
import { textTool } from "@/tools/text";
import { numberLineTool } from "@/tools/numberline";
import fractionTool from "@/tools/fraction";
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
import noteTool from "@/tools/note";
import worksheetTool from "@/tools/worksheet";
import imageTool from "@/tools/image";

// Gallery order (also the registration order listByCategory preserves).
const ALL_TOOLS = [
  textTool,
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
  // Practice
  worksheetTool,
  // Fractions, decimals & %
  fractionTool,
  fracAmountTool,
  percAmountTool,
  fdpTool,
  // Geometry
  coordGridTool,
  protractorTool,
  // Time
  clockTool,
  // Word problems
  noteTool,
  // Pictures — the upload goes through the backend (/api/upload), so this tool
  // only exists in the collaborative build. The static single-user build omits
  // it rather than offer an insert that can't complete.
  ...(COLLAB_ENABLED ? [imageTool] : []),
];

for (const tool of ALL_TOOLS) registerTool(tool);

// Convenience re-exports so callers can `import { getTool } from "@/tools"`.
export {
  getTool,
  listTools,
  listByCategory,
  registerTool,
} from "@/tools/registry";
export type { Tool, CanvasTool, WidgetTool } from "@/tools/registry";
