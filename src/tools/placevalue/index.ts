// CanvasTool (canvas + dialog). Interactive, multi-mode place-value table.
//
// FOUR modes (see PlaceValueParams.mode):
//   - fill        : each place column is a type-in cell; the assembled number
//                   reads out below the table. Free entry (no marking).
//   - wordsToNum  : a target shown in WORDS on top; pupil types the digits into
//                   the column cells; each cell marked against the target digit.
//   - numToWords  : the target's digits are shown read-only in the columns; pupil
//                   types the number in WORDS below (marked via wordsMatch).
//   - decompose   : the target shown; an interactive expanded form below the
//                   table — "1234 = [1000] + [200] + [30] + [4]" (marked).
//
// Typed values live as widget state ("ans:<key>") on the object, rendered by the
// shared InputOverlayLayer; draw() reads them back for the fill read-out. Columns
// scale from Ones to Billions (words.ts). Legacy objects saved by the old tool as
// { key, cols } render unchanged through drawLegacy (see resolvePV).

import { defineCanvasTool, type InputFieldSpec } from "@/tools/registry";
import { clamp } from "@/board/geometry";
import {
  fillPanel,
  partition,
  measureTextWidth,
  wrapMeasured,
  FONT,
} from "@/canvas/drawHelpers";
import { colsFor, digitStr, toWords } from "@/tools/placevalue/words";
import { PlaceValueDialog } from "@/tools/placevalue/Dialog";

export type PlaceValueMode = "fill" | "wordsToNum" | "numToWords" | "decompose";

export interface PlaceValueParams {
  mode: PlaceValueMode;
  places: number; // 1..10 integer columns (Ones..Billions)
  decimals: number; // 0..3 decimal columns
  target?: number; // present only for the quiz modes
}

// --- geometry constants (natural coords) ----------------------------------
const UNIT = 54; // integer / decimal-place column width (matches legacy)
const DOTW = 20; // "." separator column
const HEAD_H = 34; // column-label band
const CELL_H = 52; // entry / given-digit row
const DBOXW = 66; // decompose addend box
const DBOXH = 34;
const PLUSW = 26; // gap that holds a "+" between decompose boxes

const MODES: readonly string[] = ["fill", "wordsToNum", "numToWords", "decompose"];

type PVConf =
  | { legacy: true; cols: string[] }
  | {
      legacy: false;
      mode: PlaceValueMode;
      places: number;
      decimals: number;
      target: number;
      cols: string[];
    };

/**
 * Normalise a stored object's params into a config the layout code can use. New
 * objects carry `mode`; anything else is a legacy { key, cols } object rendered
 * by the preserved old path (no inputs). Kept tolerant so a malformed record
 * never throws in draw/size.
 */
function resolvePV(p: Record<string, unknown>): PVConf {
  if (typeof p.mode === "string" && MODES.includes(p.mode)) {
    const mode = p.mode as PlaceValueMode;
    const pl = Number(p.places);
    const de = Number(p.decimals);
    const places = clamp(Math.round(Number.isFinite(pl) ? pl : 4), 1, 10);
    let decimals = clamp(Math.round(Number.isFinite(de) ? de : 0), 0, 3);
    if (mode === "decompose") decimals = 0; // decompose is integer-only
    const t = Number(p.target);
    const target = Number.isFinite(t) ? t : 0;
    return { legacy: false, mode, places, decimals, target, cols: colsFor(places, decimals) };
  }
  const cols =
    Array.isArray(p.cols) && p.cols.length ? (p.cols as string[]) : ["Th", "H", "T", "O"];
  return { legacy: true, cols };
}

interface Layout {
  cols: string[];
  xs: number[];
  tableW: number;
  promptLines: string[]; // wordsToNum prompt (empty otherwise)
  tableTop: number;
  rowTop: number;
  footTop: number;
  footH: number;
  totalW: number;
  totalH: number;
  // decompose extras (empty parts otherwise)
  parts: number[];
  decStartX: number;
  decBoxY: number;
}

/** The single geometry source shared by size(), draw() and inputs.fields(). */
function layoutNew(c: Extract<PVConf, { legacy: false }>): Layout {
  const cols = c.cols;
  const xs: number[] = [];
  let cx = 0;
  cols.forEach((col) => {
    xs.push(cx);
    cx += col === "." ? DOTW : UNIT;
  });
  const tableW = cx;

  // Words prompt band (wordsToNum only).
  let promptLines: string[] = [];
  let promptH = 0;
  if (c.mode === "wordsToNum") {
    const wrapW = Math.max(tableW, 260);
    promptLines = wrapMeasured(toWords(c.target, c.decimals), wrapW, "600 16px " + FONT);
    promptH = 14 + promptLines.length * 22 + 8;
  }

  const tableTop = promptH;
  const rowTop = promptH + HEAD_H;
  const footTop = rowTop + CELL_H;

  // Footer band + total width per mode.
  let footH: number;
  let totalW: number;
  let parts: number[] = [];
  let decStartX = 0;
  let decBoxY = 0;
  if (c.mode === "fill") {
    footH = 44;
    totalW = tableW;
  } else if (c.mode === "wordsToNum") {
    footH = 10;
    totalW = tableW;
  } else if (c.mode === "numToWords") {
    footH = 62; // label line + 34px input + pad
    totalW = Math.max(tableW, 340);
  } else {
    // decompose
    parts = partition(Math.trunc(c.target));
    decStartX = measureTextWidth(String(Math.trunc(c.target)) + " =", "700 20px " + FONT) + 12;
    const footerW = decStartX + parts.length * DBOXW + (parts.length - 1) * PLUSW + 8;
    footH = 56;
    decBoxY = footTop + (footH - DBOXH) / 2;
    totalW = Math.max(tableW, footerW);
  }

  return {
    cols,
    xs,
    tableW,
    promptLines,
    tableTop,
    rowTop,
    footTop,
    footH,
    totalW,
    totalH: footTop + footH,
    parts,
    decStartX,
    decBoxY,
  };
}

// --- drawing helpers ------------------------------------------------------

/** Column frame, header divider, separators, labels and decimal-point dots. */
function drawTable(
  ctx: CanvasRenderingContext2D,
  font: string,
  lineInk: string,
  o: { x: number; y: number },
  L: Layout,
): void {
  const tblTopY = o.y + L.tableTop;
  const rowY = o.y + L.rowTop;
  const footY = o.y + L.footTop;

  // Outer frame around labels + entry row (its bottom edge is the answer line).
  ctx.strokeStyle = lineInk;
  ctx.lineWidth = 2;
  ctx.strokeRect(o.x, tblTopY, L.tableW, L.footTop - L.tableTop);

  // Header divider under the labels.
  ctx.strokeStyle = "#9DB6B4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(o.x, rowY);
  ctx.lineTo(o.x + L.tableW, rowY);
  ctx.stroke();

  // Vertical column separators.
  ctx.strokeStyle = "#C3D4D2";
  ctx.lineWidth = 1;
  L.cols.forEach((_c, i) => {
    if (i === 0) return;
    ctx.beginPath();
    ctx.moveTo(o.x + L.xs[i], tblTopY);
    ctx.lineTo(o.x + L.xs[i], footY);
    ctx.stroke();
  });

  // Labels (skip the "." column).
  ctx.fillStyle = "#5C7A78";
  ctx.font = "700 13px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  L.cols.forEach((c, i) => {
    if (c === ".") return;
    ctx.fillText(c, o.x + L.xs[i] + UNIT / 2, tblTopY + 22);
  });

  // Decimal-point dot markers in the entry row.
  ctx.fillStyle = lineInk;
  L.cols.forEach((c, i) => {
    if (c !== ".") return;
    ctx.beginPath();
    ctx.arc(o.x + L.xs[i] + DOTW / 2, rowY + CELL_H * 0.6, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Paint the target's digits read-only in the entry row (numToWords/decompose). */
function drawGivenDigits(
  ctx: CanvasRenderingContext2D,
  font: string,
  lineInk: string,
  o: { x: number; y: number },
  c: Extract<PVConf, { legacy: false }>,
  L: Layout,
): void {
  const str = digitStr(c.target, c.places, c.decimals);
  ctx.fillStyle = lineInk;
  ctx.font = "700 26px " + font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let di = 0;
  L.cols.forEach((col, i) => {
    if (col === ".") return;
    ctx.fillText(str[di], o.x + L.xs[i] + UNIT / 2, o.y + L.rowTop + CELL_H / 2);
    di++;
  });
}

/** The old blank-columns frame, preserved byte-for-byte for legacy objects. */
function drawLegacy(
  ctx: CanvasRenderingContext2D,
  font: string,
  lineInk: string,
  o: { x: number; y: number },
  cols: string[],
): void {
  const isDot = (l: string) => l === ".";
  const unit = 54;
  const dotW = 20;
  const headerH = 36;
  const rowH = 46;
  const rows = 3;
  const xs: number[] = [];
  let cx = o.x;
  cols.forEach((c) => {
    xs.push(cx);
    cx += isDot(c) ? dotW : unit;
  });
  const xEnd = cx;
  const y0 = o.y;
  const tableH = headerH + rowH * rows;
  ctx.textAlign = "center";
  ctx.fillStyle = "#5C7A78";
  ctx.font = "700 13px " + font;
  cols.forEach((c, i) => {
    if (!isDot(c)) ctx.fillText(c, xs[i] + unit / 2, y0 + 23);
  });
  ctx.strokeStyle = "#9DB6B4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(o.x, y0 + headerH);
  ctx.lineTo(xEnd, y0 + headerH);
  ctx.stroke();
  ctx.strokeStyle = "#D7E0DF";
  ctx.lineWidth = 1;
  for (let r = 1; r < rows; r++) {
    const ry = y0 + headerH + rowH * r;
    ctx.beginPath();
    ctx.moveTo(o.x, ry);
    ctx.lineTo(xEnd, ry);
    ctx.stroke();
  }
  const ansY = y0 + headerH + rowH * (rows - 1);
  ctx.strokeStyle = lineInk;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(o.x, ansY);
  ctx.lineTo(xEnd, ansY);
  ctx.stroke();
  ctx.strokeStyle = "#C3D4D2";
  ctx.lineWidth = 1;
  cols.forEach((_c, i) => {
    if (i === 0) return;
    ctx.beginPath();
    ctx.moveTo(xs[i], y0 + headerH);
    ctx.lineTo(xs[i], y0 + tableH);
    ctx.stroke();
  });
  ctx.fillStyle = lineInk;
  cols.forEach((c, i) => {
    if (!isDot(c)) return;
    for (let r = 0; r < rows; r++) {
      const py = y0 + headerH + rowH * r + rowH * 0.7;
      ctx.beginPath();
      ctx.arc(xs[i] + dotW / 2, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export default defineCanvasTool<PlaceValueParams>({
  kind: "canvas",
  type: "placevalue",
  name: "Place value",
  blurb: "columns & decimals",
  category: "number",
  answer: true,

  defaults: () => ({ mode: "fill", places: 4, decimals: 0 }),

  size: (p) => {
    const c = resolvePV(p as unknown as Record<string, unknown>);
    if (c.legacy) {
      let w = 0;
      c.cols.forEach((x) => (w += x === "." ? DOTW : UNIT));
      return { w, h: 36 + 46 * 3 };
    }
    const L = layoutNew(c);
    return { w: L.totalW, h: L.totalH };
  },

  draw: ({ ctx, theme, font }, o) => {
    ctx.save();
    fillPanel(ctx, o);
    const c = resolvePV(o as unknown as Record<string, unknown>);
    if (c.legacy) {
      drawLegacy(ctx, font, theme.lineInk, o, c.cols);
      ctx.restore();
      return;
    }
    const L = layoutNew(c);
    drawTable(ctx, font, theme.lineInk, o, L);

    if (c.mode === "fill") {
      // Assembled read-out below the table (reads the typed cell values).
      const rec = o as unknown as Record<string, unknown>;
      let s = "";
      c.cols.forEach((col, i) => {
        if (col === ".") {
          s += ".";
          return;
        }
        const v = ((rec["ans:d" + i] as string) ?? "").trim();
        s += v === "" ? "_" : v;
      });
      ctx.fillStyle = theme.lineInk;
      ctx.font = "700 24px " + font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("= " + s, o.x + L.tableW / 2, o.y + L.footTop + L.footH / 2);
    } else if (c.mode === "wordsToNum") {
      // Words prompt on top; entry cells stay blank (inputs cover them).
      ctx.fillStyle = theme.lineInk;
      ctx.font = "600 16px " + font;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      L.promptLines.forEach((ln, k) => {
        ctx.fillText(ln, o.x + L.tableW / 2, o.y + 14 + k * 22);
      });
    } else if (c.mode === "numToWords") {
      drawGivenDigits(ctx, font, theme.lineInk, o, c, L);
      ctx.fillStyle = theme.muted;
      ctx.font = "600 15px " + font;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("In words:", o.x, o.y + L.footTop + 4);
    } else {
      // decompose: given digits + "target =" and "+" scaffolding around boxes.
      drawGivenDigits(ctx, font, theme.lineInk, o, c, L);
      const label = String(Math.trunc(c.target)) + " =";
      const midY = o.y + L.decBoxY + DBOXH / 2;
      ctx.fillStyle = theme.lineInk;
      ctx.font = "700 20px " + font;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, o.x, midY);
      ctx.textAlign = "center";
      L.parts.forEach((_part, j) => {
        if (j === 0) return;
        const boxX = L.decStartX + j * (DBOXW + PLUSW);
        ctx.fillText("+", o.x + boxX - PLUSW / 2, midY);
      });
    }
    ctx.restore();
  },

  // Type-in fields per mode. Legacy objects declare none.
  inputs: {
    fields: (o) => {
      const c = resolvePV(o as unknown as Record<string, unknown>);
      if (c.legacy) return [];
      const L = layoutNew(c);
      const out: InputFieldSpec[] = [];

      if (c.mode === "fill" || c.mode === "wordsToNum") {
        const digits = c.mode === "wordsToNum" ? digitStr(c.target, c.places, c.decimals) : null;
        let di = 0; // digit-string index, advanced only for non-dot columns
        c.cols.forEach((col, i) => {
          if (col === ".") return;
          out.push({
            key: "d" + i,
            x: L.xs[i],
            y: L.rowTop,
            w: UNIT,
            h: CELL_H,
            variant: "cell",
            ...(digits ? { correct: Number(digits[di]) } : {}),
          });
          di++;
        });
      } else if (c.mode === "numToWords") {
        out.push({
          key: "words",
          x: 0,
          y: L.footTop + 22,
          w: L.totalW,
          h: 34,
          variant: "text",
          correctText: toWords(c.target, c.decimals),
        });
      } else {
        // decompose
        L.parts.forEach((part, j) => {
          out.push({
            key: "p" + j,
            x: L.decStartX + j * (DBOXW + PLUSW),
            y: L.decBoxY,
            w: DBOXW,
            h: DBOXH,
            variant: "box",
            correct: part,
          });
        });
      }
      return out;
    },
  },

  Dialog: PlaceValueDialog,
});
