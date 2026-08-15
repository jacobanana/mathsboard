// THE MULTI-TOUCH GESTURE REGISTRY — one home for every finger on the board,
// wherever it landed.
//
// Fingers arrive on two different surfaces: the <canvas> (BoardCanvas's pointer
// dispatch) and a widget's HTML card (WidgetLayer's capture-phase listeners).
// A pointer map kept privately by the canvas could only ever count the fingers
// that missed every widget — so resting one finger on a worksheet and pinching
// with the other silently became a widget drag instead of a zoom. Both surfaces
// register here instead, and the pinch sees two fingers however they landed.
//
// This owns exactly the SHARED pointer bookkeeping: the live pointer map, the
// two-finger pinch (delegated to canvas/viewport, which owns the camera), and
// the post-pinch guard that stops a lingering finger starting a fresh
// single-pointer action. Everything tool-specific stays in canvas/interactions/*.

import * as viewport from "@/canvas/viewport";

export interface Pt {
  x: number;
  y: number;
}

/** Stop a live single-pointer interaction (a stroke, a widget drag) because a
 *  pinch has taken over. Registered per pointer by whoever started it. */
export type CancelSingle = () => void;

const pointers = new Map<number, Pt>();
const cancels = new Map<number, CancelSingle>();
let pinch: viewport.Pinch | null = null;
// After a pinch ends with one finger still down, that finger must not start a
// fresh single-pointer action; cleared when every pointer lifts.
let ignoreSingle = false;

/** The pointer surface (the base <canvas>). Gesture positions are measured
 *  against its box so a widget press and a canvas press share one space. */
let surface: HTMLElement | null = null;

/** BoardCanvas publishes its base canvas here as it mounts. */
export function setSurface(el: HTMLElement | null): void {
  surface = el;
}

/** A pointer event's position in surface space (CSS px). */
export function pos(e: { clientX: number; clientY: number }): Pt {
  const r = surface?.getBoundingClientRect();
  return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
}

/** How many fingers are down, on the canvas and the widgets together. */
export const count = (): number => pointers.size;
export const has = (id: number): boolean => pointers.has(id);
export const pinching = (): boolean => pinch != null;

function twoPoints(): readonly [Pt | undefined, Pt | undefined] {
  const a = [...pointers.values()];
  return [a[0], a[1]] as const;
}

/**
 * Register a finger going down. Returns TRUE when the caller must NOT start a
 * single-pointer action with it: it's the second finger of a pinch, a third
 * finger, or a finger left over from the pinch that just ended.
 */
export function down(id: number, p: Pt, cancel?: CancelSingle): boolean {
  pointers.set(id, p);
  if (cancel) cancels.set(id, cancel);
  if (pointers.size === 2) {
    // A pinch outranks every single-pointer interaction — a half-drawn stroke,
    // a widget mid-drag — so they're all cancelled before the zoom starts.
    const live = [...cancels.values()];
    cancels.clear();
    for (const c of live) c();
    const [p1, p2] = twoPoints();
    if (p1 && p2) pinch = viewport.startPinch(p1, p2);
    return true;
  }
  return pointers.size > 2 || ignoreSingle;
}

/** Update a finger. Returns TRUE when the gesture layer consumed the move (a
 *  live pinch, or the post-pinch guard) and the caller must stand down. */
export function move(id: number, p: Pt): boolean {
  if (!pointers.has(id)) return false;
  pointers.set(id, p);
  if (pinch) {
    const [p1, p2] = twoPoints();
    if (p1 && p2) viewport.updatePinch(pinch, p1, p2);
    return true;
  }
  return ignoreSingle;
}

/** Release a finger. Returns TRUE when the gesture layer consumed the release
 *  (it was part of the pinch) so the caller doesn't also end its own drag. */
export function up(id: number): boolean {
  if (!pointers.has(id)) return false;
  pointers.delete(id);
  cancels.delete(id);
  const wasPinch = pinch != null;
  if (pinch && pointers.size < 2) {
    pinch = null;
    if (pointers.size === 1) ignoreSingle = true;
  }
  if (pointers.size === 0) ignoreSingle = false;
  return wasPinch;
}

/**
 * THE SAFETY NET. A press that never reports its release would sit in the map
 * for ever, and the very next press anywhere would be counted as a second
 * finger and start a phantom pinch. It happens easily: press a button inside a
 * widget card (so the card takes no pointer capture), drag off it and let go —
 * neither the card nor the canvas ever sees that pointerup.
 *
 * Bound on `window` in the BUBBLE phase, so it always runs LAST: whoever owns
 * the pointer has already released it properly and this finds nothing to do.
 * Returns its own disposer.
 */
export function installSafetyNet(): () => void {
  const net = (e: PointerEvent) => void up(e.pointerId);
  window.addEventListener("pointerup", net);
  window.addEventListener("pointercancel", net);
  return () => {
    window.removeEventListener("pointerup", net);
    window.removeEventListener("pointercancel", net);
  };
}

/** Forget every finger (unmount, and a clean slate between tests). */
export function reset(): void {
  pointers.clear();
  cancels.clear();
  pinch = null;
  ignoreSingle = false;
}
