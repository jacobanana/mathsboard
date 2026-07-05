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

import { drawGrid, drawStrokeFull, FONT } from "@/canvas/drawHelpers";
import { applyCam } from "@/canvas/viewport";
import { getTool } from "@/tools/registry";
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
