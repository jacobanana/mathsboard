// The contextual options pill (#options), a floating layer that sits just
// above the bottom tool dock:
//
//   tool === "pen"    -> TWO stacked lines: the contextual menu (size slider +
//                        border colour; shape modes add the background (fill)
//                        colour, the polygon-sides stepper, the square/circle
//                        lock and the grid-snap toggle) on TOP, and the DRAW
//                        MODE selector (freehand + the shape kinds, roadmap A2)
//                        on the BOTTOM line, nearest the dock's Draw button.
//   tool === "select" -> manipulate only (move / resize / rotate on the canvas);
//                        the pointer NEVER carries a styling panel. In collab
//                        builds it shows the laser toggle, otherwise nothing.
//   tool === "text"   -> size slider (textSize) + colour dropdown.
//   tool === "math"   -> size slider (mathSize) + colour dropdown.
//   tool === "eraser" -> size slider (eraserSize) only.
//   otherwise          -> nothing (the pill disappears).
//
// Because the pill is its own fixed-position layer, its appearance never
// displaces the dock or any other button — the dock stays static while the
// options animate in and out above it (CSS #options).
//
// EDIT MODE. Restyling an existing object is done by EDITING IT WITH ITS OWN
// TOOL: double-clicking an object switches to the tool that draws it (text ->
// text, maths -> math, shape -> pen@its-kind, a pencil stroke -> pen freehand)
// and keeps it selected — see select.ts editObjectAt. So when a TEXT / MATHS /
// SHAPE object or a pen STROKE is the active edit target (a single selection of
// that type, or a text/maths object open in its overlay), this pill both
// reflects that target's own colour/size AND writes changes straight back to it
// (updateObject / updateStroke), on top of updating the drawing defaults.

import { useRef, useState } from "react";
import {
  useBoardStore,
  activeTextObjectId,
  activeMathObjectId,
  activeShapeObjectId,
  activeStrokeId as activeStrokeSel,
} from "@/board/store";
import type { DrawMode } from "@/board/store";
import { COLLAB_ENABLED } from "@/config";
import { Popover } from "@/ui/Popover";
import { keyHint } from "@/ui/shortcuts";
import {
  FILL_PALETTE,
  LASER_PALETTE,
  PALETTE,
  PEN_SIZE_RANGE,
  POLYGON_SIDES_RANGE,
  SHAPE_WIDTH_RANGE,
  TEXT_SIZE_RANGE,
  MATH_SIZE_RANGE,
  ERASER_SIZE_RANGE,
} from "@/ui/constants";
import { textSizeOf } from "@/canvas/drawHelpers";
import { paramsOf, sizedBox } from "@/board/sizing";
import { MATH_BASE_PX } from "@/tools/mathtext";
import { isClosed } from "@/tools/shape/geometry";
import type { ShapeKind } from "@/tools/shape/geometry";
import {
  AngleIcon,
  ArrowIcon,
  CircleIcon,
  CurveIcon,
  EllipseIcon,
  FrameIcon,
  FreePolyIcon,
  LaserIcon,
  LineIcon,
  PolygonIcon,
  RectIcon,
  ScribbleIcon,
  SnapIcon,
  SquareIcon,
  TriangleIcon,
} from "@/ui/icons";

/** The draw tool's mode row: freehand plus every shape kind, exhaustively. */
const DRAW_MODES: {
  mode: DrawMode;
  label: string;
  hintId: string;
  Icon: () => JSX.Element;
}[] = [
  { mode: "free", label: "Freehand", hintId: "mode-free", Icon: ScribbleIcon },
  { mode: "line", label: "Line", hintId: "mode-line", Icon: LineIcon },
  { mode: "arrow", label: "Arrow", hintId: "mode-arrow", Icon: ArrowIcon },
  { mode: "rect", label: "Rectangle", hintId: "mode-rect", Icon: RectIcon },
  { mode: "ellipse", label: "Ellipse", hintId: "mode-ellipse", Icon: EllipseIcon },
  { mode: "triangle", label: "Triangle", hintId: "mode-triangle", Icon: TriangleIcon },
  { mode: "polygon", label: "Polygon", hintId: "mode-polygon", Icon: PolygonIcon },
  {
    mode: "freepoly",
    label: "Point-by-point polygon",
    hintId: "mode-freepoly",
    Icon: FreePolyIcon,
  },
  { mode: "curve", label: "Curve", hintId: "mode-curve", Icon: CurveIcon },
  { mode: "angle", label: "Angle", hintId: "mode-angle", Icon: AngleIcon },
];

/** One swatch button showing `value`; clicking opens a palette popover.
 *  Supports the "none" (transparent) swatch for shape backgrounds. */
function SwatchPicker({
  id,
  title,
  value,
  palette,
  onPick,
}: {
  id: string;
  title: string;
  value: string;
  palette: [string, string][];
  onPick: (hex: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const name = palette.find(([, hex]) => hex === value)?.[0] ?? value;

  return (
    <>
      <button
        ref={btnRef}
        className="btn small"
        id={id}
        title={title + " — " + name}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={"color-cur" + (value === "none" ? " none" : "")}
          style={value === "none" ? undefined : { background: value }}
        />
        <span className="color-caret">▾</span>
      </button>
      <Popover
        anchor={open ? btnRef.current : null}
        onClose={() => setOpen(false)}
        side="top"
        align="right"
        id={id + "Menu"}
        className="swatch-menu"
      >
        {palette.map(([label, hex]) => (
          <button
            key={hex}
            className={
              "swatch" +
              (hex === "none" ? " none" : "") +
              (value === hex ? " active" : "")
            }
            style={hex === "none" ? undefined : { background: hex }}
            title={label}
            onClick={() => {
              onPick(hex);
              setOpen(false);
            }}
          />
        ))}
      </Popover>
    </>
  );
}

/** The snap-to-grid toggle (roadmap A3): active on squared paper only. */
function SnapToggle(): JSX.Element {
  const snap = useBoardStore((s) => s.snap);
  const setSnap = useBoardStore((s) => s.setSnap);
  const squared = useBoardStore((s) => s.board.background === "squared");
  return (
    <button
      className={"btn small" + (snap && squared ? " active" : "")}
      id="snapBtn"
      title={
        `Snap to the grid (${keyHint("snap")})` +
        (squared ? " — hold Alt to bypass" : " — squared paper only")
      }
      aria-pressed={snap && squared}
      disabled={!squared}
      onClick={() => setSnap(!snap)}
    >
      <span className="ico">
        <SnapIcon />
      </span>
    </button>
  );
}

/** The laser-pointer toggle: lives on the pointer (Select) tool. While on, the
 *  pointer becomes an aiming laser — point over a call, click to bring the
 *  other users to a spot, Shift-drag an area to zoom them to it. */
function LaserToggle(): JSX.Element {
  const on = useBoardStore((s) => s.laserMode);
  const toggle = useBoardStore((s) => s.toggleLaserMode);
  return (
    <button
      className={"btn small" + (on ? " active" : "")}
      id="laserBtn"
      title={
        `Laser pointer (${keyHint("tool-select")} again) — point over a call; ` +
        "click to bring others to a spot, Shift-drag an area to zoom them to it"
      }
      aria-pressed={on}
      aria-label="Laser pointer"
      onClick={() => toggle()}
    >
      <span className="ico">
        <LaserIcon />
      </span>
    </button>
  );
}

/** Arm "frame an area" for the laser — the Shift-less way to frame on a tablet.
 *  Draw a box and everyone zooms to it, then it reverts to pointing. */
function LaserFrameToggle(): JSX.Element {
  const on = useBoardStore((s) => s.laserFrame);
  const toggle = useBoardStore((s) => s.toggleLaserFrame);
  return (
    <button
      className={"btn small" + (on ? " active" : "")}
      id="laserFrameBtn"
      title="Frame an area to zoom everyone to it — draw a box (reverts to pointing after). On a laptop, hold Shift instead."
      aria-pressed={on}
      aria-label="Frame an area"
      onClick={() => toggle()}
    >
      <span className="ico">
        <FrameIcon />
      </span>
    </button>
  );
}

/** The laser colour swatch (its own vivid palette, broadcast with the trail). */
function LaserColorPicker(): JSX.Element {
  const color = useBoardStore((s) => s.laserColor);
  const setLaserColor = useBoardStore((s) => s.setLaserColor);
  return (
    <SwatchPicker
      id="laserColorBtn"
      title={`Laser colour (${keyHint("cycleColor")})`}
      value={color}
      palette={LASER_PALETTE}
      onPick={setLaserColor}
    />
  );
}

export function OptionsStrip(): JSX.Element | null {
  const tool = useBoardStore((s) => s.tool);
  const laserMode = useBoardStore((s) => s.laserMode);
  const drawMode = useBoardStore((s) => s.drawMode);
  const setDrawMode = useBoardStore((s) => s.setDrawMode);
  const penSize = useBoardStore((s) => s.penSize);
  const textSize = useBoardStore((s) => s.textSize);
  const mathSize = useBoardStore((s) => s.mathSize);
  const eraserSize = useBoardStore((s) => s.eraserSize);
  const fillColor = useBoardStore((s) => s.fillColor);
  const polygonSides = useBoardStore((s) => s.polygonSides);
  const aspectLock = useBoardStore((s) => s.aspectLock);
  const setAspectLock = useBoardStore((s) => s.setAspectLock);
  const color = useBoardStore((s) => s.color);
  const setColor = useBoardStore((s) => s.setColor);
  const setPenSize = useBoardStore((s) => s.setPenSize);
  const setTextSize = useBoardStore((s) => s.setTextSize);
  const setMathSize = useBoardStore((s) => s.setMathSize);
  const setEraserSize = useBoardStore((s) => s.setEraserSize);
  const setFillColor = useBoardStore((s) => s.setFillColor);
  const setPolygonSides = useBoardStore((s) => s.setPolygonSides);
  const updateObject = useBoardStore((s) => s.updateObject);
  const updateStroke = useBoardStore((s) => s.updateStroke);
  const activeTextId = useBoardStore(activeTextObjectId);
  const activeMathId = useBoardStore(activeMathObjectId);
  const activeShapeId = useBoardStore(activeShapeObjectId);
  const activeStrokeId = useBoardStore(activeStrokeSel);
  const activeShape = useBoardStore((s) =>
    activeShapeId != null
      ? s.board.objects.find((o) => o.id === activeShapeId)
      : undefined,
  );
  const activeText = useBoardStore((s) =>
    activeTextId != null
      ? s.board.objects.find((o) => o.id === activeTextId)
      : undefined,
  );
  const activeMath = useBoardStore((s) =>
    activeMathId != null
      ? s.board.objects.find((o) => o.id === activeMathId)
      : undefined,
  );
  const activeStroke = useBoardStore((s) =>
    activeStrokeId != null
      ? s.board.strokes.find((o) => o.id === activeStrokeId)
      : undefined,
  );

  // The object/stroke the active tool is editing, if any, drives the pill's
  // live values so the controls reflect what they edit (an object's own colour,
  // not just the drawing defaults). At most one is ever set — the selection is a
  // single object OR stroke of one type.
  const editColor =
    (activeStroke?.color as string | undefined) ??
    (activeShape?.stroke as string | undefined) ??
    (activeText?.color as string | undefined) ??
    (activeMath?.color as string | undefined);

  if (
    tool !== "pen" &&
    tool !== "text" &&
    tool !== "math" &&
    tool !== "eraser" &&
    tool !== "select" // the pointer always shows at least the laser toggle
  ) {
    // No options for this tool — the pill simply isn't there. It's a separate
    // floating layer, so nothing else moves when it comes and goes.
    return null;
  }

  function pickColour(hex: string): void {
    setColor(hex);
    if (activeTextId != null) updateObject(activeTextId, { color: hex });
    if (activeMathId != null) updateObject(activeMathId, { color: hex });
    if (activeShapeId != null) updateObject(activeShapeId, { stroke: hex });
    if (activeStrokeId != null) updateStroke(activeStrokeId, { color: hex });
  }

  function pickFill(hex: string): void {
    setFillColor(hex);
    if (activeShapeId != null) updateObject(activeShapeId, { fill: hex });
  }

  function pickTextSize(px: number): void {
    setTextSize(px);
    if (activeTextId != null) {
      // Re-measure so the bounding box stays correct (prototype autoSize).
      const obj = useBoardStore
        .getState()
        .board.objects.find((o) => o.id === activeTextId);
      const text = (obj?.text as string) ?? "";
      const { w, h } = textSizeOf(text, px);
      updateObject(activeTextId, { size: px, w, h });
    }
  }

  function pickMathSize(px: number): void {
    setMathSize(px);
    if (activeMathId != null) {
      // Maths size = the uniform resize scale (26px = the natural layout
      // size, scale 1) — re-derive the box like a handle-resize would.
      const obj = useBoardStore
        .getState()
        .board.objects.find((o) => o.id === activeMathId);
      if (!obj) return;
      const box = sizedBox("mathtext", paramsOf(obj), px / MATH_BASE_PX);
      if (box) updateObject(activeMathId, { w: box.w, h: box.h });
    }
  }

  function pickPenSize(px: number): void {
    setPenSize(px);
    if (activeShapeId != null) updateObject(activeShapeId, { strokeWidth: px });
    if (activeStrokeId != null) updateStroke(activeStrokeId, { size: px });
  }

  // --- SELECT tool in LASER mode: the laser toggle + the area-frame toggle.
  // Takes priority over shape styling — you can't edit a shape while aiming.
  // (laserMode is only reachable in collab builds; see the gating below.)
  if (tool === "select" && laserMode) {
    return (
      <div className="island" id="options">
        <LaserToggle />
        <LaserFrameToggle />
        <LaserColorPicker />
      </div>
    );
  }

  // --- SELECT tool: manipulate only ----------------------------------------
  // The pointer tool never carries a styling panel — selecting a shape shows
  // move / resize / rotate chrome on the canvas, not colour/width controls.
  // To restyle an object you double-click it (edit mode: its own drawing tool
  // takes over and this pill styles it live). So the pointer shows only the
  // laser toggle, and only in collab builds (the laser is a sharing feature).
  if (tool === "select") {
    if (!COLLAB_ENABLED) return null;
    return (
      <div className="island" id="options">
        <LaserToggle />
      </div>
    );
  }

  // In edit mode the size control reflects the edited target's own value (an
  // object's width, a stroke's size), so the pill shows what it changes; with
  // nothing under edit it shows the drawing default.
  const [range, value, setValue] =
    tool === "pen"
      ? drawMode === "free"
        ? ([
            PEN_SIZE_RANGE,
            (activeStroke?.size as number | undefined) ?? penSize,
            pickPenSize,
          ] as const)
        : ([
            SHAPE_WIDTH_RANGE,
            (activeShape?.strokeWidth as number | undefined) ??
              Math.min(penSize, SHAPE_WIDTH_RANGE.max),
            pickPenSize,
          ] as const)
      : tool === "text"
        ? ([
            TEXT_SIZE_RANGE,
            (activeText?.size as number | undefined) ?? textSize,
            pickTextSize,
          ] as const)
        : tool === "math"
          ? ([MATH_SIZE_RANGE, mathSize, pickMathSize] as const)
          : ([ERASER_SIZE_RANGE, eraserSize, setEraserSize] as const);

  // Preview dot next to the slider: scaled into the 6-22px display band so the
  // 120px eraser doesn't blow the toolbar height.
  const frac = (value - range.min) / (range.max - range.min);
  const dot = Math.round(6 + frac * 16);

  const shapeMode = tool === "pen" && drawMode !== "free";

  // The contextual controls for the active tool/mode: for the pen, the settings
  // that style the selected draw mode (aspect/sides, size, colour, fill, snap);
  // for text/math/eraser simply size (+ colour). For the pen these ride the TOP
  // line, floating above the draw-mode selector.
  const controls = (
    <>
      {tool === "pen" && (drawMode === "rect" || drawMode === "ellipse") && (
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

      {tool === "pen" && drawMode === "polygon" && (
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

      <label
        className="size-wrap"
        title={
          (shapeMode ? "Border width" : "Size") +
          ` (${keyHint("sizeUp")}/${keyHint("sizeDown")}) — ${value}px`
        }
      >
        <input
          type="range"
          className="size-slider"
          id="sizeSlider"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
        {tool === "text" || tool === "math" ? (
          <span
            className="size-glyph"
            style={{ fontSize: Math.max(11, dot) }}
          >
            {tool === "math" ? "√" : "A"}
          </span>
        ) : (
          <span
            className="size-dot"
            style={{
              width: dot,
              height: dot,
              background: "currentColor",
              opacity: tool === "eraser" ? 0.55 : 1,
            }}
          />
        )}
      </label>

      {tool !== "eraser" && (
        <SwatchPicker
          id="colorBtn"
          title={
            (shapeMode ? "Border colour" : "Colour") +
            ` (${keyHint("cycleColor")})`
          }
          value={editColor ?? color}
          palette={PALETTE}
          onPick={pickColour}
        />
      )}

      {shapeMode &&
        (drawMode === "freepoly" || isClosed(drawMode as ShapeKind)) && (
        <SwatchPicker
          id="fillBtn"
          title="Background colour"
          value={(activeShape?.fill as string | undefined) ?? fillColor}
          palette={FILL_PALETTE}
          onPick={pickFill}
        />
      )}

      {tool === "pen" && <SnapToggle />}
    </>
  );

  // The draw tool spreads over two lines: the contextual menu on the TOP line,
  // and the draw-mode selector (its "sub-tool" picker) on the BOTTOM line,
  // nearest the dock — so the mode buttons sit directly above the Draw button.
  if (tool === "pen") {
    return (
      <div className="island stacked" id="options">
        <div className="opt-line">{controls}</div>
        <div className="mode-row" role="group" aria-label="Drawing mode">
          {DRAW_MODES.map(({ mode, label, hintId, Icon }) => (
            <button
              key={mode}
              className={"btn small mode" + (drawMode === mode ? " active" : "")}
              id={"mode-" + mode}
              title={keyHint(hintId) ? `${label} (${keyHint(hintId)})` : label}
              aria-label={label}
              onClick={() => setDrawMode(mode)}
            >
              <span className="ico">
                <Icon />
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="island" id="options">
      {controls}
    </div>
  );
}
