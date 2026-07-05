// Shape settings (EDIT flow — shapes are created by dragging, so this dialog
// only ever opens on an existing shape via double-click / the float edit
// button). Exact parametric control to complement the on-canvas handles:
//   - polygon: number of sides (regenerates a regular n-gon in the same box);
//   - angle:   the exact measure in degrees (rotates the second arm);
//   - triangle / polygon / angle: show or hide the angle measures;
//   - arrow:   head at both ends;
//   - all:     background (fill) colour, border colour, width and dashes.

import { useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { ShapeParams } from "@/tools/shape";
import { NO_FILL } from "@/tools/shape";
import {
  angleSweepDeg,
  apexFromBaseAngles,
  armForAngle,
  hasAngles,
  interiorAngles,
  isClosed,
  regularPolygonPts,
  renormalize,
} from "@/tools/shape/geometry";
import { FILL_PALETTE, PALETTE } from "@/ui/constants";

const KIND_NAMES: Record<ShapeParams["kind"], string> = {
  line: "Line",
  arrow: "Arrow",
  rect: "Rectangle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  polygon: "Polygon",
  curve: "Curve",
  angle: "Angle",
};

function SwatchRow({
  value,
  swatches,
  onPick,
}: {
  value: string;
  swatches: [string, string][];
  onPick: (hex: string) => void;
}): JSX.Element {
  return (
    <div className="swatch-row">
      {swatches.map(([label, hex]) => (
        <button
          key={hex}
          type="button"
          className={
            "swatch" +
            (hex === NO_FILL ? " none" : "") +
            (value === hex ? " active" : "")
          }
          style={hex === NO_FILL ? undefined : { background: hex }}
          title={label}
          onClick={() => onPick(hex)}
        />
      ))}
    </div>
  );
}

export function ShapeDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<ShapeParams>) {
  const editing = initial != null;
  // Shapes are never created from the gallery, so initial is always present;
  // fall back to safe values so a stray CREATE open can't crash.
  const p: ShapeParams = initial ?? {
    kind: "rect",
    nw: 150,
    nh: 105,
    pts: [],
    stroke: PALETTE[0][1],
    strokeWidth: 3,
    fill: NO_FILL,
    dash: false,
    showAngles: false,
    both: false,
  };

  const [stroke, setStroke] = useState(p.stroke);
  const [fill, setFill] = useState(p.fill || NO_FILL);
  const [width, setWidth] = useState(p.strokeWidth);
  const [dash, setDash] = useState(p.dash);
  const [showAngles, setShowAngles] = useState(p.showAngles);
  const [both, setBoth] = useState(p.both);
  const [sides, setSides] = useState(String(Math.max(p.pts.length, 3)));
  // Triangle base angles (vertex order from creation: [apex, right, left] —
  // vertex drags keep that order). The apex angle is derived: sum is 180°.
  const triAngles =
    p.kind === "triangle" && p.pts.length === 3 ? interiorAngles(p.pts) : null;
  const [leftAngle, setLeftAngle] = useState(
    triAngles ? String(Math.round(triAngles[2] * 10) / 10) : "",
  );
  const [rightAngle, setRightAngle] = useState(
    triAngles ? String(Math.round(triAngles[1] * 10) / 10) : "",
  );
  const initialAngle =
    p.kind === "angle" && p.pts.length === 3
      ? Math.round(angleSweepDeg(p.pts[0], p.pts[1], p.pts[2]) * 10) / 10
      : 0;
  const [angle, setAngle] = useState(String(initialAngle));
  const [err, setErr] = useState("");

  function submit(): void {
    const next: ShapeParams = {
      ...p,
      stroke,
      fill,
      strokeWidth: width,
      dash,
      showAngles,
      both,
    };

    if (p.kind === "polygon") {
      const n = Math.round(parseFloat(sides));
      if (Number.isNaN(n) || n < 3 || n > 12) {
        setErr("A polygon needs between 3 and 12 sides.");
        return;
      }
      if (n !== p.pts.length) {
        // Regenerate a REGULAR n-gon in the current natural box; unchanged
        // side counts keep any hand-dragged vertices as they are.
        const reg = renormalize(regularPolygonPts(n, p.nw, p.nh));
        next.pts = reg.pts;
        next.nw = reg.nw;
        next.nh = reg.nh;
      }
    }

    if (triAngles) {
      const l = parseFloat(leftAngle);
      const r = parseFloat(rightAngle);
      if (Number.isNaN(l) || Number.isNaN(r) || l <= 0 || r <= 0 || l + r >= 180) {
        setErr("The two base angles must be positive and add up to less than 180°.");
        return;
      }
      const changed =
        Math.abs(l - triAngles[2]) > 0.05 || Math.abs(r - triAngles[1]) > 0.05;
      if (changed) {
        // Keep the base edge (left→right) fixed and re-place the apex.
        const [apex, br, bl] = p.pts;
        const newApex = apexFromBaseAngles(bl, br, apex, l, r);
        const n = renormalize([newApex, br, bl]);
        next.pts = n.pts;
        next.nw = n.nw;
        next.nh = n.nh;
      }
    }

    if (p.kind === "angle" && p.pts.length === 3) {
      const a = parseFloat(angle);
      if (Number.isNaN(a) || a <= 0 || a >= 360) {
        setErr("The angle must be between 0 and 360 degrees.");
        return;
      }
      if (Math.abs(a - initialAngle) > 1e-9) {
        const [v, armA, armB] = p.pts;
        const rot = armForAngle(v, armA, armB, a);
        const n = renormalize([v, armA, rot]);
        next.pts = n.pts;
        next.nw = n.nw;
        next.nh = n.nh;
      }
    }

    onSubmit(next);
  }

  return (
    <>
      <h2>{KIND_NAMES[p.kind]}</h2>
      <p className="hint">
        Drag the round handles on the board to reshape it; set exact values
        here.
      </p>

      {p.kind === "polygon" && (
        <div className="field">
          <label htmlFor="shSides">Number of sides</label>
          <input
            id="shSides"
            type="number"
            min={3}
            max={12}
            value={sides}
            onChange={(e) => setSides(e.target.value)}
          />
        </div>
      )}

      {triAngles && (
        <>
          <div className="field">
            <label htmlFor="shLeftAngle">Left base angle (degrees)</label>
            <input
              id="shLeftAngle"
              type="number"
              min={1}
              max={178}
              step="any"
              value={leftAngle}
              onChange={(e) => setLeftAngle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="shRightAngle">Right base angle (degrees)</label>
            <input
              id="shRightAngle"
              type="number"
              min={1}
              max={178}
              step="any"
              value={rightAngle}
              onChange={(e) => setRightAngle(e.target.value)}
            />
          </div>
          <p className="hint">
            Top angle:{" "}
            {(() => {
              const l = parseFloat(leftAngle);
              const r = parseFloat(rightAngle);
              return Number.isNaN(l) || Number.isNaN(r) || l + r >= 180
                ? "—"
                : Math.round((180 - l - r) * 10) / 10 + "°";
            })()}{" "}
            (the three angles always add up to 180°). Quick presets:
          </p>
          <div className="card-actions" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className="btn"
              id="shRightTri"
              onClick={() => {
                setLeftAngle("90");
                setRightAngle("45");
              }}
            >
              Right-angled
            </button>
            <button
              type="button"
              className="btn"
              id="shEquilateral"
              onClick={() => {
                setLeftAngle("60");
                setRightAngle("60");
              }}
            >
              Equilateral
            </button>
            <button
              type="button"
              className="btn"
              id="shIsosceles"
              onClick={() => {
                setLeftAngle("70");
                setRightAngle("70");
              }}
            >
              Isosceles
            </button>
          </div>
        </>
      )}

      {p.kind === "angle" && (
        <div className="field">
          <label htmlFor="shAngle">Angle (degrees)</label>
          <input
            id="shAngle"
            type="number"
            min={1}
            max={359}
            step="any"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
          />
        </div>
      )}

      {hasAngles(p.kind) && (
        <label className="field check">
          <input
            id="shShowAngles"
            type="checkbox"
            checked={showAngles}
            onChange={(e) => setShowAngles(e.target.checked)}
          />
          <span>Show the angle measures</span>
        </label>
      )}

      {p.kind === "arrow" && (
        <label className="field check">
          <input
            id="shBoth"
            type="checkbox"
            checked={both}
            onChange={(e) => setBoth(e.target.checked)}
          />
          <span>Arrow head at both ends</span>
        </label>
      )}

      <div className="field">
        <label>Border colour</label>
        <SwatchRow value={stroke} swatches={PALETTE} onPick={setStroke} />
      </div>

      {isClosed(p.kind) && (
        <div className="field">
          <label>Background colour</label>
          <SwatchRow value={fill} swatches={FILL_PALETTE} onPick={setFill} />
        </div>
      )}

      <div className="field">
        <label htmlFor="shWidth">Border width — {width}px</label>
        <input
          id="shWidth"
          type="range"
          min={1}
          max={12}
          step={1}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
        />
      </div>

      <label className="field check">
        <input
          id="shDash"
          type="checkbox"
          checked={dash}
          onChange={(e) => setDash(e.target.checked)}
        />
        <span>Dashed border</span>
      </label>

      <p className="err" id="shErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="shCancel" onClick={onCancel}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button className="btn primary" id="shSave" onClick={submit}>
          {editing ? "Save" : "Add to board"}
        </button>
      </div>
    </>
  );
}
