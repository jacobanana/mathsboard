// The contextual options pill (#options), a floating layer that sits just
// above the bottom tool dock:
//
//   tool === "pen"    -> DRAW MODES (freehand + the shape kinds, roadmap A2)
//                        + size slider + border colour; shape modes add the
//                        background (fill) colour, the polygon-sides stepper
//                        and the grid-snap toggle.
//   tool === "select" -> when a single SHAPE is selected: its border width /
//                        border colour / background colour, edited live, plus
//                        the snap toggle (styling a shape after the fact —
//                        the industry-standard selection panel, kept tiny).
//   tool === "text"   -> size slider (textSize) + colour dropdown.
//   tool === "math"   -> size slider (mathSize) + colour dropdown.
//   tool === "eraser" -> size slider (eraserSize) only.
//   otherwise          -> nothing (the pill disappears).
//
// Because the pill is its own fixed-position layer, its appearance never
// displaces the dock or any other button — the dock stays static while the
// options animate in and out above it (CSS #options).
//
// Selecting a colour or size updates the store's ephemeral drawing state.
// Additionally — mirroring the prototype, where changing colour/size while a
// text object is selected or being edited mutates that object live — when a
// TEXT / MATHS / SHAPE object is the current selection (or is being edited via
// its overlay), the change is also written back through updateObject so the
// object updates immediately.

import { useRef, useState } from "react";
import {
  useBoardStore,
  activeTextObjectId,
  activeMathObjectId,
  activeShapeObjectId,
} from "@/board/store";
import type { DrawMode } from "@/board/store";
import { Popover } from "@/ui/Popover";
import { keyHint } from "@/ui/shortcuts";
import {
  FILL_PALETTE,
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
  FreePolyIcon,
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

export function OptionsStrip(): JSX.Element | null {
  const tool = useBoardStore((s) => s.tool);
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
  const activeTextId = useBoardStore(activeTextObjectId);
  const activeMathId = useBoardStore(activeMathObjectId);
  const activeShapeId = useBoardStore(activeShapeObjectId);
  const activeShape = useBoardStore((s) =>
    activeShapeId != null
      ? s.board.objects.find((o) => o.id === activeShapeId)
      : undefined,
  );

  const shapeSelected = tool === "select" && activeShape != null;
  if (
    tool !== "pen" &&
    tool !== "text" &&
    tool !== "math" &&
    tool !== "eraser" &&
    !shapeSelected
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
  }

  // --- SELECT tool: live styling for the selected shape --------------------
  if (shapeSelected) {
    const kind = activeShape.kind as ShapeKind;
    const width = (activeShape.strokeWidth as number) ?? 3;
    const frac =
      (width - SHAPE_WIDTH_RANGE.min) /
      (SHAPE_WIDTH_RANGE.max - SHAPE_WIDTH_RANGE.min);
    const dot = Math.round(6 + frac * 16);
    return (
      <div className="island" id="options">
        <label className="size-wrap" title={`Border width — ${width}px`}>
          <input
            type="range"
            className="size-slider"
            id="sizeSlider"
            min={SHAPE_WIDTH_RANGE.min}
            max={SHAPE_WIDTH_RANGE.max}
            step={SHAPE_WIDTH_RANGE.step}
            value={width}
            onChange={(e) =>
              updateObject(activeShapeId!, {
                strokeWidth: Number(e.target.value),
              })
            }
          />
          <span
            className="size-dot"
            style={{ width: dot, height: dot, background: "currentColor" }}
          />
        </label>
        <SwatchPicker
          id="strokeBtn"
          title={`Border colour (${keyHint("cycleColor")})`}
          value={(activeShape.stroke as string) ?? color}
          palette={PALETTE}
          onPick={pickColour}
        />
        {isClosed(kind) && (
          <SwatchPicker
            id="fillBtn"
            title="Background colour"
            value={(activeShape.fill as string) ?? "none"}
            palette={FILL_PALETTE}
            onPick={pickFill}
          />
        )}
        <SnapToggle />
      </div>
    );
  }

  const [range, value, setValue] =
    tool === "pen"
      ? drawMode === "free"
        ? ([PEN_SIZE_RANGE, penSize, pickPenSize] as const)
        : ([
            SHAPE_WIDTH_RANGE,
            Math.min(penSize, SHAPE_WIDTH_RANGE.max),
            pickPenSize,
          ] as const)
      : tool === "text"
        ? ([TEXT_SIZE_RANGE, textSize, pickTextSize] as const)
        : tool === "math"
          ? ([MATH_SIZE_RANGE, mathSize, pickMathSize] as const)
          : ([ERASER_SIZE_RANGE, eraserSize, setEraserSize] as const);

  // Preview dot next to the slider: scaled into the 6-22px display band so the
  // 120px eraser doesn't blow the toolbar height.
  const frac = (value - range.min) / (range.max - range.min);
  const dot = Math.round(6 + frac * 16);

  const shapeMode = tool === "pen" && drawMode !== "free";

  return (
    <div className="island" id="options">
      {tool === "pen" && (
        <>
          <div className="mode-row" role="group" aria-label="Drawing mode">
            {DRAW_MODES.map(({ mode, label, hintId, Icon }) => (
              <button
                key={mode}
                className={"btn small mode" + (drawMode === mode ? " active" : "")}
                id={"mode-" + mode}
                title={`${label} (${keyHint(hintId)})`}
                aria-label={label}
                onClick={() => setDrawMode(mode)}
              >
                <span className="ico">
                  <Icon />
                </span>
              </button>
            ))}
          </div>
          <span className="opt-sep" />
        </>
      )}

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
          value={color}
          palette={PALETTE}
          onPick={pickColour}
        />
      )}

      {shapeMode &&
        (drawMode === "freepoly" || isClosed(drawMode as ShapeKind)) && (
        <SwatchPicker
          id="fillBtn"
          title="Background colour"
          value={fillColor}
          palette={FILL_PALETTE}
          onPick={pickFill}
        />
      )}

      {tool === "pen" && <SnapToggle />}
    </div>
  );
}
