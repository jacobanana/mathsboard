// The contextual options zone (#options), rendered right after the tool
// buttons:
//
//   tool === "pen"    -> size slider (penSize) + colour dropdown.
//   tool === "text"   -> size slider (textSize) + colour dropdown.
//   tool === "eraser" -> size slider (eraserSize) only.
//   otherwise          -> the zone stays, empty.
//
// The zone has a FIXED width (CSS #options) and is always rendered, so the
// toolbar never reflows when the tool changes — contextual controls appear
// inside their dedicated slot, never displacing the buttons around it.
//
// The size presets of the prototype (S/M/L buttons) are replaced by a slider;
// the colour swatch row is collapsed into ONE button showing the current
// colour that opens a small palette popover.
//
// Selecting a colour or size updates the store's ephemeral drawing state.
// Additionally — mirroring the prototype, where changing colour/size while a
// text object is selected or being edited mutates that object live — when a
// TEXT object is the current selection (or is being edited via the overlay),
// the change is also written back through updateObject so the object updates
// immediately.

import { useRef, useState } from "react";
import { useBoardStore, activeTextObjectId } from "@/board/store";
import { Popover } from "@/ui/Popover";
import {
  PALETTE,
  PEN_SIZE_RANGE,
  TEXT_SIZE_RANGE,
  ERASER_SIZE_RANGE,
} from "@/ui/constants";
import { textSizeOf } from "@/canvas/drawHelpers";

/** One swatch button showing the current colour; clicking opens a popover
 *  with the full palette. Closes on pick or any outside click. */
function ColorPicker({ onPick }: { onPick: (hex: string) => void }): JSX.Element {
  const color = useBoardStore((s) => s.color);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const name = PALETTE.find(([, hex]) => hex === color)?.[0] ?? color;

  return (
    <>
      <button
        ref={btnRef}
        className="btn small"
        id="colorBtn"
        title={"Colour (C) — " + name}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="color-cur" style={{ background: color }} />
        <span className="color-caret">▾</span>
      </button>
      <Popover
        anchor={open ? btnRef.current : null}
        onClose={() => setOpen(false)}
        id="colorMenu"
      >
        {PALETTE.map(([label, hex]) => (
          <button
            key={hex}
            className={"swatch" + (color === hex ? " active" : "")}
            style={{ background: hex }}
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

export function OptionsStrip(): JSX.Element | null {
  const tool = useBoardStore((s) => s.tool);
  const penSize = useBoardStore((s) => s.penSize);
  const textSize = useBoardStore((s) => s.textSize);
  const eraserSize = useBoardStore((s) => s.eraserSize);
  const setColor = useBoardStore((s) => s.setColor);
  const setPenSize = useBoardStore((s) => s.setPenSize);
  const setTextSize = useBoardStore((s) => s.setTextSize);
  const setEraserSize = useBoardStore((s) => s.setEraserSize);
  const updateObject = useBoardStore((s) => s.updateObject);
  const activeTextId = useBoardStore(activeTextObjectId);

  if (tool !== "pen" && tool !== "text" && tool !== "eraser") {
    // Keep the zone (fixed width) so neighbouring buttons don't shift.
    return <div className="group" id="options" />;
  }

  function pickColour(hex: string): void {
    setColor(hex);
    if (activeTextId != null) updateObject(activeTextId, { color: hex });
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

  const [range, value, setValue] =
    tool === "pen"
      ? ([PEN_SIZE_RANGE, penSize, setPenSize] as const)
      : tool === "text"
        ? ([TEXT_SIZE_RANGE, textSize, pickTextSize] as const)
        : ([ERASER_SIZE_RANGE, eraserSize, setEraserSize] as const);

  // Preview dot next to the slider: scaled into the 6-22px display band so the
  // 120px eraser doesn't blow the toolbar height.
  const frac = (value - range.min) / (range.max - range.min);
  const dot = Math.round(6 + frac * 16);

  return (
    <div className="group" id="options">
      <label className="size-wrap" title={"Size (+/-) — " + value + "px"}>
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
        {tool === "text" ? (
          <span
            className="size-glyph"
            style={{ fontSize: Math.max(11, dot) }}
          >
            A
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

      {tool !== "eraser" && <ColorPicker onPick={pickColour} />}
    </div>
  );
}
