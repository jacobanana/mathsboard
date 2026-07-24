// A REUSABLE "pick and place" interaction for the language games — used wherever
// the learner moves a token onto a target: a word into a gender basket, a verb
// form into a conjugation row, and anything similar later.
//
// It supports BOTH ways of doing that, from the same wiring:
//   • DRAG   — press a source and drag it onto a target; a floating ghost follows
//              the pointer and the target under it highlights; releasing places it.
//   • TAP    — tap a source to "pick it up" (it highlights), then tap a target to
//              drop it there. Good for precise taps and accessibility.
// A press that doesn't move past a small threshold is a tap; anything more is a
// drag — so the two never fight.
//
// The hook is deliberately generic: sources and targets are identified by plain
// string ids, and a single `onPlace(sourceId, targetId)` callback does the actual
// work (write widget-state, mark, etc.). The consumer renders its own ghost from
// `dragId` (positioned at `ghost`, which is in viewport coords — a position:fixed
// element, so it ignores the board's camera transform). Styling hooks come as
// data-attributes: sources get data-picked / data-dragging, targets get data-over.

import { useCallback, useRef, useState } from "react";

export interface PickPlacePoint {
  /** Viewport X (clientX) — for a position:fixed ghost. */
  x: number;
  /** Viewport Y (clientY). */
  y: number;
}

/** A press must move more than this many px to count as a drag, not a tap. */
const DRAG_THRESHOLD = 4;

/**
 * Pure hit-test: the id of the LAST target rect containing (x, y), or null.
 * Last-wins so a target drawn on top (later in DOM/paint order) takes the drop.
 * Disabled targets are skipped. Exported for unit testing without a real DOM.
 */
export function hitTarget(
  rects: { id: string; rect: { left: number; right: number; top: number; bottom: number }; disabled?: boolean }[],
  x: number,
  y: number,
): string | null {
  let found: string | null = null;
  for (const t of rects) {
    if (t.disabled) continue;
    const r = t.rect;
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found = t.id;
  }
  return found;
}

export interface SourceProps {
  onPointerDown: (e: React.PointerEvent) => void;
  "data-picked"?: true;
  "data-dragging"?: true;
}

export interface TargetProps {
  ref: (el: HTMLElement | null) => void;
  onClick: (e: React.MouseEvent) => void;
  "data-over"?: true;
}

export interface PickPlace {
  /** The source currently "picked up" by a tap, awaiting a target tap. */
  picked: string | null;
  /** The source being dragged right now (render your ghost from this). */
  dragId: string | null;
  /** Where the ghost should sit (viewport coords), or null when not dragging. */
  ghost: PickPlacePoint | null;
  /** True while a source is in hand (picked OR being dragged) — for drop hints. */
  active: boolean;
  /** Props for a source element (a word / a bank form). */
  sourceProps(id: string, opts?: { disabled?: boolean }): SourceProps;
  /** Props for a target element (a basket / a row cell). */
  targetProps(id: string, opts?: { disabled?: boolean }): TargetProps;
  /** Clear any selection / drag (call on new round / reshuffle). */
  reset(): void;
}

export function usePickPlace(opts: {
  onPlace: (sourceId: string, targetId: string) => void;
}): PickPlace {
  const { onPlace } = opts;
  const [picked, setPicked] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<PickPlacePoint | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Live registry of target elements + which are disabled (kept in refs so the
  // pointer handlers always hit-test the current rects).
  const targets = useRef<Map<string, HTMLElement>>(new Map());
  const disabled = useRef<Set<string>>(new Set());
  // Keep the latest onPlace without re-creating the handlers every render.
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  const reset = useCallback(() => {
    setPicked(null);
    setDragId(null);
    setGhost(null);
    setOverId(null);
  }, []);

  const hit = useCallback((x: number, y: number): string | null => {
    const rects = [...targets.current.entries()].map(([id, el]) => ({
      id,
      rect: el.getBoundingClientRect(),
      disabled: disabled.current.has(id),
    }));
    return hitTarget(rects, x, y);
  }, []);

  const sourceProps = useCallback(
    (id: string, o?: { disabled?: boolean }): SourceProps => {
      const off = o?.disabled ?? false;
      return {
        ...(picked === id ? { "data-picked": true as const } : {}),
        ...(dragId === id ? { "data-dragging": true as const } : {}),
        onPointerDown: (e: React.PointerEvent) => {
          if (off) return;
          e.stopPropagation(); // a press on a token must never drag the whole card
          const sx = e.clientX;
          const sy = e.clientY;
          let moved = false;
          const move = (ev: PointerEvent) => {
            if (!moved) {
              if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < DRAG_THRESHOLD) return;
              moved = true;
              setPicked(null);
              setDragId(id);
            }
            setGhost({ x: ev.clientX, y: ev.clientY });
            setOverId(hit(ev.clientX, ev.clientY));
          };
          const up = (ev: PointerEvent) => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            if (moved) {
              const target = hit(ev.clientX, ev.clientY);
              setDragId(null);
              setGhost(null);
              setOverId(null);
              if (target) onPlaceRef.current(id, target);
            } else {
              // A tap (no real movement): pick this source up, or drop it if it
              // was already the picked one.
              setPicked((cur) => (cur === id ? null : id));
            }
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        },
      };
    },
    [picked, dragId, hit],
  );

  const targetProps = useCallback(
    (id: string, o?: { disabled?: boolean }): TargetProps => {
      const off = o?.disabled ?? false;
      if (off) disabled.current.add(id);
      else disabled.current.delete(id);
      return {
        ...(overId === id ? { "data-over": true as const } : {}),
        ref: (el: HTMLElement | null) => {
          if (el) targets.current.set(id, el);
          else targets.current.delete(id);
        },
        onClick: (e: React.MouseEvent) => {
          if (off || picked == null) return;
          e.stopPropagation();
          const src = picked;
          setPicked(null);
          onPlaceRef.current(src, id);
        },
      };
    },
    [picked, overId],
  );

  return {
    picked,
    dragId,
    ghost,
    active: picked != null || dragId != null,
    sourceProps,
    targetProps,
    reset,
  };
}
