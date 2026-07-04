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
} from "@/board/store";
import { useUiStore } from "@/ui/uiStore";
import {
  copySelection,
  duplicateSelection,
  pasteClipboard,
} from "@/board/commands";
import { textSizeOf } from "@/canvas/drawHelpers";
import { paramsOf, sizedBox } from "@/board/sizing";
import { MATH_BASE_PX } from "@/tools/mathtext";
import { COLLAB_ENABLED } from "@/config";
import {
  PALETTE,
  PEN_SIZE_RANGE,
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

/** Cycle the draw colour to the next palette entry (C). Also recolours a live
 *  text or maths object, matching a swatch click. */
function cycleColor(): void {
  const st = useBoardStore.getState();
  const idx = PALETTE.findIndex(([, hex]) => hex === st.color);
  const [, next] = PALETTE[(idx + 1) % PALETTE.length];
  st.setColor(next);
  const tid = activeTextObjectId(st) ?? activeMathObjectId(st);
  if (tid != null) st.updateObject(tid, { color: next });
}

/** Nudge the active tool's size one step (+/-), clamped to that tool's range.
 *  No-op unless a size-bearing tool (pen / eraser / text / maths) is active. */
function adjustSize(dir: 1 | -1): void {
  const st = useBoardStore.getState();
  const conf =
    st.tool === "pen"
      ? { range: PEN_SIZE_RANGE, cur: st.penSize, set: st.setPenSize }
      : st.tool === "eraser"
        ? { range: ERASER_SIZE_RANGE, cur: st.eraserSize, set: st.setEraserSize }
        : st.tool === "text"
          ? { range: TEXT_SIZE_RANGE, cur: st.textSize, set: st.setTextSize }
          : st.tool === "math"
            ? { range: MATH_SIZE_RANGE, cur: st.mathSize, set: st.setMathSize }
            : null;
  if (!conf) return;
  const next = Math.min(
    conf.range.max,
    Math.max(conf.range.min, conf.cur + dir * conf.range.step),
  );
  if (next === conf.cur) return;
  conf.set(next);
  // Text: re-measure the live object so its box tracks the new size.
  if (st.tool === "text") {
    const tid = activeTextObjectId(st);
    if (tid != null) {
      const obj = st.board.objects.find((o) => o.id === tid);
      const text = (obj?.text as string) ?? "";
      const { w, h } = textSizeOf(text, next);
      st.updateObject(tid, { size: next, w, h });
    }
  }
  // Maths: the size maps onto the uniform resize scale (26 = scale 1) — the
  // live object's box re-derives exactly like a handle-resize.
  if (st.tool === "math") {
    const mid = activeMathObjectId(st);
    if (mid != null) {
      const obj = st.board.objects.find((o) => o.id === mid);
      const box = obj && sizedBox("mathtext", paramsOf(obj), next / MATH_BASE_PX);
      if (box) st.updateObject(mid, { w: box.w, h: box.h });
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
  // mnemonic alternates (Draw / Eraser / Text / Maths).
  {
    id: "tool-select",
    group: "tools",
    keys: [["1"]],
    label: "Select & move",
    test: (c) => bare(c) && c.key === "1",
    run: (c) => c.st.setTool("select"),
  },
  {
    id: "tool-pan",
    group: "tools",
    keys: [["2"]],
    label: "Pan the view",
    test: (c) => bare(c) && c.key === "2",
    run: (c) => c.st.setTool("pan"),
  },
  {
    id: "tool-draw",
    group: "tools",
    keys: [["3"], ["D"]],
    label: "Draw",
    test: (c) => bare(c) && (c.key === "3" || c.key === "d"),
    run: (c) => c.st.setTool("pen"),
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
    label: "Cycle the draw colour",
    test: (c) => bare(c) && c.key === "c",
    run: () => cycleColor(),
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
