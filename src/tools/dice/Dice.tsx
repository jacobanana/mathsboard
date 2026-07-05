// WIDGET COMPONENT — the .idice overlay: a real 3D die you click to roll.
//
// The die is rendered on its own <canvas> by a tiny painter (paintDie): rotate
// the solid's vertices by the current orientation quaternion, cull back faces,
// shade each front face by a light direction, and letter each with its number
// (or pips for the d6) drawn IN the face plane so it tumbles with the die.
//
// A roll is SHARED STATE. Clicking picks the outcome, then writes { value, roll }
// via updateWidgetState (INPUT_ORIGIN): it syncs to every collaborator and
// persists with the document — so the last value survives a reload — but is
// undo-invisible, exactly like the worksheet's typed answers. `roll` is a
// counter; every client (the roller included) watches it and, when it ticks,
// animates its own die tumbling to `value`. The settled value is read straight
// off the object, so a fresh join or reload shows the die exactly as it lies.
// Multiple dice are just multiple objects — each animates independently.
//
// Dragging the card moves the object (any tool, like the worksheet); a click
// that doesn't drag rolls. Selection is handled by the WidgetLayer.

import { useCallback, useEffect, useRef } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import {
  makeSolid,
  faceUpQuat,
  rollQuat,
  rotateVec,
  add,
  mul,
  dot,
  normalize,
  dieLabel,
  isFaceCount,
  type Quat,
  type Solid,
  type Vec3,
  type FaceCount,
} from "@/tools/dice/geometry";
import { DEFAULT_DICE_COLOR, type DiceParams } from "@/tools/dice";

/** Height reserved under the die for the caption (die label · rolled value). */
const CAPTION_H = 26;
/** Roll animation length (ms). */
const ROLL_MS = 1250;

// --- small maths ------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** A stable starting face for a never-rolled die: deterministic from its id, so
 *  every collaborator shows the same face without persisting anything. */
function seedValue(id: string, faces: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return 1 + (Math.abs(h) % faces);
}

// --- colour -----------------------------------------------------------------

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n =
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h.padEnd(6, "0").slice(0, 6);
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}
const rgb = (c: Rgb): string =>
  `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const shade = (c: Rgb, k: number): string =>
  rgb([clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)]);
/** Readable number/pip colour on a given die colour (dark on light, white on dark). */
function inkFor(c: Rgb): Rgb {
  const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  return lum > 150 ? [34, 40, 42] : [252, 252, 250];
}

// --- the painter ------------------------------------------------------------

const LIGHT = normalize([-0.35, 0.5, 0.78]);

/** Pip layout (unit square, y-down) for values 1..6 on the d6. */
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.5, -0.5], [0.5, 0.5]],
  3: [[-0.5, -0.5], [0, 0], [0.5, 0.5]],
  4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
  5: [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]],
  6: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0], [0.5, 0], [-0.5, 0.5], [0.5, 0.5]],
};

/** Paint the die at orientation `q`. Assumes the canvas is already CSS-sized. */
function paintDie(
  canvas: HTMLCanvasElement,
  solid: Solid,
  q: Quat,
  base: Rgb,
  cssW: number,
  cssH: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const cx = cssW / 2;
  const cy = cssH / 2;
  const radius = Math.min(cssW, cssH) * 0.46;
  const PERSP = 0.16;
  const project = (v: Vec3): { x: number; y: number } => {
    const f = 1 + v[2] * PERSP; // mild perspective: nearer is larger
    return { x: cx + v[0] * radius * f, y: cy - v[1] * radius * f };
  };

  const ink = inkFor(base);
  const edge = shade(base, 0.5);
  const lineW = Math.max(1, radius * 0.02);

  // Front-facing faces, drawn far-to-near (painter's order).
  const front = solid.faces
    .map((face) => {
      const n = rotateVec(q, face.normal);
      const c = rotateVec(q, face.center);
      return { face, n, zc: c[2] };
    })
    .filter((d) => d.n[2] > 0.02)
    .sort((a, b) => a.zc - b.zc);

  for (const { face, n } of front) {
    const pts = face.indices.map((i) => project(rotateVec(q, solid.vertices[i])));
    // Fill, Lambert-shaded (ambient + diffuse).
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    const lam = Math.max(0, dot(n, LIGHT));
    ctx.fillStyle = shade(base, 0.6 + 0.55 * lam);
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = lineW;
    ctx.strokeStyle = edge;
    ctx.stroke();

    // Number / pips, drawn in the face plane so they tumble with the die. The
    // glyph box is sized to the face's own INRADIUS, so it fits every die.
    const alpha = smoothstep(0.33, 0.62, n[2]);
    if (alpha < 0.02) continue;
    const isPips = solid.faces.length === 6;
    // Fraction of the inradius the printing occupies (pips are laid out over a
    // wider span than a single glyph, so they use a little less headroom).
    const s = face.inradius * (isPips ? 0.9 : 0.78);
    const cRot = rotateVec(q, face.center);
    const o = project(cRot);
    const ue = project(add(cRot, mul(rotateVec(q, face.u), s)));
    const de = project(add(cRot, mul(rotateVec(q, face.v), -s))); // -v = screen down
    ctx.save();
    ctx.globalAlpha = alpha;
    // Local frame: (1,0)->across, (0,1)->down, origin at the face centre. Then
    // scale to a 10-unit box (±R ≈ the glyph box edge) so the nominal font size
    // is comfortable and stays crisp under the CTM.
    ctx.transform(ue.x - o.x, ue.y - o.y, de.x - o.x, de.y - o.y, o.x, o.y);
    const R = 10;
    ctx.scale(1 / R, 1 / R);
    ctx.fillStyle = rgb(ink);
    if (isPips) {
      for (const [px, py] of PIPS[face.value] ?? []) {
        ctx.beginPath();
        ctx.arc(px * R, py * R, 0.19 * R, 0, 2 * Math.PI);
        ctx.fill();
      }
    } else {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${1.4 * R}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(String(face.value), 0, 0.04 * R);
      if (face.value === 6 || face.value === 9) {
        ctx.fillRect(-0.42 * R, 0.62 * R, 0.84 * R, 0.12 * R); // 6/9 underline
      }
    }
    ctx.restore();
  }

  // Glossy top highlight, confined to the die silhouette.
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  const g = ctx.createRadialGradient(
    cx - radius * 0.32, cy - radius * 0.4, radius * 0.08,
    cx, cy, radius * 1.15,
  );
  g.addColorStop(0, "rgba(255,255,255,0.28)");
  g.addColorStop(0.5, "rgba(255,255,255,0.05)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.restore();
}

// --- component --------------------------------------------------------------

export function Dice({ obj }: WidgetProps<DiceParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const faces: FaceCount = isFaceCount(obj.faces) ? obj.faces : 6;
  const color = obj.color ?? DEFAULT_DICE_COLOR;
  const solid = makeSolid(faces);
  const value =
    obj.value != null ? clamp(Math.round(obj.value), 1, faces) : seedValue(obj.id, faces);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capRef = useRef<HTMLSpanElement>(null);
  const qRef = useRef<Quat>(faceUpQuat(solid, value));
  const rafRef = useRef(0);
  const rollingRef = useRef(false);
  // Last roll counter we reacted to; seeded so mount / join never animates.
  const lastRollRef = useRef(obj.roll ?? 0);

  const cssW = obj.w;
  const cssH = Math.max(1, obj.h - CAPTION_H);

  const base = hexToRgb(color);
  const paint = useCallback(() => {
    const cv = canvasRef.current;
    if (cv) paintDie(cv, solid, qRef.current, base, cssW, cssH);
  }, [solid, base[0], base[1], base[2], cssW, cssH]);

  const setCaption = useCallback((n: number) => {
    if (capRef.current) capRef.current.textContent = String(n);
  }, []);

  // Static redraw when the die changes without a roll (colour, faces, resize).
  useEffect(() => {
    if (rollingRef.current) return;
    qRef.current = faceUpQuat(solid, value);
    paint();
    setCaption(value);
  }, [solid, value, paint, setCaption]);

  // A roll: the counter ticked (locally or from a collaborator) -> tumble to
  // `value`. The seamless start (rollQuat at p=0 == current orientation) means
  // no jump even if we were mid-settle.
  useEffect(() => {
    const roll = obj.roll ?? 0;
    if (roll === lastRollRef.current) return;
    lastRollRef.current = roll;

    const from = qRef.current;
    const target = faceUpQuat(solid, value);
    const turns = 3 + (value % 3); // 3..5 whole tumbles
    const t0 = performance.now();
    rollingRef.current = true;
    cancelAnimationFrame(rafRef.current);

    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ROLL_MS);
      qRef.current = rollQuat(from, target, turns, easeOutCubic(t));
      setCaption(t < 0.8 ? 1 + Math.floor(Math.random() * faces) : value);
      paint();
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rollingRef.current = false;
        qRef.current = target;
        setCaption(value);
        paint();
      }
    };
    rafRef.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.roll]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // --- roll ------------------------------------------------------------------
  function roll() {
    if (rollingRef.current) return;
    const st = useBoardStore.getState();
    const cur = st.board.objects.find((o) => o.id === obj.id) as
      | (DiceParams & { roll?: number })
      | undefined;
    if (!cur) return;
    const f: FaceCount = isFaceCount(cur.faces) ? cur.faces : 6;
    const next = 1 + Math.floor(Math.random() * f);
    // Shared + persisted + undo-invisible; the roll effect animates on the tick.
    updateWidgetState(obj.id, { value: next, roll: (cur.roll ?? 0) + 1 });
    track("tool_action", { tool: "dice", action: "rolled" });
  }

  // --- drag (move) vs click (roll) ------------------------------------------
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const el = e.currentTarget;
    const scale = useBoardStore.getState().camera.scale;
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = obj.x;
    const oy = obj.y;
    let moved = false;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const mv = (ev: PointerEvent) => {
      if (!moved) {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
        moved = true;
        pushHistory();
      }
      moveObject(obj.id, ox + (ev.clientX - sx) / scale, oy + (ev.clientY - sy) / scale);
    };
    const up = () => {
      el.removeEventListener("pointermove", mv);
      el.removeEventListener("pointerup", up);
      if (!moved) roll();
    };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up);
  }

  return (
    <div
      className="idice"
      data-id={obj.id}
      style={{ width: cssW + "px", height: obj.h + "px" }}
      onPointerDown={onPointerDown}
    >
      <canvas
        ref={canvasRef}
        className="idice-canvas"
        style={{ width: cssW + "px", height: cssH + "px" }}
      />
      <div className="idice-cap" style={{ height: CAPTION_H + "px" }}>
        <span className="idice-die">{dieLabel(faces)}</span>
        <span className="idice-val" ref={capRef}>
          {value}
        </span>
      </div>
    </div>
  );
}
