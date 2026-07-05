// SHARED OPTIONS-PILL CONTROLS. The building blocks tool Options components
// (ui/toolSpecs.tsx) compose: swatch pickers, the size slider, toggles. Each
// control binds itself to the styling service (board/styling.ts), so every
// tool's pill restyles the live edit target through the same pipeline as the
// keyboard shortcuts — a tool's Options component is pure composition.

import { useRef, useState } from "react";
import { useBoardStore } from "@/board/store";
import { applyStyle, sizeBinding, sizeValue, styleValue } from "@/board/styling";
import { Popover } from "@/ui/Popover";
import { keyHint } from "@/ui/shortcuts";
import { FILL_PALETTE, LASER_PALETTE, PALETTE } from "@/ui/constants";
import { focusActiveTextEdit } from "@/canvas/textEditor";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  FrameIcon,
  LaserIcon,
  SnapIcon,
} from "@/ui/icons";

/** Keep the in-place text editor focused when clicking an options control:
 *  preventing the mousedown default stops the textarea from blurring (which
 *  would commit and end the edit), so restyling text stays inside the edit
 *  session. Harmless for every other tool (toolbar buttons don't want focus). */
export const preventBlur = (e: { preventDefault: () => void }): void =>
  e.preventDefault();

/** One swatch button showing `value`; clicking opens a palette popover.
 *  Supports the "none" (transparent) swatch for shape backgrounds. */
export function SwatchPicker({
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
        onMouseDown={preventBlur}
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
            onMouseDown={preventBlur}
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

/** The active tool's SIZE slider, bound to the styling service: the binding
 *  (channel / range / edit target) is the SAME one the +/- shortcuts use.
 *  `glyph` shows a scaling letter instead of the dot (text "A", maths "√"). */
export function SizeSlider({
  label = "Size",
  glyph,
  dotOpacity = 1,
}: {
  label?: string;
  glyph?: string;
  dotOpacity?: number;
}): JSX.Element | null {
  const tool = useBoardStore((s) => s.tool);
  const drawMode = useBoardStore((s) => s.drawMode);
  const value = useBoardStore((s) => sizeValue(s));
  const binding = sizeBinding({ tool, drawMode });
  if (!binding || value == null) return null;
  const range = binding.range;
  // Preview dot next to the slider: scaled into the 6-22px display band so
  // the 120px eraser doesn't blow the toolbar height.
  const frac = (value - range.min) / (range.max - range.min);
  const dot = Math.round(6 + frac * 16);

  return (
    <label
      className="size-wrap"
      title={`${label} (${keyHint("sizeUp")}/${keyHint("sizeDown")}) — ${value}px`}
    >
      <input
        type="range"
        className="size-slider"
        id="sizeSlider"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => applyStyle("size", Number(e.target.value))}
        // The slider must take focus to drag, which blurs the textarea; hand
        // focus back when the gesture ends so a text edit stays open (no-op
        // unless editing text). onChange has already restyled it live.
        onPointerUp={() => focusActiveTextEdit()}
        onKeyUp={() => focusActiveTextEdit()}
      />
      {glyph ? (
        <span className="size-glyph" style={{ fontSize: Math.max(11, dot) }}>
          {glyph}
        </span>
      ) : (
        <span
          className="size-dot"
          style={{
            width: dot,
            height: dot,
            background: "currentColor",
            opacity: dotOpacity,
          }}
        />
      )}
    </label>
  );
}

/** The ink-colour swatch (border colour in shape modes). */
export function ColourSwatch({ title = "Colour" }: { title?: string }): JSX.Element {
  const value = useBoardStore((s) => styleValue(s, "color"));
  return (
    <SwatchPicker
      id="colorBtn"
      title={`${title} (${keyHint("cycleColor")})`}
      value={value}
      palette={PALETTE}
      onPick={(hex) => applyStyle("color", hex)}
    />
  );
}

/** The shape-background swatch. */
export function FillSwatch(): JSX.Element {
  const value = useBoardStore((s) => styleValue(s, "fill"));
  return (
    <SwatchPicker
      id="fillBtn"
      title="Background colour"
      value={value}
      palette={FILL_PALETTE}
      onPick={(hex) => applyStyle("fill", hex)}
    />
  );
}

/** The text-alignment button group. */
export function AlignGroup(): JSX.Element {
  const alignValue = useBoardStore((s) => styleValue(s, "align"));
  return (
    <div className="align-group" role="group" aria-label="Text alignment">
      {(
        [
          ["left", "Align left", AlignLeftIcon],
          ["center", "Align centre", AlignCenterIcon],
          ["right", "Align right", AlignRightIcon],
        ] as const
      ).map(([a, label, Icon]) => {
        const on = alignValue === a;
        return (
          <button
            key={a}
            className={"btn small" + (on ? " active" : "")}
            id={"align-" + a}
            title={label}
            aria-label={label}
            aria-pressed={on}
            onMouseDown={preventBlur}
            onClick={() => applyStyle("align", a)}
          >
            <span className="ico">
              <Icon />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The snap-to-grid toggle (roadmap A3): active on squared paper only. */
export function SnapToggle(): JSX.Element {
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
export function LaserToggle(): JSX.Element {
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
export function LaserFrameToggle(): JSX.Element {
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
export function LaserColorPicker(): JSX.Element {
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
