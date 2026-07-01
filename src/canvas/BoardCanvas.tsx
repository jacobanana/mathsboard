// The canvas runtime: two stacked <canvas> layers and the in-place text editor
// <textarea>. Rendered inside the host's #stage; the host (App) renders the
// WidgetLayer / ZoomCluster / FloatButtons as siblings.
//
// Ported from maths-whiteboard.html (lines 181-340):
//   - applyCam / renderBack / renderInk / renderAll      (camera + render loop)
//   - drawGrid + per-object tool.draw + multi-selection outlines + lasso rect
//   - pointer handling: pen/eraser strokes, select-move (objects AND strokes),
//     rubber-band area ("lasso") select, pan, pinch-zoom
//   - wheel zoom (ctrl/meta) + wheel pan
//   - double-click to edit, text tool create/edit via textarea overlay
//
// Differences from the prototype:
//   - Camera / tool / selection / document all live in the Zustand store.
//   - Object draws dispatch through the tool registry (tool.draw(kit, obj))
//     instead of a hard-coded switch.
//   - Document mutations route through store actions (the sync seam): addStroke,
//     pushHistory, moveObject, addObject, updateObject, removeObject.

import { useCallback, useEffect, useRef } from "react";
import { useBoardStore } from "@/board/store";
import type { Selection } from "@/board/store";
import {
  clamp,
  hitTest,
  hitTestStroke,
  strokeBounds,
  normRect,
  objectInRect,
  strokeInRect,
  screenToWorld,
  handleCenters,
  hitTestHandle,
  RESIZE_HANDLES,
  MIN_SCALE,
  MAX_SCALE,
} from "@/board/geometry";
import type { ResizeHandle } from "@/board/geometry";
import { drawGrid, drawStrokeFull, FONT, textSizeOf } from "@/canvas/drawHelpers";
import { getTool } from "@/tools/registry";
import { theme } from "@/styles/theme";
import type { AnyBoardObject, Camera, Stroke } from "@/board/types";
import { id as newId } from "@/board/types";

const ERASER = 30;

/** Resize-handle hit tolerance (screen px) and minimum object size (world px). */
const HANDLE_SLOP = 12;
const MIN_OBJ = 24;

/** Pointer cursor per resize handle. */
const RESIZE_CURSOR: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

export interface BoardCanvasProps {
  /**
   * Optional: open the settings dialog for an existing canvas object (EDIT
   * flow). Fired on double-click of a non-text object, AFTER it has been
   * selected in the store. The host renders the modal and calls updateObject on
   * submit. Free-text objects are edited in place here and never reach this
   * callback. If omitted, a double-click simply selects the object.
   */
  onEditObject?: (obj: AnyBoardObject) => void;
}

/** Live drag/stroke/pan/gesture state held outside React (no re-render churn). */
interface LiveStroke {
  pid: number;
  mode: "pen" | "eraser";
  color: string;
  size: number;
  points: { x: number; y: number }[];
}
/** A drag that translates the whole current selection (objects + strokes). */
interface Moving {
  pid: number;
  /** Last pointer position in world coords; deltas are applied incrementally. */
  lwx: number;
  lwy: number;
  moved: boolean;
  /**
   * If the pressed item was already part of a multi-selection (plain click),
   * this records it so a click WITHOUT a drag collapses the selection to just
   * that item on release (Figma-style). Null otherwise.
   */
  collapse: { kind: "object" | "stroke"; id: string } | null;
}
/** A drag on a resize handle of the single selected canvas object. */
interface Resizing {
  pid: number;
  id: string;
  handle: ResizeHandle;
  /** The object's box at drag start; the new box is derived from it. */
  ox: number;
  oy: number;
  ow: number;
  oh: number;
  /** True once the box actually changed (gates the single history push). */
  moved: boolean;
}
/** A rubber-band area ("lasso") selection drag, in world coords. */
interface Lasso {
  pid: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Shift-drag adds to the existing selection instead of replacing it. */
  add: boolean;
}
interface Panning {
  pid: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
}
interface Gesture {
  startDist: number;
  startScale: number;
  worldMid: { x: number; y: number };
}
/** The active in-place text edit: which object, its pre-edit snapshot flag, and
 *  the uniform scale a resize applied to it (so the textarea matches the on-canvas
 *  font size and the scale survives the edit). */
interface Editor {
  objId: string;
  isNew: boolean;
  scale: number;
}

type HitKind = "object" | "stroke";

/** A selection containing exactly the one pressed item. */
const singleSelection = (kind: HitKind, id: string): Selection =>
  kind === "stroke"
    ? { objectIds: [], strokeIds: [id] }
    : { objectIds: [id], strokeIds: [] };

/** Add/remove one item from a selection (shift-click toggle). */
const toggleSelection = (
  sel: Selection,
  kind: HitKind,
  id: string,
): Selection => {
  const key = kind === "stroke" ? "strokeIds" : "objectIds";
  const arr = sel[key];
  const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  return { ...sel, [key]: next };
};

const isInSelection = (sel: Selection, kind: HitKind, id: string): boolean =>
  (kind === "stroke" ? sel.strokeIds : sel.objectIds).includes(id);

/**
 * The lone canvas object eligible for resize handles: exactly one object (and no
 * strokes) selected, and its tool draws onto the canvas. Widgets render as HTML
 * overlays above the canvas, so their handles would be occluded -- skip them.
 */
function singleResizableObject(
  objects: AnyBoardObject[],
  selection: Selection,
): AnyBoardObject | null {
  if (selection.objectIds.length !== 1 || selection.strokeIds.length !== 0) {
    return null;
  }
  const o = objects.find((x) => x.id === selection.objectIds[0]);
  if (!o) return null;
  const t = getTool(o.type);
  return t && t.kind === "canvas" ? o : null;
}

/**
 * New box for an object whose `handle` is dragged to world point (wx, wy). The
 * object ALWAYS keeps its original w:h aspect ratio. The opposite edge/corner
 * stays anchored; each moving edge is clamped to keep at least MIN_OBJ.
 *
 *   - Corner handle: the pointer drives both axes; the box grows on whichever
 *     axis moved furthest and the other axis is derived from the ratio.
 *   - Edge handle: the dragged axis drives, the perpendicular axis is derived
 *     and kept centred on the object's unchanged mid-line.
 */
function resizeRect(
  o: { x: number; y: number; w: number; h: number },
  handle: ResizeHandle,
  wx: number,
  wy: number,
): { x: number; y: number; w: number; h: number } {
  const ar = o.h > 0 ? o.w / o.h : 1;
  let l = o.x;
  let t = o.y;
  let r = o.x + o.w;
  let b = o.y + o.h;
  const left = handle.includes("w");
  const right = handle.includes("e");
  const top = handle.includes("n");
  const bottom = handle.includes("s");
  if (left) l = Math.min(wx, r - MIN_OBJ);
  if (right) r = Math.max(wx, l + MIN_OBJ);
  if (top) t = Math.min(wy, b - MIN_OBJ);
  if (bottom) b = Math.max(wy, t + MIN_OBJ);

  let w = r - l;
  let h = b - t;
  const horiz = left || right;
  const vert = top || bottom;

  if (horiz && vert) {
    // Corner: dominant axis wins, derive the other, anchor opposite corner.
    if (w / ar >= h) h = w / ar;
    else w = h * ar;
    if (left) l = r - w;
    else r = l + w;
    if (top) t = b - h;
    else b = t + h;
  } else if (horiz) {
    // Side handle: width drives, derive height, keep vertically centred.
    h = w / ar;
    const cy = o.y + o.h / 2;
    t = cy - h / 2;
    b = cy + h / 2;
  } else if (vert) {
    // Top/bottom handle: height drives, derive width, keep horizontally centred.
    w = h * ar;
    const cx = o.x + o.w / 2;
    l = cx - w / 2;
    r = cx + w / 2;
  }
  return { x: l, y: t, w: r - l, h: b - t };
}

export function BoardCanvas({ onEditObject }: BoardCanvasProps) {
  const tCanvasRef = useRef<HTMLCanvasElement>(null);
  const iCanvasRef = useRef<HTMLCanvasElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Viewport size (CSS px) + dpr, kept in a ref so render fns read live values.
  const viewRef = useRef({ W: 0, H: 0, dpr: 1 });

  // Imperative interaction state (mirrors prototype locals).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const strokeRef = useRef<LiveStroke | null>(null);
  const movingRef = useRef<Moving | null>(null);
  const resizingRef = useRef<Resizing | null>(null);
  const lassoRef = useRef<Lasso | null>(null);
  const panningRef = useRef<Panning | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const ignoreSingleRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);

  // ---- live store reads via getState (render fns must not be stale) --------
  const store = useBoardStore;

  // --- camera transform -----------------------------------------------------
  const applyCam = useCallback(
    (ctx: CanvasRenderingContext2D, cam: Camera) => {
      const { dpr } = viewRef.current;
      ctx.setTransform(
        cam.scale * dpr,
        0,
        0,
        cam.scale * dpr,
        cam.x * dpr,
        cam.y * dpr,
      );
    },
    [],
  );

  // --- screen <-> world helpers bound to the current camera -----------------
  const evPos = useCallback((e: PointerEvent | WheelEvent | MouseEvent) => {
    const c = iCanvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  // --- render the template/background layer (grid + objects + selection) ----
  const renderBack = useCallback(() => {
    const tCanvas = tCanvasRef.current;
    if (!tCanvas) return;
    const tctx = tCanvas.getContext("2d");
    if (!tctx) return;
    const { W, H } = viewRef.current;
    const { camera, board, tool, selection, editingId } = store.getState();

    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, tCanvas.width, tCanvas.height);
    applyCam(tctx, camera);

    drawGrid(tctx, {
      camera,
      W,
      H,
      background: board.background,
      theme,
    });

    // Canvas objects only -- widget objects render in the WidgetLayer overlay.
    // Each object is drawn in its tool's NATURAL coordinate space and uniformly
    // scaled to fit its (resizable) box, so every part of the widget -- text,
    // lines, tick marks, stroke widths -- grows and shrinks together rather than
    // only the bounding box. At scale 1 this is identical to drawing in place.
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
        { ctx: tctx, theme, font: FONT },
        { ...o, x: 0, y: 0, w: nat.w, h: nat.h } as never,
      );
      tctx.restore();
    }

    // Selection outlines + live lasso (select tool only).
    if (tool === "select") {
      const pad = 8 / camera.scale;
      tctx.save();
      tctx.strokeStyle = theme.accent;
      tctx.lineWidth = 2 / camera.scale;
      tctx.setLineDash([8 / camera.scale, 6 / camera.scale]);
      for (const sid of selection.objectIds) {
        const o = board.objects.find((x) => x.id === sid);
        if (o) tctx.strokeRect(o.x - pad, o.y - pad, o.w + pad * 2, o.h + pad * 2);
      }
      for (const sid of selection.strokeIds) {
        const s = board.strokes.find((x) => x.id === sid);
        if (s) {
          const b = strokeBounds(s);
          tctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
        }
      }
      tctx.restore();

      // Resize handles for a single selected canvas object (constant on-screen
      // size). Drawn on the same padded box as the selection outline.
      const rz = singleResizableObject(board.objects, selection);
      if (rz) {
        const hs = 5 / camera.scale;
        const centers = handleCenters(rz, pad);
        tctx.save();
        tctx.fillStyle = theme.accent;
        tctx.strokeStyle = theme.paper;
        tctx.lineWidth = 1.5 / camera.scale;
        for (const hid of RESIZE_HANDLES) {
          const c = centers[hid];
          tctx.fillRect(c.x - hs, c.y - hs, hs * 2, hs * 2);
          tctx.strokeRect(c.x - hs, c.y - hs, hs * 2, hs * 2);
        }
        tctx.restore();
      }

      const lr = lassoRef.current;
      if (lr) {
        const r = normRect(lr.x0, lr.y0, lr.x1, lr.y1);
        tctx.save();
        tctx.fillStyle = "rgba(242,179,61,0.12)";
        tctx.strokeStyle = theme.accent;
        tctx.lineWidth = 1.5 / camera.scale;
        tctx.setLineDash([6 / camera.scale, 4 / camera.scale]);
        tctx.fillRect(r.x, r.y, r.w, r.h);
        tctx.strokeRect(r.x, r.y, r.w, r.h);
        tctx.restore();
      }
    }
  }, [applyCam, store]);

  // --- render the ink layer (committed strokes) -----------------------------
  const renderInk = useCallback(() => {
    const iCanvas = iCanvasRef.current;
    if (!iCanvas) return;
    const ictx = iCanvas.getContext("2d");
    if (!ictx) return;
    const { camera, board } = store.getState();
    ictx.setTransform(1, 0, 0, 1, 0, 0);
    ictx.clearRect(0, 0, iCanvas.width, iCanvas.height);
    applyCam(ictx, camera);
    for (const s of board.strokes) drawStrokeFull(ictx, s);
    // Re-paint any in-progress live stroke on top.
    const live = strokeRef.current;
    if (live) drawStrokeFull(ictx, live);
  }, [applyCam, store]);

  const renderAll = useCallback(() => {
    renderBack();
    renderInk();
  }, [renderBack, renderInk]);

  // --- devicePixelRatio sizing + resize -------------------------------------
  const resize = useCallback(() => {
    commitEditorRef.current?.();
    const tCanvas = tCanvasRef.current;
    const iCanvas = iCanvasRef.current;
    // The host's #stage is the canvas's offset parent; size to it.
    const stage = tCanvas?.parentElement;
    if (!stage || !tCanvas || !iCanvas) return;
    const r = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    viewRef.current = { W: r.width, H: r.height, dpr };
    for (const c of [tCanvas, iCanvas]) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    renderAll();
  }, [renderAll]);

  // ======================================================================
  // TEXT EDITOR OVERLAY (port of openEditor / autoSize / commitEditor)
  // ======================================================================

  const autoSize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.width = "10px";
    ta.style.height = "10px";
    ta.style.width = ta.scrollWidth + 6 + "px";
    ta.style.height = ta.scrollHeight + "px";
  }, []);

  const openEditor = useCallback(
    (obj: AnyBoardObject, isNew: boolean) => {
      const ta = taRef.current;
      if (!ta) return;
      const { camera, setEditingId } = store.getState();
      // Recover the uniform resize scale (stored box vs. natural text box) so the
      // textarea renders at the same size as the committed text on the canvas.
      const nat = textSizeOf((obj.text as string) || "", obj.size as number);
      const s = nat.w > 0 ? obj.w / nat.w : 1;
      editorRef.current = { objId: obj.id, isNew, scale: s };
      setEditingId(obj.id); // hides obj from renderBack
      renderBack();
      const sx = obj.x * camera.scale + camera.x;
      const sy = obj.y * camera.scale + camera.y;
      ta.style.display = "block";
      ta.style.left = sx + "px";
      ta.style.top = sy + "px";
      ta.style.font =
        "500 " + (obj.size as number) * s * camera.scale + "px " + FONT;
      ta.style.color = obj.color as string;
      ta.value = (obj.text as string) || "";
      autoSize();
      setTimeout(() => {
        ta.focus();
        ta.select();
      }, 0);
    },
    [autoSize, renderBack, store],
  );

  const commitEditor = useCallback(() => {
    const ed = editorRef.current;
    const ta = taRef.current;
    if (!ed || !ta) return;
    editorRef.current = null;
    const st = store.getState();
    const obj = st.board.objects.find((o) => o.id === ed.objId);
    ta.style.display = "none";
    ta.blur();
    const text = ta.value.replace(/[ \t]+$/g, "");
    st.setEditingId(null);

    if (!obj) {
      renderAll();
      return;
    }
    if (!text.trim()) {
      // Empty -> remove. For a brand-new object that was never committed, the
      // create snapshot was pushed by addObject; removeObject pushes its own.
      st.removeObject(obj.id);
      renderAll();
      return;
    }
    const size = (obj.size as number) ?? 26;
    const sz = textSizeOf(text, size);
    const s = ed.scale ?? 1; // keep any resize scale across the edit
    st.updateObject(obj.id, { text, w: sz.w * s, h: sz.h * s });
    renderAll();
  }, [renderAll, store]);

  // Stable refs so resize/effects can call the latest commit/render closures.
  const commitEditorRef = useRef<() => void>();
  commitEditorRef.current = commitEditor;
  const renderAllRef = useRef<() => void>();
  renderAllRef.current = renderAll;

  // ======================================================================
  // POINTER + GESTURE HANDLING (port of the prototype's iCanvas listeners)
  // ======================================================================

  const two = () => {
    const a = [...pointers.current.values()];
    return [a[0], a[1]] as const;
  };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  const startGesture = useCallback(() => {
    const [p1, p2] = two();
    if (!p1 || !p2) return;
    const m = mid(p1, p2);
    const { camera } = store.getState();
    gestureRef.current = {
      startDist: dist(p1, p2),
      startScale: camera.scale,
      worldMid: screenToWorld(camera, m.x, m.y),
    };
  }, [store]);

  const updateGesture = useCallback(() => {
    const g = gestureRef.current;
    const [p1, p2] = two();
    if (!g || !p1 || !p2) return;
    const m = mid(p1, p2);
    const { setCamera } = store.getState();
    const s = clamp(
      (g.startScale * dist(p1, p2)) / g.startDist,
      MIN_SCALE,
      MAX_SCALE,
    );
    setCamera({
      scale: s,
      x: m.x - g.worldMid.x * s,
      y: m.y - g.worldMid.y * s,
    });
    renderAll();
  }, [renderAll, store]);

  // --- wire native listeners (passive:false where preventDefault is needed) --
  useEffect(() => {
    const iCanvas = iCanvasRef.current;
    // Wheel zoom/pan is bound on the host #stage (the canvas's parent).
    const stage = iCanvas?.parentElement;
    if (!iCanvas || !stage) return;

    const onPointerDown = (e: PointerEvent) => {
      if (editorRef.current) {
        commitEditor();
        return;
      }
      const pp = evPos(e);
      pointers.current.set(e.pointerId, pp);
      try {
        iCanvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      // Two-pointer pinch begins; cancel any single-pointer interaction.
      if (pointers.current.size === 2) {
        if (strokeRef.current) {
          strokeRef.current = null;
          renderInk();
        }
        movingRef.current = null;
        resizingRef.current = null;
        if (lassoRef.current) {
          lassoRef.current = null;
          renderBack();
        }
        panningRef.current = null;
        startGesture();
        e.preventDefault();
        return;
      }
      if (pointers.current.size > 2 || ignoreSingleRef.current) return;

      const st = store.getState();
      const { camera, tool } = st;
      const w = screenToWorld(camera, pp.x, pp.y);

      if (tool === "text") {
        const hit = hitTest(st.board.objects, w.x, w.y);
        if (hit && hit.type === "text") {
          st.select(hit.id);
          openEditor(hit, false);
        } else {
          // Create a fresh, empty text object then edit it in place.
          const size = st.textSize;
          const sz = textSizeOf("", size);
          const obj: AnyBoardObject = {
            id: newId(),
            type: "text",
            x: w.x,
            y: w.y,
            w: sz.w,
            h: sz.h,
            text: "",
            size,
            color: st.color,
          };
          st.addObject(obj);
          st.select(obj.id);
          openEditor(obj, true);
        }
        e.preventDefault();
        return;
      }

      if (tool === "pen" || tool === "eraser") {
        const sizeW =
          (tool === "eraser" ? ERASER : st.penSize) / camera.scale;
        strokeRef.current = {
          pid: e.pointerId,
          mode: tool === "eraser" ? "eraser" : "pen",
          color: st.color,
          size: sizeW,
          points: [w],
        };
        renderInk();
      } else if (tool === "select") {
        // A press on a resize handle of the single selected canvas object starts
        // a resize and wins over move / lasso.
        const rz = singleResizableObject(st.board.objects, st.selection);
        if (rz) {
          const handle = hitTestHandle(
            camera,
            rz,
            pp.x,
            pp.y,
            8 / camera.scale,
            HANDLE_SLOP,
          );
          if (handle) {
            resizingRef.current = {
              pid: e.pointerId,
              id: rz.id,
              handle,
              ox: rz.x,
              oy: rz.y,
              ow: rz.w,
              oh: rz.h,
              moved: false,
            };
            e.preventDefault();
            return;
          }
        }
        // Strokes ("arcs") sit visually above objects on the ink layer, so a
        // click on a stroke line wins; otherwise fall back to object boxes.
        const stroke = hitTestStroke(st.board.strokes, w.x, w.y);
        const obj = stroke ? null : hitTest(st.board.objects, w.x, w.y);
        const shift = e.shiftKey;
        if (stroke || obj) {
          const kind: HitKind = stroke ? "stroke" : "object";
          const hitId = stroke ? stroke.id : obj!.id;
          const sel = st.selection;
          if (shift) {
            // Toggle membership; do not start a move (the item may have just
            // been removed from the selection).
            st.setSelection(toggleSelection(sel, kind, hitId));
          } else {
            const inSel = isInSelection(sel, kind, hitId);
            const wasMulti = sel.objectIds.length + sel.strokeIds.length > 1;
            if (!inSel) st.setSelection(singleSelection(kind, hitId));
            movingRef.current = {
              pid: e.pointerId,
              lwx: w.x,
              lwy: w.y,
              moved: false,
              // Click (no drag) on one of many -> collapse to it on release.
              collapse: inSel && wasMulti ? { kind, id: hitId } : null,
            };
          }
        } else {
          // Empty space: begin a rubber-band area selection. Shift keeps the
          // current selection and adds to it. (Pan via the Pan tool / 2 fingers.)
          if (!shift) st.clearSelection();
          lassoRef.current = {
            pid: e.pointerId,
            x0: w.x,
            y0: w.y,
            x1: w.x,
            y1: w.y,
            add: shift,
          };
        }
        renderBack();
      } else if (tool === "pan") {
        panningRef.current = {
          pid: e.pointerId,
          sx: pp.x,
          sy: pp.y,
          cx: camera.x,
          cy: camera.y,
        };
        iCanvas.style.cursor = "grabbing";
      }
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      // Hover feedback: show a resize cursor over the selected object's handles
      // while idle. Runs before the capture guard because a bare hover (no
      // button) is never tracked in `pointers`.
      const anyActive =
        strokeRef.current ||
        movingRef.current ||
        resizingRef.current ||
        lassoRef.current ||
        panningRef.current ||
        gestureRef.current;
      if (!anyActive) {
        const sh = store.getState();
        if (sh.tool === "select") {
          const pp0 = evPos(e);
          const rz = singleResizableObject(sh.board.objects, sh.selection);
          const h = rz
            ? hitTestHandle(
                sh.camera,
                rz,
                pp0.x,
                pp0.y,
                8 / sh.camera.scale,
                HANDLE_SLOP,
              )
            : null;
          iCanvas.style.cursor = h ? RESIZE_CURSOR[h] : "default";
        }
      }
      if (!pointers.current.has(e.pointerId)) return;
      const pp = evPos(e);
      pointers.current.set(e.pointerId, pp);
      if (gestureRef.current) {
        updateGesture();
        e.preventDefault();
        return;
      }
      if (ignoreSingleRef.current) return;
      const st = store.getState();
      const { camera } = st;

      const stroke = strokeRef.current;
      const moving = movingRef.current;
      const resizing = resizingRef.current;
      const lasso = lassoRef.current;
      const panning = panningRef.current;

      if (stroke && e.pointerId === stroke.pid) {
        stroke.points.push(screenToWorld(camera, pp.x, pp.y));
        renderInk();
      } else if (resizing && e.pointerId === resizing.pid) {
        const w = screenToWorld(camera, pp.x, pp.y);
        const rect = resizeRect(
          { x: resizing.ox, y: resizing.oy, w: resizing.ow, h: resizing.oh },
          resizing.handle,
          w.x,
          w.y,
        );
        const cur = st.board.objects.find((o) => o.id === resizing.id);
        if (
          cur &&
          (cur.x !== rect.x ||
            cur.y !== rect.y ||
            cur.w !== rect.w ||
            cur.h !== rect.h)
        ) {
          if (!resizing.moved) {
            st.pushHistory(); // one undo step per resize drag
            resizing.moved = true;
          }
          st.resizeObject(resizing.id, rect);
          renderAll();
        }
      } else if (moving && e.pointerId === moving.pid) {
        const w = screenToWorld(camera, pp.x, pp.y);
        const dx = w.x - moving.lwx;
        const dy = w.y - moving.lwy;
        if (dx !== 0 || dy !== 0) {
          if (!moving.moved) {
            st.pushHistory(); // one undo step per drag
            moving.moved = true;
          }
          st.nudgeSelection(dx, dy); // moves every selected object + stroke
          moving.lwx = w.x;
          moving.lwy = w.y;
          renderAll(); // strokes live on the ink layer too
        }
      } else if (lasso && e.pointerId === lasso.pid) {
        const w = screenToWorld(camera, pp.x, pp.y);
        lasso.x1 = w.x;
        lasso.y1 = w.y;
        renderBack();
      } else if (panning && e.pointerId === panning.pid) {
        st.setCamera({
          x: panning.cx + (pp.x - panning.sx),
          y: panning.cy + (pp.y - panning.sy),
        });
        renderAll();
      }
      e.preventDefault();
    };

    const release = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);
      if (gestureRef.current) {
        if (pointers.current.size < 2) {
          gestureRef.current = null;
          if (pointers.current.size === 1) ignoreSingleRef.current = true;
        }
      } else {
        const st = store.getState();
        const stroke = strokeRef.current;
        if (stroke && e.pointerId === stroke.pid) {
          strokeRef.current = null;
          if (stroke.mode === "eraser") {
            // Geometric erase: trim covered points out of the pen strokes (the
            // eraser is never stored, so gaps move with the stroke). renderInk
            // runs unconditionally below to clear the live eraser preview even
            // when nothing was erased.
            st.eraseStrokes({ points: stroke.points, size: stroke.size });
          } else {
            const finished: Stroke = {
              id: newId(),
              mode: stroke.mode,
              color: stroke.color,
              size: stroke.size,
              points: stroke.points,
            };
            st.addStroke(finished); // pushes history + appends
          }
          renderInk();
        }
        if (resizingRef.current && e.pointerId === resizingRef.current.pid) {
          // History already pushed on the first move; just end the drag.
          resizingRef.current = null;
        }
        if (movingRef.current && e.pointerId === movingRef.current.pid) {
          const mv = movingRef.current;
          movingRef.current = null;
          // A plain click (no drag) on an item that was part of a multi-select
          // narrows the selection to just that item.
          if (!mv.moved && mv.collapse) {
            st.setSelection(singleSelection(mv.collapse.kind, mv.collapse.id));
            renderBack();
          }
        }
        if (lassoRef.current && e.pointerId === lassoRef.current.pid) {
          const lr = lassoRef.current;
          lassoRef.current = null;
          const rect = normRect(lr.x0, lr.y0, lr.x1, lr.y1);
          // A near-zero drag is a click on empty space, not an area select --
          // the selection was already cleared on pointerdown (unless shift).
          // Gate on the drag's screen-space distance so a thin strip (wide but
          // short, or tall but narrow) still counts as a real lasso.
          const dragPx = Math.hypot(rect.w, rect.h) * st.camera.scale;
          if (dragPx >= 4) {
            const base = lr.add ? st.selection : { objectIds: [], strokeIds: [] };
            const objIds = new Set(base.objectIds);
            const strkIds = new Set(base.strokeIds);
            for (const o of st.board.objects) {
              if (objectInRect(o, rect)) objIds.add(o.id);
            }
            for (const s of st.board.strokes) {
              if (s.mode === "eraser") continue;
              if (strokeInRect(s, rect)) strkIds.add(s.id);
            }
            st.setSelection({
              objectIds: [...objIds],
              strokeIds: [...strkIds],
            });
          }
          renderBack();
        }
        if (panningRef.current && e.pointerId === panningRef.current.pid) {
          panningRef.current = null;
          if (st.tool === "pan") iCanvas.style.cursor = "grab";
        }
      }
      if (pointers.current.size === 0) ignoreSingleRef.current = false;
    };

    const onDblClick = (e: MouseEvent) => {
      const st = store.getState();
      if (st.tool !== "select" && st.tool !== "pan") return;
      const pp = evPos(e);
      const w = screenToWorld(st.camera, pp.x, pp.y);
      const hit = hitTest(st.board.objects, w.x, w.y);
      if (!hit) return;
      st.select(hit.id);
      renderBack();
      if (hit.type === "text") {
        openEditor(hit, false);
      } else {
        onEditObject?.(hit);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (editorRef.current) commitEditor();
      e.preventDefault();
      const st = store.getState();
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * 0.0015);
        const p = evPos(e);
        zoomAtRef.current(f, p.x, p.y);
      } else {
        st.setCamera({ x: st.camera.x - e.deltaX, y: st.camera.y - e.deltaY });
        renderAll();
      }
    };

    iCanvas.addEventListener("pointerdown", onPointerDown);
    iCanvas.addEventListener("pointermove", onPointerMove);
    iCanvas.addEventListener("pointerup", release);
    iCanvas.addEventListener("pointercancel", release);
    iCanvas.addEventListener("dblclick", onDblClick);
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      iCanvas.removeEventListener("pointerdown", onPointerDown);
      iCanvas.removeEventListener("pointermove", onPointerMove);
      iCanvas.removeEventListener("pointerup", release);
      iCanvas.removeEventListener("pointercancel", release);
      iCanvas.removeEventListener("dblclick", onDblClick);
      stage.removeEventListener("wheel", onWheel);
    };
  }, [
    commitEditor,
    evPos,
    onEditObject,
    openEditor,
    renderAll,
    renderBack,
    renderInk,
    startGesture,
    store,
    updateGesture,
  ]);

  // --- zoom (cluster buttons share this; kept in a ref for the wheel) -------
  const zoomAt = useCallback(
    (factor: number, cx: number, cy: number) => {
      const { camera, setCamera } = store.getState();
      const s = clamp(camera.scale * factor, MIN_SCALE, MAX_SCALE);
      const f = s / camera.scale;
      setCamera({
        scale: s,
        x: cx - (cx - camera.x) * f,
        y: cy - (cy - camera.y) * f,
      });
      renderAll();
    },
    [renderAll, store],
  );
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  // ======================================================================
  // STORE SUBSCRIPTIONS -> re-render the canvas on any relevant change.
  // ======================================================================

  // Initial sizing + window resize.
  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // Redraw whenever document / camera / tool / selection / editing changes.
  useEffect(() => {
    // Fire once on mount, then on every relevant store transition.
    renderAll();
    const unsub = store.subscribe((s, prev) => {
      if (
        s.board !== prev.board ||
        s.camera !== prev.camera ||
        s.tool !== prev.tool ||
        s.selection !== prev.selection ||
        s.editingId !== prev.editingId
      ) {
        renderAllRef.current?.();
      }
    });
    return unsub;
  }, [renderAll, store]);

  // Cursor reflects the active tool (prototype setTool side effect).
  const tool = useBoardStore((s) => s.tool);
  useEffect(() => {
    const c = iCanvasRef.current;
    if (!c) return;
    c.style.cursor =
      tool === "pan"
        ? "grab"
        : tool === "select"
          ? "default"
          : tool === "text"
            ? "text"
            : "crosshair";
  }, [tool]);

  // The host (App) owns the #stage wrapper and renders WidgetLayer / ZoomCluster
  // / FloatButtons as siblings. This component contributes only the two stacked
  // canvases and the in-place text editor.
  return (
    <>
      <canvas id="template" ref={tCanvasRef} />
      <canvas id="ink" ref={iCanvasRef} />

      {/* In-place free-text editor. */}
      <textarea
        id="textEditor"
        ref={taRef}
        spellCheck={false}
        onInput={autoSize}
        onBlur={commitEditor}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            commitEditor();
          }
          e.stopPropagation();
        }}
      />
    </>
  );
}
