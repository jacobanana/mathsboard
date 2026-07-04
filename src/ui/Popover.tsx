// A dropdown panel anchored below a trigger button — the shared shell behind
// every toolbar dropdown (Paper, the burger menu, the colour palette) so they
// all dismiss and position identically.
//
// The CALLER owns the trigger and the open state; this owns only the floating
// panel: positioning (fixed, below the anchor, edge-aligned with a viewport
// clamp) and dismissal (a press anywhere outside, or Escape). Pass
// `anchor = null` to close; pass the trigger element to open.
//
// Dismissal notes:
//   - Uses pointerdown (not click) so it closes the moment you interact
//     elsewhere, and installs on the NEXT tick so the very press that opened
//     the panel doesn't immediately close it.
//   - A press on the anchor is ignored here, so a self-toggling trigger keeps
//     working (its own click flips the open state).
//   - onClose is read through a ref, so a caller passing a fresh arrow each
//     render doesn't cancel/re-arm the listener (the bug the Paper menu had).

import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

interface PopoverProps {
  /** The trigger element to anchor to. `null` closes (renders nothing). */
  anchor: HTMLElement | null;
  onClose: () => void;
  /** Which of the panel's edges lines up with the same edge of the anchor. */
  align?: "left" | "right";
  /** Which side of the anchor the panel opens on. Triggers that live in the
   *  bottom dock open "top" so the panel isn't pushed off screen. */
  side?: "bottom" | "top";
  /** Gap between the anchor and the panel (px). */
  gap?: number;
  id?: string;
  className?: string;
  children: ReactNode;
}

export function Popover({
  anchor,
  onClose,
  align = "left",
  side = "bottom",
  gap = 6,
  id,
  className,
  children,
}: PopoverProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!anchor) return;
    const onPointer = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor.contains(t)) return; // let the trigger toggle itself
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeRef.current();
    };
    // Defer the pointer listener one tick so the opening press doesn't hit it.
    const t = setTimeout(
      () => document.addEventListener("pointerdown", onPointer),
      0,
    );
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  if (!anchor) return null;

  const r = anchor.getBoundingClientRect();
  // Clamp to a 6px viewport margin so the panel is always fully on screen.
  const horiz: CSSProperties =
    align === "right"
      ? { right: Math.max(6, window.innerWidth - r.right) }
      : { left: Math.max(6, r.left) };
  const vert: CSSProperties =
    side === "top"
      ? { bottom: window.innerHeight - r.top + gap }
      : { top: r.bottom + gap };

  return (
    <div
      id={id}
      className={className}
      ref={ref}
      style={{ position: "fixed", ...vert, ...horiz }}
    >
      {children}
    </div>
  );
}
