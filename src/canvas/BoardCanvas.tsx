// THE CANVAS HOST. Owns the two stacked <canvas> layers and the two in-place
// editors (the free-text <textarea> and the MathLive maths overlay), and keeps
// only the SHARED input infrastructure:
//
//   - canvas/DOM lifecycle (dpr sizing, window resize)          .. C1
//   - rAF-batched render scheduling + store subscription        .. C4
//   - pointer dispatch: capture, wheel zoom/pan, and routing to the
//     active interaction controller. The multi-touch bookkeeping (the
//     pointer map, the two-finger pinch, the post-pinch guard) lives in
//     canvas/gestures, SHARED with the widget overlay so a pinch still
//     works with a finger resting on a widget         .. dispatch
//
// Everything tool-specific lives in canvas/interactions/* (T1): the host looks
// up getInteraction(tool) and forwards pointer events; controllers own their
// live drag state and contribute preview overlays after the scene is drawn
// (canvas/scene.ts). The text editor's open/commit logic is canvas/textEditor
// (T6), the maths editor's is canvas/mathEditor; PNG export layers register
// with canvas/export (no App DOM reach).
//
// Rendered inside the host's #stage; the shell (App) renders the WidgetLayer /
// PresenceLayer / ZoomCluster / FloatButtons as siblings.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useBoardStore } from "@/board/store";
import { screenToWorld } from "@/board/geometry";
import { renderScene, renderInputValues } from "@/canvas/scene";
import { createTextEditor } from "@/canvas/textEditor";
import { createMathEditor, prewarmMathEditor } from "@/canvas/mathEditor";
import {
  anyEditorOpen,
  commitAllEditors,
  openEditorFor,
  registerInPlaceEditor,
} from "@/canvas/editors";
import { registerExportLayers } from "@/canvas/export";
import { getInteraction } from "@/canvas/interactions";
import * as gestures from "@/canvas/gestures";
import { drawSelectionOutlines } from "@/canvas/interactions/select";
import * as viewport from "@/canvas/viewport";
import { theme } from "@/styles/theme";
import type { AnyBoardObject } from "@/board/types";
import type { InputCtx, InteractionController } from "@/canvas/interactions";

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

export function BoardCanvas({ onEditObject }: BoardCanvasProps) {
  const tCanvasRef = useRef<HTMLCanvasElement>(null);
  const iCanvasRef = useRef<HTMLCanvasElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mathHostRef = useRef<HTMLDivElement>(null);

  // Viewport size (CSS px) + dpr, kept in a ref so render fns read live values.
  const viewRef = useRef({ W: 0, H: 0, dpr: 1 });

  // Pointer bookkeeping (the map, the pinch, the post-pinch guard) lives in
  // canvas/gestures — SHARED with the widget overlay, so a two-finger zoom
  // still works when one finger is resting on a widget card.
  //
  // The controller that received pointerdown: moves/ups keep routing to it (and
  // its overlay keeps drawing) even if the tool switches mid-drag via keyboard.
  const activeRef = useRef<InteractionController | null>(null);

  const store = useBoardStore;
  const onEditObjectRef = useRef(onEditObject);
  onEditObjectRef.current = onEditObject;

  // --- render scheduling (C4): one paint per animation frame ----------------
  const rafRef = useRef(0);
  const renderNowRef = useRef<() => void>(() => {});
  const requestRender = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      renderNowRef.current();
    });
  }, []);
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Reset the guard, or the cancelled handle blocks every later
      // requestRender: StrictMode's simulated unmount/remount reuses the same
      // refs, so leaving the stale id here froze all rAF-scheduled repaints
      // for the rest of the session (only sync resize() paints got through).
      rafRef.current = 0;
    },
    [],
  );

  // --- the text editor service (T6) -----------------------------------------
  const editor = useMemo(
    () =>
      createTextEditor({
        textarea: () => taRef.current,
        store,
        render: () => renderNowRef.current(),
      }),
    [store],
  );

  // --- the in-place maths editor service (canvas/mathEditor.ts) --------------
  const mathEditor = useMemo(
    () =>
      createMathEditor({
        host: () => mathHostRef.current,
        store,
        render: () => renderNowRef.current(),
      }),
    [store],
  );

  // Register both editors by the object type they edit: guards and
  // controllers resolve them through canvas/editors.ts, never by name.
  useEffect(() => {
    const unText = registerInPlaceEditor("text", editor);
    const unMath = registerInPlaceEditor("mathtext", mathEditor);
    return () => {
      unText();
      unMath();
    };
  }, [editor, mathEditor]);

  // --- the controllers' window into the host --------------------------------
  const inputCtx = useMemo<InputCtx>(
    () => ({
      store,
      camera: () => store.getState().camera,
      toWorld: (sx, sy) => screenToWorld(store.getState().camera, sx, sy),
      evPos: (e) => {
        // #template is the pointer surface (#ink is a pointer-events:none
        // overlay above it, so ink paints over the input boxes).
        const c = tCanvasRef.current!;
        const r = c.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      },
      render: requestRender,
      get canvas() {
        return tCanvasRef.current!;
      },
      editors: {
        open: (obj, isNew) => void openEditorFor(obj, isNew),
        commitAll: commitAllEditors,
        anyOpen: anyEditorOpen,
      },
      editObject: (obj) => onEditObjectRef.current?.(obj),
    }),
    [store, requestRender],
  );

  // --- draw: scene (grid + objects + committed ink), then the selection
  // chrome (host-drawn — it follows the selection in EVERY tool unless the
  // controller opts out, e.g. the laser), then the controller's preview
  // overlay in the same camera space ------------------------------------------
  const renderNow = useCallback(() => {
    const tCanvas = tCanvasRef.current;
    const iCanvas = iCanvasRef.current;
    if (!tCanvas || !iCanvas) return;
    const tctx = tCanvas.getContext("2d");
    const ictx = iCanvas.getContext("2d");
    if (!tctx || !ictx) return;
    const st = store.getState();
    renderScene(tctx, ictx, viewRef.current, st);
    const kit = { back: tctx, ink: ictx, camera: st.camera, theme };
    const ctrl = activeRef.current ?? getInteraction(st.tool);
    if (!ctrl?.suppressSelectionChrome?.(st)) drawSelectionOutlines(kit, st);
    ctrl?.drawOverlay?.(kit, inputCtx);
  }, [store, inputCtx]);
  renderNowRef.current = renderNow;

  // --- devicePixelRatio sizing + resize (C1) ---------------------------------
  const resize = useCallback(() => {
    // NOTE: do NOT commit the text editor here. On mobile, focusing the textarea
    // opens the virtual keyboard, which fires a window "resize"; committing would
    // blur and discard the just-created (still empty) text box — the keyboard
    // would slam shut the instant you tried to type. A viewport resize never
    // moves the camera, so the overlay stays correctly positioned and editing
    // continues uninterrupted.
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
    renderNow(); // sync: the resize just cleared both bitmaps
  }, [renderNow]);

  // --- pointer + gesture dispatch --------------------------------------------
  useEffect(() => {
    // The pointer surface is #template (base layer). #ink sits above it as a
    // pointer-events:none overlay so committed strokes paint over the type-in
    // input boxes, and the input layer between them is click-through except in
    // select mode.
    const surface = tCanvasRef.current;
    // Wheel zoom/pan is bound on the host #stage (the canvas's parent).
    const stage = surface?.parentElement;
    if (!surface || !stage) return;
    // Publish the surface so the widget overlay can measure its own presses in
    // the same space (canvas/gestures).
    gestures.setSurface(surface);
    // A press that lands on a widget's own control and is released off the card
    // reports to nobody; the net stops it stranding a finger in the registry.
    const dropSafetyNet = gestures.installSafetyNet();

    /** The controller owning the live interaction, else the active tool's. */
    const routed = () =>
      activeRef.current ?? getInteraction(store.getState().tool);

    /** Hand the gesture layer the way to abandon our live interaction when a
     *  second finger — on the canvas OR on a widget — turns this into a pinch. */
    const cancelLive = () => {
      const live = activeRef.current;
      activeRef.current = null;
      live?.cancel?.(inputCtx);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (anyEditorOpen()) {
        commitAllEditors();
        return; // the dismissing tap is swallowed
      }
      try {
        surface.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      // The gesture layer takes the finger first: it starts (and owns) the
      // pinch, and tells us when this pointer must not begin a tool action.
      if (gestures.down(e.pointerId, inputCtx.evPos(e), cancelLive)) {
        e.preventDefault();
        return;
      }

      const ctrl = getInteraction(store.getState().tool);
      if (ctrl) {
        activeRef.current = ctrl;
        ctrl.onPointerDown(e, inputCtx);
      }
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      // Bare hover (no pointer down anywhere): cursor feedback + hover previews
      // (the select tool's resize cursors, the pen/eraser brush ring).
      if (gestures.count() === 0) {
        const ctrl = getInteraction(store.getState().tool);
        if (ctrl?.hoverCursor) {
          const cur = ctrl.hoverCursor(e, inputCtx);
          surface.style.cursor = cur ?? ctrl.cursor ?? "default";
        }
        return;
      }
      if (!gestures.has(e.pointerId)) return;
      if (gestures.move(e.pointerId, inputCtx.evPos(e))) {
        e.preventDefault();
        return; // the pinch (or its tail) consumed it
      }
      routed()?.onPointerMove(e, inputCtx);
      e.preventDefault();
    };

    const release = (e: PointerEvent) => {
      if (!gestures.has(e.pointerId)) return;
      if (!gestures.up(e.pointerId)) routed()?.onPointerUp(e, inputCtx);
      if (gestures.count() === 0) activeRef.current = null;
    };

    const onDblClick = (e: MouseEvent) => {
      getInteraction(store.getState().tool)?.onDoubleClick?.(e, inputCtx);
    };

    const onWheel = (e: WheelEvent) => {
      commitAllEditors();
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const f = Math.exp(-e.deltaY * 0.0015);
        const p = inputCtx.evPos(e);
        viewport.zoomAt(f, p.x, p.y);
      } else {
        viewport.panBy(-e.deltaX, -e.deltaY);
      }
    };

    const onPointerLeave = () => {
      routed()?.onPointerLeave?.(inputCtx);
    };

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", release);
    surface.addEventListener("pointercancel", release);
    surface.addEventListener("pointerleave", onPointerLeave);
    surface.addEventListener("dblclick", onDblClick);
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", release);
      surface.removeEventListener("pointercancel", release);
      surface.removeEventListener("pointerleave", onPointerLeave);
      surface.removeEventListener("dblclick", onDblClick);
      stage.removeEventListener("wheel", onWheel);
      dropSafetyNet();
      gestures.setSurface(null);
      gestures.reset();
    };
  }, [inputCtx, store]);

  // ======================================================================
  // LIFECYCLE + STORE SUBSCRIPTIONS
  // ======================================================================

  // Initial sizing + resize tracking. A ResizeObserver on #stage is the source
  // of truth: it fires for ANY change to the stage's box, not just window
  // resizes. This matters because the MathLive virtual keyboard shrinks the
  // stage via layout (it reserves space at the bottom) WITHOUT firing a window
  // "resize" — so a window listener alone left the canvas bitmap at the old
  // tall size while its CSS box shrank, squashing the drawing (broken aspect
  // ratio). The window listener stays as a belt-and-braces for viewport / dpr
  // changes (browser zoom) that needn't alter the stage's CSS box. resize() is
  // idempotent, so the two firing together is harmless.
  useEffect(() => {
    resize();
    const stage = tCanvasRef.current?.parentElement;
    const ro = stage ? new ResizeObserver(() => resize()) : null;
    if (stage && ro) ro.observe(stage);
    window.addEventListener("resize", resize);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [resize]);

  // Expose the two layers to the PNG export service (no shell DOM reach), plus
  // a pass that bakes the type-in answer values (HTML inputs, uncapturable from
  // the canvas bitmap) into the exported image.
  useEffect(() => {
    const t = tCanvasRef.current;
    const i = iCanvasRef.current;
    if (!t || !i) return;
    return registerExportLayers(t, i, (octx) =>
      renderInputValues(octx, viewRef.current, store.getState()),
    );
  }, [store]);

  // Redraw whenever document / camera / tool / selection / editing changes.
  useEffect(() => {
    requestRender(); // once on mount, then on every relevant store transition
    return store.subscribe((s, prev) => {
      if (
        s.board !== prev.board ||
        s.camera !== prev.camera ||
        s.tool !== prev.tool ||
        s.drawMode !== prev.drawMode ||
        s.sizes !== prev.sizes || // any brush ring / preview size

        s.selection !== prev.selection ||
        s.editingId !== prev.editingId
      ) {
        requestRender();
      }
    });
  }, [requestRender, store]);

  // Cursor reflects the active tool (its controller's static cursor).
  const tool = useBoardStore((s) => s.tool);
  useEffect(() => {
    const c = tCanvasRef.current; // #template is the pointer surface now
    if (!c) return;
    c.style.cursor = getInteraction(tool)?.cursor ?? "default";
  }, [tool]);

  // Picking the maths tool starts the MathLive + KaTeX downloads immediately,
  // so the first tap opens the editor without a cold-start stall.
  useEffect(() => {
    if (tool === "math") prewarmMathEditor();
  }, [tool]);

  // The host (App) owns the #stage wrapper and renders WidgetLayer / ZoomCluster
  // / FloatButtons as siblings. This component contributes only the two stacked
  // canvases and the in-place text editor.
  return (
    <>
      <canvas id="template" ref={tCanvasRef} />
      <canvas id="ink" ref={iCanvasRef} />

      {/* In-place free-text editor (logic in canvas/textEditor.ts). */}
      <textarea
        id="textEditor"
        ref={taRef}
        spellCheck={false}
        onInput={() => editor.autoSize()}
        onBlur={(e) => {
          // Adjusting this text's own options (size / colour / alignment) must
          // not end the edit: skip the commit when focus lands in the options
          // pill or a colour popover. Leaving the zone (canvas, other UI) commits
          // as before. The size slider takes focus, so it re-focuses the
          // textarea on release (focusActiveTextEdit) to re-arm this.
          const to = e.relatedTarget as Element | null;
          if (to && to.closest("#options,.swatch-menu")) return;
          editor.commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            editor.commit();
          }
          e.stopPropagation();
        }}
      />

      {/* In-place maths editor host (logic + inner DOM in canvas/mathEditor.ts:
          a MathLive <math-field>, a raw-LaTeX textarea and the mode toggle).
          Enter/Escape commit; capture phase so MathLive never sees them. Other
          keys are stopped from reaching the window shortcut handler, exactly
          like the text editor above. Focus leaving the overlay commits too
          (the maths keyboard never takes focus, so it doesn't trigger this). */}
      <div
        id="mathEditor"
        ref={mathHostRef}
        onKeyDownCapture={(e) => {
          if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            mathEditor.commit();
          }
        }}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const to = e.relatedTarget as Node | null;
          if (to && !e.currentTarget.contains(to)) mathEditor.commit();
        }}
      />
    </>
  );
}
