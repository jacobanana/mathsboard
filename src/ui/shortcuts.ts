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

import { useBoardStore, DRAW_MODES } from "@/board/store";
import type { DrawMode } from "@/board/store";
import { applyStyle, sizeBinding, sizeValue } from "@/board/styling";
import { TOOL_UI } from "@/ui/toolSpecs";
import type { ToolUiSpec } from "@/ui/toolSpecs";
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
import { COLLAB_ENABLED } from "@/config";
import { PALETTE, FILL_PALETTE, LASER_PALETTE } from "@/ui/constants";

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

/** Cycle the colour of whatever palette is active (C). In laser mode that's
 *  the laser's own palette; otherwise the draw palette — the styling service
 *  recolours the live edit target too, exactly like a pill swatch click. */
function cycleColor(): void {
  const st = useBoardStore.getState();
  // Laser mode shows its own vivid palette; C cycles that instead.
  if (st.laserMode) {
    const li = LASER_PALETTE.findIndex(([, hex]) => hex === st.laserColor);
    st.setLaserColor(LASER_PALETTE[(li + 1) % LASER_PALETTE.length][1]);
    return;
  }
  const idx = PALETTE.findIndex(([, hex]) => hex === st.color);
  applyStyle("color", PALETTE[(idx + 1) % PALETTE.length][1]);
}

/** Cycle the BACKGROUND (fill) palette (B): the default fill for new shapes,
 *  plus a selected shape's background via the styling service. Includes the
 *  "none" (transparent) entry. */
function cycleFillColor(): void {
  const st = useBoardStore.getState();
  const idx = FILL_PALETTE.findIndex(([, hex]) => hex === st.fillColor);
  applyStyle("fill", FILL_PALETTE[(idx + 1) % FILL_PALETTE.length][1]);
}

/** Switch to the draw tool in the given mode (the per-mode keys from the
 *  DRAW_MODES table: F for freehand, L / A / R / O / Y / N / Q / G ...). */
function pickDrawMode(mode: DrawMode): void {
  const st = useBoardStore.getState();
  st.setTool("pen");
  st.setDrawMode(mode);
}

/** The ] / [ physical keys, layout-safe: prefer e.code, fall back to the
 *  produced character (some layouts shift them to } / {). */
const bracketRight = (e: KeyboardEvent): boolean =>
  e.code === "BracketRight" || e.key === "]" || e.key === "}";
const bracketLeft = (e: KeyboardEvent): boolean =>
  e.code === "BracketLeft" || e.key === "[" || e.key === "{";

const arrange = (action: ArrangeAction) => () => arrangeSelection(action);

/**
 * Nudge the active tool's size one step (+/-). The styling service supplies
 * the binding the pill's slider uses (channel + range + edit target, incl.
 * the pen's highlighter/shape sub-modes), so the keys and the slider CANNOT
 * disagree. No-op for tools without a size (select / pan).
 */
function adjustSize(dir: 1 | -1): void {
  const st = useBoardStore.getState();
  const b = sizeBinding(st);
  const cur = sizeValue(st);
  if (!b || cur == null) return;
  const next = Math.min(b.range.max, Math.max(b.range.min, cur + dir * b.range.step));
  if (next === cur) return;
  applyStyle("size", next);
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

// --- generated entries ------------------------------------------------------
// The tool keys come from the TOOL_UI table (ui/toolSpecs.tsx) and the draw-
// mode keys from DRAW_MODES (board/store.ts) — the same tables that drive the
// dock and the options pill, so a tool's button, tooltip, pill and key can't
// drift apart. Tool keys are bare single keys, so their relative order can't
// change dispatch; the modes ride directly behind the draw tool for the help
// page's reading order.

const toolEntry = (t: ToolUiSpec): ShortcutSpec => ({
  id: t.shortcut.id,
  group: "tools",
  keys: t.shortcut.keys,
  label: t.shortcut.label,
  test: (c) =>
    bare(c) && t.shortcut.keys.some((combo) => combo[0].toLowerCase() === c.key),
  run: (c) => {
    if (t.shortcut.run) t.shortcut.run();
    else c.st.setTool(t.tool);
  },
});

const modeEntries = (): ShortcutSpec[] =>
  DRAW_MODES.filter((m) => m.key != null).map((m) => ({
    id: "mode-" + m.mode,
    group: "tools",
    keys: [[m.key!.toUpperCase()]],
    label: m.hint ?? m.label,
    test: (c) => bare(c) && c.key === m.key,
    run: () => pickDrawMode(m.mode),
  }));

const toolAndModeEntries = (): ShortcutSpec[] =>
  TOOL_UI.flatMap((t) => [
    toolEntry(t),
    ...(t.tool === "pen" ? modeEntries() : []),
  ]);

// --- the catalog ----------------------------------------------------------
// ORDER IS BEHAVIOUR: dispatch runs the first matching entry, so keep the
// precedence of the old inline handler (Save first; selection/history combos
// before bare keys). Groups only affect help-page layout, not dispatch.
//
// Built LAZILY (first use) because the tool entries read TOOL_UI, whose
// module transitively imports this one for keyHint — a module-init read
// would be order-dependent; a first-keydown/first-render read never is.

function buildCatalog(): ShortcutSpec[] {
  return [
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

  // Tools + draw modes — bare keys, generated from the TOOL_UI and
  // DRAW_MODES tables (see "generated entries" above).
  ...toolAndModeEntries(),

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
}

let CATALOG: ShortcutSpec[] | null = null;

/** The full shortcut catalog (built once, on first use). */
export function shortcutCatalog(): ShortcutSpec[] {
  return (CATALOG ??= buildCatalog());
}

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
  for (const s of shortcutCatalog()) {
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
  const spec = shortcutCatalog().find((s) => s.id === id);
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
    items: shortcutCatalog().filter((s) => s.group === group),
  })).filter((g) => g.items.length > 0);
}
