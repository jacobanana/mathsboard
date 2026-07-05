// THE TOOL UI TABLE (R5 in docs/tool-architecture-refactor.md).
//
// Each interaction tool's chrome, declared in one spec: its dock button
// (icon, DOM id, tooltip), its shortcut-catalog entry (keys, help label,
// custom activation), and its options-pill body. Three surfaces consume it —
// the Toolbar maps the dock from it, ui/shortcuts.ts generates the `tool-*`
// entries from it, and OptionsStrip renders the active tool's Options.
// Adding a dock tool = its controller (canvas/interactions/*) + one spec
// here; no Toolbar / OptionsStrip / shortcut-catalog edits.
//
// Options bodies are ordinary JSX composed from ui/optionControls.tsx (every
// control binds itself to the styling service) — deliberately NOT a config
// DSL: the pen's two-line layout and the laser rows stay plain components.

import { DRAW_MODES, useBoardStore } from "@/board/store";
import type { DrawMode } from "@/board/store";
import { COLLAB_ENABLED } from "@/config";
import { POLYGON_SIDES_RANGE } from "@/ui/constants";
import { keyHint } from "@/ui/shortcuts";
import {
  AlignGroup,
  ColourSwatch,
  FillSwatch,
  LaserColorPicker,
  LaserFrameToggle,
  LaserToggle,
  SizeSlider,
  SnapToggle,
} from "@/ui/optionControls";
import { isClosed } from "@/tools/shape/geometry";
import type { ShapeKind } from "@/tools/shape/geometry";
import {
  AngleIcon,
  ArrowIcon,
  CircleIcon,
  CurveIcon,
  DrawIcon,
  EllipseIcon,
  EraserIcon,
  FreePolyIcon,
  HandIcon,
  HighlighterIcon,
  LineIcon,
  MathIcon,
  PolygonIcon,
  RectIcon,
  ScribbleIcon,
  SelectIcon,
  SquareIcon,
  TextIcon,
  TriangleIcon,
} from "@/ui/icons";
import type { ToolName } from "@/board/types";

export interface ToolUiSpec {
  tool: ToolName;
  /** The dock button's DOM id (e2e + CSS hooks: #drawBtn, #selectBtn, ...). */
  domId: string;
  icon: () => JSX.Element;
  /** aria-label / display name. */
  label: string;
  /** Dock tooltip, given this tool's key hint (e.g. "3 / D"). */
  title: (hint: string) => string;
  /** Dock button press. Default: activate the tool. */
  pick?: () => void;
  /** The tool's shortcut-catalog entry. `id` feeds keyHint ("tool-draw" is
   *  historic — not derived from the ToolName). `run` overrides the default
   *  setTool activation (select toggles the laser, draw cycles its modes). */
  shortcut: {
    id: string;
    keys: string[][];
    label: string;
    run?: () => void;
  };
  /** The options pill body (renders its own #options island); omit = no pill. */
  Options?: () => JSX.Element | null;
}

// --- activation rules that go beyond setTool --------------------------------

/** The pointer key/button policy: arriving at the pointer gives the NORMAL
 *  pointer; pressing its KEY again arms/disarms the laser (collab builds —
 *  the laser is a mode of the pointer, canvas/interactions/laser.ts). */
function selectOrToggleLaser(): void {
  const st = useBoardStore.getState();
  if (st.tool === "select" && COLLAB_ENABLED) st.toggleLaserMode();
  else {
    st.setTool("select");
    st.setLaserMode(false);
  }
}

/** The draw key: first press activates the draw tool in its current mode;
 *  pressing it AGAIN cycles through the drawing modes (DRAW_MODES order). */
function drawOrCycle(): void {
  const st = useBoardStore.getState();
  if (st.tool !== "pen") {
    st.setTool("pen");
    return;
  }
  const i = DRAW_MODES.findIndex((m) => m.mode === st.drawMode);
  st.setDrawMode(DRAW_MODES[(i + 1) % DRAW_MODES.length].mode);
}

// --- options-pill bodies -----------------------------------------------------

/** Pointer: manipulate only — never a styling panel. Grid snap (moves and
 *  resizes snap on squared paper), plus the laser controls in collab builds;
 *  in laser mode the pill is the laser's own row. */
function SelectOptions(): JSX.Element {
  const laserMode = useBoardStore((s) => s.laserMode);
  if (laserMode) {
    return (
      <div className="island" id="options">
        <LaserToggle />
        <LaserFrameToggle />
        <LaserColorPicker />
      </div>
    );
  }
  return (
    <div className="island" id="options">
      {COLLAB_ENABLED && <LaserToggle />}
      <SnapToggle />
    </div>
  );
}

/** The icon per draw mode (presentation only — the table itself, with labels
 *  and shortcut keys, is board/store.ts DRAW_MODES). */
const MODE_ICONS: Record<DrawMode, () => JSX.Element> = {
  free: ScribbleIcon,
  highlighter: HighlighterIcon,
  line: LineIcon,
  arrow: ArrowIcon,
  rect: RectIcon,
  ellipse: EllipseIcon,
  triangle: TriangleIcon,
  polygon: PolygonIcon,
  freepoly: FreePolyIcon,
  curve: CurveIcon,
  angle: AngleIcon,
};

/** Draw: TWO stacked lines — the contextual controls for the active mode on
 *  top, the mode selector on the bottom line, nearest the Draw button. */
function PenOptions(): JSX.Element {
  const drawMode = useBoardStore((s) => s.drawMode);
  const setDrawMode = useBoardStore((s) => s.setDrawMode);
  const aspectLock = useBoardStore((s) => s.aspectLock);
  const setAspectLock = useBoardStore((s) => s.setAspectLock);
  const polygonSides = useBoardStore((s) => s.polygonSides);
  const setPolygonSides = useBoardStore((s) => s.setPolygonSides);

  // Freehand and highlighter are freehand-family (size + colour only); every
  // other draw mode is a geometric shape (border width, fill, aspect, ...).
  const shapeMode = drawMode !== "free" && drawMode !== "highlighter";

  return (
    <div className="island stacked" id="options">
      <div className="opt-line">
        {(drawMode === "rect" || drawMode === "ellipse") && (
          <>
            {/* SQUARE / CIRCLE mode: lock the drag box square. A toggle (not a
                held key) so it works on touch; Shift still flips grid snapping. */}
            <button
              className={"btn small" + (aspectLock ? " active" : "")}
              id="aspectBtn"
              title={
                drawMode === "rect"
                  ? "Square — keep both sides equal"
                  : "Circle — keep both radii equal"
              }
              aria-pressed={aspectLock}
              onClick={() => setAspectLock(!aspectLock)}
            >
              <span className="ico">
                {drawMode === "rect" ? <SquareIcon /> : <CircleIcon />}
              </span>
            </button>
            <span className="opt-sep" />
          </>
        )}

        {drawMode === "polygon" && (
          <>
            <div className="sides-stepper" title="Number of sides">
              <button
                className="btn small"
                id="sidesDown"
                aria-label="Fewer sides"
                disabled={polygonSides <= POLYGON_SIDES_RANGE.min}
                onClick={() =>
                  setPolygonSides(
                    Math.max(POLYGON_SIDES_RANGE.min, polygonSides - 1),
                  )
                }
              >
                −
              </button>
              <span className="sides-val" id="sidesVal">
                {polygonSides}
              </span>
              <button
                className="btn small"
                id="sidesUp"
                aria-label="More sides"
                disabled={polygonSides >= POLYGON_SIDES_RANGE.max}
                onClick={() =>
                  setPolygonSides(
                    Math.min(POLYGON_SIDES_RANGE.max, polygonSides + 1),
                  )
                }
              >
                +
              </button>
            </div>
            <span className="opt-sep" />
          </>
        )}

        <SizeSlider
          label={shapeMode ? "Border width" : "Size"}
          dotOpacity={drawMode === "highlighter" ? 0.4 : 1}
        />
        <ColourSwatch title={shapeMode ? "Border colour" : "Colour"} />
        {shapeMode &&
          (drawMode === "freepoly" || isClosed(drawMode as ShapeKind)) && (
            <FillSwatch />
          )}
        <SnapToggle />
      </div>

      <div className="mode-row" role="group" aria-label="Drawing mode">
        {DRAW_MODES.map(({ mode, label }) => {
          const Icon = MODE_ICONS[mode];
          const hint = keyHint("mode-" + mode);
          return (
            <button
              key={mode}
              className={"btn small mode" + (drawMode === mode ? " active" : "")}
              id={"mode-" + mode}
              title={hint ? `${label} (${hint})` : label}
              aria-label={label}
              onClick={() => setDrawMode(mode)}
            >
              <span className="ico">
                <Icon />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextOptions(): JSX.Element {
  return (
    <div className="island" id="options">
      <SizeSlider glyph="A" />
      <ColourSwatch />
      <span className="opt-sep" />
      <AlignGroup />
    </div>
  );
}

function MathOptions(): JSX.Element {
  return (
    <div className="island" id="options">
      <SizeSlider glyph="√" />
      <ColourSwatch />
    </div>
  );
}

function EraserOptions(): JSX.Element {
  return (
    <div className="island" id="options">
      <SizeSlider dotOpacity={0.55} />
    </div>
  );
}

// --- the table (array order = dock order) ------------------------------------

export const TOOL_UI: ToolUiSpec[] = [
  {
    tool: "select",
    domId: "selectBtn",
    icon: SelectIcon,
    label: "Select",
    title: (hint) =>
      `Select & move (${hint}) — click a shape or drawing, drag empty space to lasso, ${keyHint("selectAll")} for all`,
    // The dock arrow always returns the NORMAL pointer (the key toggles the laser).
    pick: () => {
      const st = useBoardStore.getState();
      st.setTool("select");
      st.setLaserMode(false);
    },
    shortcut: {
      id: "tool-select",
      keys: [["1"], ["V"]],
      label: "Select & move (press again for the laser pointer)",
      run: selectOrToggleLaser,
    },
    Options: SelectOptions,
  },
  {
    tool: "pan",
    domId: "panBtn",
    icon: HandIcon,
    label: "Pan",
    title: (hint) => `Move the view (${hint})`,
    shortcut: { id: "tool-pan", keys: [["2"], ["H"]], label: "Pan the view" },
  },
  {
    tool: "pen",
    domId: "drawBtn",
    icon: DrawIcon,
    label: "Draw",
    title: (hint) => `Draw (${hint} — press again to cycle the modes)`,
    shortcut: {
      id: "tool-draw",
      keys: [["3"], ["D"]],
      label: "Draw — press again to cycle the drawing modes",
      run: drawOrCycle,
    },
    Options: PenOptions,
  },
  {
    tool: "eraser",
    domId: "eraserBtn",
    icon: EraserIcon,
    label: "Eraser",
    title: (hint) => `Eraser (${hint})`,
    shortcut: { id: "tool-eraser", keys: [["4"], ["E"]], label: "Eraser" },
    Options: EraserOptions,
  },
  {
    tool: "text",
    domId: "textBtn",
    icon: TextIcon,
    label: "Text",
    title: (hint) => `Type text (${hint})`,
    shortcut: { id: "tool-text", keys: [["5"], ["T"]], label: "Text" },
    Options: TextOptions,
  },
  {
    tool: "math",
    domId: "mathBtn",
    icon: MathIcon,
    label: "Maths notation",
    title: (hint) => `Type maths — fractions, powers, roots (${hint})`,
    shortcut: {
      id: "tool-math",
      keys: [["6"], ["M"]],
      label: "Maths notation",
    },
    Options: MathOptions,
  },
];

export function toolUiFor(tool: ToolName): ToolUiSpec | undefined {
  return TOOL_UI.find((t) => t.tool === tool);
}
