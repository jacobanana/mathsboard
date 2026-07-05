// THE KEYBOARD SHORTCUT CATALOG — the single source of truth.
//
// Every global shortcut lives here as a declarative entry that carries BOTH its
// behaviour (test + run) AND its help-page metadata (group + keys + label), so
// the two can never drift: App.tsx drives its window keydown handler from this
// list (handleShortcut) and ShortcutsHelp renders the same list grouped.
//
// The pure store operations the shortcuts fire (colour cycle, size nudge,
// arrow-nudge history batching) live here too — they need no React. The
// internal clipboard is a placement service, not a shortcut: it lives in
// board/commands.ts and is only WIRED here. Only the actions that open a
// modal / save through the host (which own React state) are passed in via
// ShortcutHost.
//
// Dispatch contract (handleShortcut), matching the old inline handler exactly:
//   - nothing fires while a modal is open;
//   - during in-place text editing only `whileEditing` shortcuts (Save) fire;
//   - entries are tried in ARRAY ORDER, the first whose test() matches wins,
//     preventDefault() is called, and dispatch stops.

import {
  useBoardStore,
  activeTextObjectId,
  activeMathObjectId,
  activeShapeObjectId,
  activeStrokeId,
  DRAW_MODE_ORDER,
} from "@/board/store";
import type { DrawMode } from "@/board/store";
import {
  cancelPlacement,
  finishPlacement,
  placementActive,
} from "@/canvas/interactions/draw";
import { useUiStore } from "@/ui/uiStore";
import {
  arrangeSelection,
  copySelection,
  duplicateSelection,
  groupSelection,
  pasteClipboard,
  ungroupSelection,
} from "@/board/commands";
import type { ArrangeAction } from "@/board/commands";
import { textSizeOf } from "@/canvas/drawHelpers";
import { paramsOf, scaleOf, sizedBox } from "@/board/sizing";
import { MATH_BASE_PX } from "@/tools/mathtext";
import { COLLAB_ENABLED } from "@/config";
import {
  PALETTE,
  FILL_PALETTE,
  LASER_PALETTE,
  PEN_SIZE_RANGE,
  HIGHLIGHTER_SIZE_RANGE,
  SHAPE_WIDTH_RANGE,
  TEXT_SIZE_RANGE,
  MATH_SIZE_RANGE,
  ERASER_SIZE_RANGE,
} from "@/ui/constants";

type BoardState = ReturnType<typeof useBoardStore.getState>;

// --- host wiring ----------------------------------------------------------
// The few actions that can't be pure store calls because they open a modal or
// save through App's async/flash pipeline. App builds this and hands it to
// handleShortcut on every keydown.
export interface ShortcutHost {
  save: () => void;
  saveAs: () => void;
  openInsert: () => void;
  /** Insert a picture (image tool dialog). Only wired in collab builds. */
  openImage: () => void;
  openHelp: () => void;
}

// --- catalog types --------------------------------------------------------

/** Everything a shortcut's test()/run() can read about the current keydown. */
interface ShortcutCtx {
  e: KeyboardEvent;
  st: BoardState;
  /** Ctrl OR Cmd — the platform "primary" modifier. */
  mod: boolean;
  /** e.key lower-cased, for letter comparisons. */
  key: string;
  hasSelection: boolean;
  /** Focus sits in a real form field (answer boxes, join code, ...). */
  inField: boolean;
  host: ShortcutHost;
}

export type ShortcutGroup =
  | "tools"
  | "insert"
  | "options"
  | "edit"
  | "file"
  | "help";

export interface ShortcutSpec {
  id: string;
  group: ShortcutGroup;
  /** Key combos for the help page: outer = alternatives, inner = combo parts.
   *  e.g. draw -> [["3"], ["D"]]; save-as -> [["Ctrl", "Shift", "S"]]. */
  keys: string[][];
  /** Human description shown in the help page. */
  label: string;
  /** Active even during in-place text editing (Save only). Default false. */
  whileEditing?: boolean;
  test: (c: ShortcutCtx) => boolean;
  run: (c: ShortcutCtx) => void;
}

/** A plain key press: no Ctrl/Cmd, no Alt, and not typing in a form field. */
const bare = (c: ShortcutCtx): boolean => !c.mod && !c.e.altKey && !c.inField;

// --- colour + size (active-tool options) ----------------------------------

/** Cycle the colour of whatever palette is active (C). In laser mode that's the
 *  laser's own palette; otherwise the draw palette — also recolouring the live
 *  edit target (text / maths / shape border / pencil stroke), exactly like a
 *  swatch click in the options pill. */
function cycleColor(): void {
  const st = useBoardStore.getState();
  // Laser mode shows its own vivid palette; C cycles that instead.
  if (st.laserMode) {
    const li = LASER_PALETTE.findIndex(([, hex]) => hex === st.laserColor);
    st.setLaserColor(LASER_PALETTE[(li + 1) % LASER_PALETTE.length][1]);
    return;
  }
  const idx = PALETTE.findIndex(([, hex]) => hex === st.color);
  const [, next] = PALETTE[(idx + 1) % PALETTE.length];
  st.setColor(next);
  const tid = activeTextObjectId(st) ?? activeMathObjectId(st);
  if (tid != null) st.updateObject(tid, { color: next });
  const sid = activeShapeObjectId(st);
  if (sid != null) st.updateObject(sid, { stroke: next });
  const skid = activeStrokeId(st);
  if (skid != null) st.updateStroke(skid, { color: next });
}

/** Cycle the BACKGROUND (fill) palette (B). Sets the default fill for new
 *  shapes and recolours a selected shape's background, matching the fill
 *  swatch. Includes the "none" (transparent) entry. */
function cycleFillColor(): void {
  const st = useBoardStore.getState();
  const idx = FILL_PALETTE.findIndex(([, hex]) => hex === st.fillColor);
  const next = FILL_PALETTE[(idx + 1) % FILL_PALETTE.length][1];
  st.setFillColor(next);
  const sid = activeShapeObjectId(st);
  if (sid != null) st.updateObject(sid, { fill: next });
}

/** Switch to the draw tool in the given mode (the shape keys, L / A / R /
 *  O / Y / N / Q / B / G, plus F for freehand). */
function pickDrawMode(mode: DrawMode): void {
  const st = useBoardStore.getState();
  st.setTool("pen");
  st.setDrawMode(mode);
}

/** The draw key (3 / D): first press activates the draw tool in its current
 *  mode; pressing it AGAIN cycles through the drawing modes. */
function drawOrCycle(): void {
  const st = useBoardStore.getState();
  if (st.tool !== "pen") {
    st.setTool("pen");
    return;
  }
  const i = DRAW_MODE_ORDER.indexOf(st.drawMode);
  st.setDrawMode(DRAW_MODE_ORDER[(i + 1) % DRAW_MODE_ORDER.length]);
}

/** The ] / [ physical keys, layout-safe: prefer e.code, fall back to the
 *  produced character (some layouts shift them to } / {). */
const bracketRight = (e: KeyboardEvent): boolean =>
  e.code === "BracketRight" || e.key === "]" || e.key === "}";
const bracketLeft = (e: KeyboardEvent): boolean =>
  e.code === "BracketLeft" || e.key === "[" || e.key === "{";

const arrange = (action: ArrangeAction) => () => arrangeSelection(action);

/**
 * Nudge the active tool's size one step (+/-), MIRRORING THE OPTIONS PILL
 * exactly: the same range and current value the pill's slider shows for this
 * tool/mode (including the pen's highlighter and shape sub-modes), and the
 * same live restyle of the edit target (a text/maths object, a shape's border
 * width, a pencil stroke's size). No-op for tools without a size (select/pan).
 */
function adjustSize(dir: 1 | -1): void {
  const st = useBoardStore.getState();
  const step = (cur: number, range: { min: number; max: number; step: number }) =>
    Math.min(range.max, Math.max(range.min, cur + dir * range.step));

  if (st.tool === "pen") {
    const skid = activeStrokeId(st);
    const stroke =
      skid != null ? st.board.strokes.find((s) => s.id === skid) : undefined;
    if (st.drawMode === "highlighter") {
      const cur = stroke?.size ?? st.highlighterSize;
      const next = step(cur, HIGHLIGHTER_SIZE_RANGE);
      if (next === cur) return;
      st.setHighlighterSize(next);
      if (skid != null) st.updateStroke(skid, { size: next });
    } else if (st.drawMode === "free") {
      const cur = stroke?.size ?? st.penSize;
      const next = step(cur, PEN_SIZE_RANGE);
      if (next === cur) return;
      st.setPenSize(next);
      if (skid != null) st.updateStroke(skid, { size: next });
    } else {
      // Shape modes: the border width shares the pen's default but lives in
      // the narrower shape range (the pill clamps the same way).
      const sid = activeShapeObjectId(st);
      const shape =
        sid != null ? st.board.objects.find((o) => o.id === sid) : undefined;
      const cur =
        (shape?.strokeWidth as number | undefined) ??
        Math.min(st.penSize, SHAPE_WIDTH_RANGE.max);
      const next = step(cur, SHAPE_WIDTH_RANGE);
      if (next === cur) return;
      st.setPenSize(next);
      if (sid != null) st.updateObject(sid, { strokeWidth: next });
    }
    return;
  }

  if (st.tool === "eraser") {
    st.setEraserSize(step(st.eraserSize, ERASER_SIZE_RANGE));
    return;
  }

  if (st.tool === "text") {
    const tid = activeTextObjectId(st);
    const obj = tid != null ? st.board.objects.find((o) => o.id === tid) : undefined;
    const cur = (obj?.size as number | undefined) ?? st.textSize;
    const next = step(cur, TEXT_SIZE_RANGE);
    if (next === cur) return;
    st.setTextSize(next);
    // Re-measure the live object so its box tracks the new size (keeping any
    // fixed wrap width so a text box doesn't revert to auto-size).
    if (obj) {
      const text = (obj.text as string) ?? "";
      const { w, h } = textSizeOf(text, next, obj.boxW as number | undefined);
      st.updateObject(obj.id, { size: next, w, h });
    }
    return;
  }

  if (st.tool === "math") {
    const mid = activeMathObjectId(st);
    const obj = mid != null ? st.board.objects.find((o) => o.id === mid) : undefined;
    // Maths size = the uniform resize scale (26 = scale 1), so the current
    // value is derived from the live object's box, like the pill shows.
    const cur = obj ? Math.round(scaleOf(obj) * MATH_BASE_PX) : st.mathSize;
    const next = step(cur, MATH_SIZE_RANGE);
    if (next === cur) return;
    st.setMathSize(next);
    if (obj) {
      const box = sizedBox("mathtext", paramsOf(obj), next / MATH_BASE_PX);
      if (box) st.updateObject(obj.id, { w: box.w, h: box.h });
    }
  }
}

// --- arrow-nudge ----------------------------------------------------------
// Timestamp of the last arrow-key nudge, so a held/rapid burst collapses into
// one undo step while a fresh press after a >500ms pause starts a new one.
let lastNudgeAt = 0;

function nudgeSelection(c: ShortcutCtx): void {
  const { st, e } = c;
  // Shift = a bigger step, held constant in screen px regardless of zoom.
  const px = (e.shiftKey ? 10 : 1) / st.camera.scale;
  const dx = e.key === "ArrowLeft" ? -px : e.key === "ArrowRight" ? px : 0;
  const dy = e.key === "ArrowUp" ? -px : e.key === "ArrowDown" ? px : 0;
  const now = Date.now();
  if (now - lastNudgeAt > 500) st.pushHistory();
  lastNudgeAt = now;
  st.nudgeSelection(dx, dy);
}

/** The pointer key (1 / V): select the pointer, or — when it is ALREADY the
 *  active tool — toggle the laser pointer on/off. The laser is a mode of the
 *  pointer, not a tool of its own (canvas/interactions/laser.ts). */
function selectOrToggleLaser(st: BoardState): void {
  // Arriving at the pointer gives the NORMAL pointer; a second press arms the
  // laser, a third disarms it. So "1" is always a reliable way back to select.
  // The laser is a collaboration feature (like sharing) — only togglable in
  // collab builds; otherwise the key just selects the pointer.
  if (st.tool === "select" && COLLAB_ENABLED) st.toggleLaserMode();
  else {
    st.setTool("select");
    st.setLaserMode(false);
  }
}

// --- the catalog ----------------------------------------------------------
// ORDER IS BEHAVIOUR: dispatch runs the first matching entry, so keep the
// precedence of the old inline handler (Save first; selection/history combos
// before bare keys). Groups only affect help-page layout, not dispatch.

export const SHORTCUTS: ShortcutSpec[] = [
  // Board — work even mid-text-edit; only an open modal defers them.
  {
    id: "saveAs",
    group: "file",
    keys: [["Ctrl", "Shift", "S"]],
    label: "Save as a new board",
    whileEditing: true,
    test: (c) => c.mod && c.key === "s" && c.e.shiftKey,
    run: (c) => c.host.saveAs(),
  },
  {
    id: "save",
    group: "file",
    keys: [["Ctrl", "S"]],
    label: "Save board",
    whileEditing: true,
    test: (c) => c.mod && c.key === "s" && !c.e.shiftKey,
    run: (c) => c.host.save(),
  },

  // The in-progress click-to-place shape (point polygon / curve) owns
  // Enter/Escape while it's live (before the selection's own Escape below).
  {
    id: "place-finish",
    group: "tools",
    keys: [["Enter"]],
    label: "Stop adding points (curve / point polygon)",
    test: (c) =>
      bare(c) &&
      c.e.key === "Enter" &&
      c.st.tool === "pen" &&
      (c.st.drawMode === "freepoly" || c.st.drawMode === "curve") &&
      placementActive(),
    run: () => finishPlacement(),
  },
  {
    id: "place-cancel",
    group: "tools",
    keys: [["Esc"]],
    label: "Stop adding points (each added point undoes individually)",
    test: (c) =>
      c.e.key === "Escape" &&
      c.st.tool === "pen" &&
      (c.st.drawMode === "freepoly" || c.st.drawMode === "curve") &&
      placementActive(),
    run: () => cancelPlacement(),
  },

  // Selection & editing.
  {
    id: "delete",
    group: "edit",
    keys: [["Del"], ["Backspace"]],
    label: "Delete selection",
    test: (c) =>
      (c.e.key === "Delete" || c.e.key === "Backspace") && c.hasSelection,
    run: (c) => c.st.deleteSelection(),
  },
  {
    id: "selectAll",
    group: "edit",
    keys: [["Ctrl", "A"]],
    label: "Select everything",
    test: (c) => c.mod && c.key === "a",
    run: (c) => {
      c.st.setTool("select");
      c.st.setLaserMode(false); // selecting all implies the normal pointer
      c.st.selectAll();
    },
  },
  {
    id: "copy",
    group: "edit",
    keys: [["Ctrl", "C"]],
    label: "Copy selection",
    test: (c) => c.mod && c.key === "c" && c.hasSelection && !c.inField,
    run: () => copySelection(),
  },
  {
    id: "cut",
    group: "edit",
    keys: [["Ctrl", "X"]],
    label: "Cut selection",
    test: (c) => c.mod && c.key === "x" && c.hasSelection && !c.inField,
    run: (c) => {
      copySelection();
      c.st.deleteSelection();
    },
  },
  {
    id: "paste",
    group: "edit",
    keys: [["Ctrl", "V"]],
    label: "Paste",
    test: (c) => c.mod && c.key === "v" && !c.inField,
    run: () => pasteClipboard(),
  },
  {
    id: "duplicate",
    group: "edit",
    keys: [["Ctrl", "D"]],
    label: "Duplicate selection",
    test: (c) => c.mod && c.key === "d" && c.hasSelection && !c.inField,
    run: () => duplicateSelection(),
  },
  {
    id: "ungroup",
    group: "edit",
    keys: [["Ctrl", "Shift", "G"]],
    label: "Ungroup",
    test: (c) => c.mod && c.key === "g" && c.e.shiftKey && c.hasSelection,
    run: () => ungroupSelection(),
  },
  {
    id: "group",
    group: "edit",
    keys: [["Ctrl", "G"]],
    label: "Group the selection",
    test: (c) => c.mod && c.key === "g" && !c.e.shiftKey && c.hasSelection,
    run: () => groupSelection(),
  },
  // Z-order (front/back), the industry-standard bracket combos.
  {
    id: "toFront",
    group: "edit",
    keys: [["Ctrl", "Shift", "]"]],
    label: "Bring to front",
    test: (c) => c.mod && c.e.shiftKey && bracketRight(c.e) && c.hasSelection,
    run: arrange("front"),
  },
  {
    id: "toBack",
    group: "edit",
    keys: [["Ctrl", "Shift", "["]],
    label: "Send to back",
    test: (c) => c.mod && c.e.shiftKey && bracketLeft(c.e) && c.hasSelection,
    run: arrange("back"),
  },
  {
    id: "forward",
    group: "edit",
    keys: [["Ctrl", "]"]],
    label: "Bring forward one step",
    test: (c) => c.mod && !c.e.shiftKey && bracketRight(c.e) && c.hasSelection,
    run: arrange("forward"),
  },
  {
    id: "backward",
    group: "edit",
    keys: [["Ctrl", "["]],
    label: "Send backward one step",
    test: (c) => c.mod && !c.e.shiftKey && bracketLeft(c.e) && c.hasSelection,
    run: arrange("backward"),
  },
  {
    id: "clearSelection",
    group: "edit",
    keys: [["Esc"]],
    label: "Clear selection",
    test: (c) => c.e.key === "Escape" && c.hasSelection,
    run: (c) => c.st.clearSelection(),
  },
  {
    id: "redo",
    group: "edit",
    keys: [["Ctrl", "Shift", "Z"]],
    label: "Redo",
    test: (c) => c.mod && c.key === "z" && c.e.shiftKey,
    run: (c) => c.st.redo(),
  },
  {
    id: "undo",
    group: "edit",
    keys: [["Ctrl", "Z"]],
    label: "Undo",
    test: (c) => c.mod && c.key === "z" && !c.e.shiftKey,
    run: (c) => c.st.undo(),
  },
  {
    id: "nudge",
    group: "edit",
    keys: [["←"], ["↑"], ["→"], ["↓"]],
    label: "Nudge selection (Shift = bigger step)",
    test: (c) =>
      !c.mod &&
      !c.e.altKey &&
      c.e.key.startsWith("Arrow") &&
      c.hasSelection &&
      !c.inField,
    run: (c) => nudgeSelection(c),
  },

  // Tools — bare keys. Digits mirror the toolbar order (1..6); the letters are
  // mnemonic alternates (V/H match Figma & Excalidraw; Draw / Eraser / Text /
  // Maths keep their initials).
  {
    id: "tool-select",
    group: "tools",
    keys: [["1"], ["V"]],
    // Pressing the pointer key when it's already active toggles the laser
    // pointer (like pressing Draw again cycles modes). See laser.ts.
    label: "Select & move (press again for the laser pointer)",
    test: (c) => bare(c) && (c.key === "1" || c.key === "v"),
    run: (c) => selectOrToggleLaser(c.st),
  },
  {
    id: "tool-pan",
    group: "tools",
    keys: [["2"], ["H"]],
    label: "Pan the view",
    test: (c) => bare(c) && (c.key === "2" || c.key === "h"),
    run: (c) => c.st.setTool("pan"),
  },
  {
    id: "tool-draw",
    group: "tools",
    keys: [["3"], ["D"]],
    label: "Draw — press again to cycle the drawing modes",
    test: (c) => bare(c) && (c.key === "3" || c.key === "d"),
    run: () => drawOrCycle(),
  },
  // Draw modes — one key per shape (roadmap A2): pressing it activates the
  // draw tool in that mode from anywhere.
  {
    id: "mode-free",
    group: "tools",
    keys: [["F"]],
    label: "Freehand pen",
    test: (c) => bare(c) && c.key === "f",
    run: () => pickDrawMode("free"),
  },
  {
    id: "mode-highlighter",
    group: "tools",
    keys: [["K"]],
    label: "Highlighter (translucent marker)",
    test: (c) => bare(c) && c.key === "k",
    run: () => pickDrawMode("highlighter"),
  },
  {
    id: "mode-line",
    group: "tools",
    keys: [["L"]],
    label: "Line (clicks onto 15° directions)",
    test: (c) => bare(c) && c.key === "l",
    run: () => pickDrawMode("line"),
  },
  {
    id: "mode-arrow",
    group: "tools",
    keys: [["A"]],
    label: "Arrow (clicks onto 15° directions)",
    test: (c) => bare(c) && c.key === "a",
    run: () => pickDrawMode("arrow"),
  },
  {
    id: "mode-rect",
    group: "tools",
    keys: [["R"]],
    label: "Rectangle (square via the lock toggle)",
    test: (c) => bare(c) && c.key === "r",
    run: () => pickDrawMode("rect"),
  },
  {
    id: "mode-ellipse",
    group: "tools",
    keys: [["O"]],
    label: "Ellipse (circle via the lock toggle)",
    test: (c) => bare(c) && c.key === "o",
    run: () => pickDrawMode("ellipse"),
  },
  {
    id: "mode-triangle",
    group: "tools",
    keys: [["Y"]],
    label: "Triangle (drag corners to change its angles)",
    test: (c) => bare(c) && c.key === "y",
    run: () => pickDrawMode("triangle"),
  },
  {
    id: "mode-polygon",
    group: "tools",
    keys: [["N"]],
    label: "Polygon (n-gon — sides in the options pill)",
    test: (c) => bare(c) && c.key === "n",
    run: () => pickDrawMode("polygon"),
  },
  {
    id: "mode-freepoly",
    group: "tools",
    keys: [["Q"]],
    label: "Point-by-point polygon (click corners; close on the first one)",
    test: (c) => bare(c) && c.key === "q",
    run: () => pickDrawMode("freepoly"),
  },
  // Curve has no key: B is the background-colour cycle (see cycleFill). Curve
  // is still reachable from the draw-mode options row.
  {
    id: "mode-angle",
    group: "tools",
    keys: [["G"]],
    label: "Angle (drag to open it, like a protractor)",
    test: (c) => bare(c) && c.key === "g",
    run: () => pickDrawMode("angle"),
  },
  {
    id: "tool-eraser",
    group: "tools",
    keys: [["4"], ["E"]],
    label: "Eraser",
    test: (c) => bare(c) && (c.key === "4" || c.key === "e"),
    run: (c) => c.st.setTool("eraser"),
  },
  {
    id: "tool-text",
    group: "tools",
    keys: [["5"], ["T"]],
    label: "Text",
    test: (c) => bare(c) && (c.key === "5" || c.key === "t"),
    run: (c) => c.st.setTool("text"),
  },
  {
    id: "tool-math",
    group: "tools",
    keys: [["6"], ["M"]],
    label: "Maths notation",
    test: (c) => bare(c) && (c.key === "6" || c.key === "m"),
    run: (c) => c.st.setTool("math"),
  },

  // Insert. ("6" moved to the maths tool when it became the sixth dock mode;
  // "0" is the digit-row stand-in since 7 belongs to Picture.)
  {
    id: "insert",
    group: "insert",
    keys: [["I"], ["0"]],
    label: "Insert a maths widget",
    test: (c) => bare(c) && (c.key === "i" || c.key === "0"),
    run: (c) => c.host.openInsert(),
  },
  // Pictures upload through the backend, so the shortcut only exists in the
  // collab build — same gating as the toolbar's picture button and tool.
  ...(COLLAB_ENABLED
    ? [
        {
          id: "image",
          group: "insert",
          keys: [["7"], ["P"]],
          label: "Insert a picture",
          test: (c: ShortcutCtx) => bare(c) && (c.key === "7" || c.key === "p"),
          run: (c: ShortcutCtx) => c.host.openImage(),
        } satisfies ShortcutSpec,
      ]
    : []),

  // Active-tool options.
  {
    id: "cycleColor",
    group: "options",
    keys: [["C"]],
    label: "Cycle the colour (draw / shape / laser)",
    test: (c) => bare(c) && c.key === "c",
    run: () => cycleColor(),
  },
  {
    id: "cycleFill",
    group: "options",
    keys: [["B"]],
    label: "Cycle the background (fill) colour",
    test: (c) => bare(c) && c.key === "b",
    run: () => cycleFillColor(),
  },
  {
    id: "sizeUp",
    group: "options",
    keys: [["+"]],
    label: "Bigger pen / text / maths / eraser",
    // Accept "=" so the +/= key works without Shift.
    test: (c) => bare(c) && (c.e.key === "+" || c.e.key === "="),
    run: () => adjustSize(1),
  },
  {
    id: "sizeDown",
    group: "options",
    keys: [["−"]],
    label: "Smaller pen / text / maths / eraser",
    test: (c) => bare(c) && (c.e.key === "-" || c.e.key === "_"),
    run: () => adjustSize(-1),
  },
  {
    id: "snap",
    group: "options",
    keys: [["S"]],
    label:
      "Toggle grid snapping (squared paper; hold Shift to flip it mid-gesture, Alt to bypass)",
    test: (c) => bare(c) && c.key === "s",
    run: (c) => c.st.setSnap(!c.st.snap),
  },

  // Help.
  {
    id: "help",
    group: "help",
    keys: [["?"]],
    label: "Show this shortcut list",
    test: (c) => bare(c) && c.e.key === "?",
    run: (c) => c.host.openHelp(),
  },
];

// --- dispatch -------------------------------------------------------------

/**
 * Run the first shortcut whose test() matches `e`. Returns true if one fired.
 * Guard order matches the old inline handler: nothing runs while a modal is
 * open; during in-place text editing only `whileEditing` shortcuts run.
 */
export function handleShortcut(e: KeyboardEvent, host: ShortcutHost): boolean {
  if (useUiStore.getState().modalOpen) return false;
  const st = useBoardStore.getState();
  const editing = st.editingId != null;
  const ctx: ShortcutCtx = {
    e,
    st,
    mod: e.ctrlKey || e.metaKey,
    key: e.key.toLowerCase(),
    hasSelection:
      st.selection.objectIds.length + st.selection.strokeIds.length > 0,
    inField:
      (e.target as HTMLElement | null)?.closest(
        "input,textarea,select,[contenteditable]",
      ) != null,
    host,
  };
  for (const s of SHORTCUTS) {
    if (editing && !s.whileEditing) continue;
    if (!s.test(ctx)) continue;
    e.preventDefault();
    s.run(ctx);
    return true;
  }
  return false;
}

// --- lookups for UI hints -------------------------------------------------

/** A compact key hint for tooltips, derived from the catalog so button titles
 *  never restate a shortcut: e.g. "3 / D", "Ctrl+Shift+S", "6 / M". Empty
 *  string for an unknown / build-gated id, so callers can interpolate freely. */
export function keyHint(id: string): string {
  const spec = SHORTCUTS.find((s) => s.id === id);
  if (!spec) return "";
  return spec.keys.map((combo) => combo.join("+")).join(" / ");
}

// --- help-page view -------------------------------------------------------

export const SHORTCUT_GROUP_LABELS: Record<ShortcutGroup, string> = {
  tools: "Tools",
  insert: "Insert",
  options: "Active tool",
  edit: "Selection & editing",
  file: "Board",
  help: "Help",
};

const SHORTCUT_GROUP_ORDER: ShortcutGroup[] = [
  "tools",
  "insert",
  "options",
  "edit",
  "file",
  "help",
];

/** The catalog bucketed into help-page sections, empty groups dropped. Reflects
 *  build gating automatically (e.g. no picture row when COLLAB is off). */
export function shortcutsByGroup(): {
  group: ShortcutGroup;
  label: string;
  items: ShortcutSpec[];
}[] {
  return SHORTCUT_GROUP_ORDER.map((group) => ({
    group,
    label: SHORTCUT_GROUP_LABELS[group],
    items: SHORTCUTS.filter((s) => s.group === group),
  })).filter((g) => g.items.length > 0);
}
