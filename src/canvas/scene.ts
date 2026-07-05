// THE SCENE RENDERER (T4 in docs/canvas-app-architecture.md).
//
// Draws the DOCUMENT — grid + placed canvas objects on the template layer,
// committed strokes on the ink layer — from plain state, no React. Interaction
// previews (selection outlines, resize handles, lasso rect, live stroke, brush
// ring) are NOT drawn here: the active interaction controller contributes them
// via drawOverlay AFTER the scene (see canvas/interactions/types.ts), so this
// file stops growing when tools are added.
//
// Contract: both contexts are returned with the camera transform APPLIED, so
// overlay drawing happens in world space. Draw order is unchanged from the
// original renderBack/renderInk: grid -> objects (template, below), committed
// strokes (ink, above) -> overlays.

import { drawGrid, drawStrokeFull, roundRect, FONT } from "@/canvas/drawHelpers";
import { applyCam } from "@/canvas/viewport";
import { hitTest } from "@/board/geometry";
import { answersMatch, getTool } from "@/tools/registry";
import { theme } from "@/styles/theme";
import type { BoardDocument, Camera } from "@/board/types";

/** Viewport size (CSS px) + devicePixelRatio. */
export interface SceneView {
  W: number;
  H: number;
  dpr: number;
}

/** The slice of store state the scene depends on. */
export interface SceneState {
  camera: Camera;
  board: BoardDocument;
  /** Text object hidden from the draw pass while its textarea overlay is open. */
  editingId: string | null;
}

/** Grid + canvas objects. Widget objects render in the WidgetLayer overlay. */
export function renderTemplate(
  tctx: CanvasRenderingContext2D,
  view: SceneView,
  state: SceneState,
): void {
  const { camera, board, editingId } = state;
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.clearRect(0, 0, tctx.canvas.width, tctx.canvas.height);
  applyCam(tctx, camera, view.dpr);

  drawGrid(tctx, {
    camera,
    W: view.W,
    H: view.H,
    background: board.background,
    theme,
  });

  // Each object is drawn in its tool's NATURAL coordinate space and uniformly
  // scaled to fit its (resizable) box, so every part of the widget -- text,
  // lines, tick marks -- grows and shrinks together rather than only the
  // bounding box. The scale is handed to draw() too, so a tool can exempt a
  // part (e.g. a shape's border) and keep it a constant on-canvas size. At
  // scale 1 this is identical to drawing in place.
  for (const o of board.objects) {
    if (o.id === editingId) continue; // hidden while its textarea is open
    const t = getTool(o.type);
    if (!t || t.kind !== "canvas") continue;
    const nat = t.size(o as never); // intrinsic size for the current params
    const s = nat.w > 0 ? o.w / nat.w : 1; // uniform scale (aspect is locked)
    tctx.save();
    tctx.translate(o.x, o.y);
    tctx.scale(s, s);
    t.draw(
      { ctx: tctx, theme, font: FONT, scale: s },
      { ...o, x: 0, y: 0, w: nat.w, h: nat.h } as never,
    );
    tctx.restore();
  }
}

/** Committed strokes. The live in-progress stroke is an overlay concern. */
export function renderInk(
  ictx: CanvasRenderingContext2D,
  view: SceneView,
  state: SceneState,
): void {
  ictx.setTransform(1, 0, 0, 1, 0, 0);
  ictx.clearRect(0, 0, ictx.canvas.width, ictx.canvas.height);
  applyCam(ictx, state.camera, view.dpr);
  for (const s of state.board.strokes) drawStrokeFull(ictx, s);
}

/** Both layers, in order. Leaves the camera transform applied on each. */
export function renderScene(
  tctx: CanvasRenderingContext2D,
  ictx: CanvasRenderingContext2D,
  view: SceneView,
  state: SceneState,
): void {
  renderTemplate(tctx, view, state);
  renderInk(ictx, view, state);
}

/**
 * Answer values typed into a tool's `inputs` fields, painted onto the canvas.
 * The LIVE view renders these as HTML <input>s (InputOverlayLayer), which the
 * canvas bitmap can't capture — so PNG export runs this pass between the
 * template and ink layers to bake the answers (and, for framed "box" fields,
 * their box) into the image. Mirrors InputOverlayLayer's per-field states:
 * plain entry, then green/red marking + the correct answer in blanks once
 * revealed. Not part of the live scene, which the input overlay owns.
 */
export function renderInputValues(
  ctx: CanvasRenderingContext2D,
  view: SceneView,
  state: SceneState,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  applyCam(ctx, state.camera, view.dpr);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const objects = state.board.objects;
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (o.id === state.editingId) continue;
    const t = getTool(o.type);
    if (!t || t.kind !== "canvas" || !t.inputs) continue;
    const nat = t.size(o as never);
    const scale = nat.w > 0 ? o.w / nat.w : 1;
    const rec = o as unknown as Record<string, unknown>;
    const revealed = !!o.revealed;
    // Match InputOverlayLayer's occlusion: a field covered by a higher-z object
    // isn't baked in (else buried answers would print over what covers them).
    const contested = objects
      .slice(i + 1)
      .some(
        (b) =>
          b.x - 6 < o.x + o.w &&
          b.x + b.w + 6 > o.x &&
          b.y - 6 < o.y + o.h &&
          b.y + b.h + 6 > o.y,
      );
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(scale, scale);
    for (const f of t.inputs.fields(o as never)) {
      if (
        contested &&
        hitTest(
          objects,
          o.x + (f.x + f.w / 2) * scale,
          o.y + (f.y + f.h / 2) * scale,
        )?.id !== o.id
      )
        continue;
      const typed = String(rec["ans:" + f.key] ?? "");
      const hasVal = typed.trim() !== "";
      const mark =
        revealed && hasVal && f.correct != null
          ? answersMatch(typed, f.correct)
            ? "ok"
            : "no"
          : null;
      const revealBlank = revealed && !hasVal && f.correct != null;
      const isCell = f.variant === "cell";

      // Marked fill (both variants); box fields also get their frame, since the
      // tool draws no cell under them (cell fields sit on the tool's gridlines).
      const fill =
        mark === "ok"
          ? isCell
            ? "rgba(46,158,91,.16)"
            : "#EAF7EE"
          : mark === "no"
            ? isCell
              ? "rgba(214,69,69,.16)"
              : "#FBECEC"
            : null;
      if (fill) {
        ctx.fillStyle = fill;
        if (isCell) ctx.fillRect(f.x, f.y, f.w, f.h);
        else {
          roundRect(ctx, f.x, f.y, f.w, f.h, 6);
          ctx.fill();
        }
      }
      if (!isCell) {
        ctx.strokeStyle =
          mark === "ok" ? "#2E9E5B" : mark === "no" ? "#D64545" : "#C3D4D2";
        ctx.lineWidth = 2;
        roundRect(ctx, f.x, f.y, f.w, f.h, 6);
        ctx.stroke();
      }

      let text = "";
      let color: string = theme.lineInk;
      if (hasVal) {
        text = typed;
        if (mark === "ok") color = "#2E9E5B";
        else if (mark === "no") color = "#D64545";
      } else if (revealBlank) {
        text = String(f.correct);
        color = theme.muted;
      }
      if (text) {
        ctx.fillStyle = color;
        const fs = Math.max(8, Math.min(f.h * 0.55, f.w * 0.42));
        ctx.font = "700 " + fs + "px " + FONT;
        ctx.fillText(text, f.x + f.w / 2, f.y + f.h / 2 + 1);
      }
    }
    ctx.restore();
  }
}
