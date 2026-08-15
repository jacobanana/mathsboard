// The floating token that follows the pointer during a pick-and-place drag
// (usePickPlace) — a gender word on its way to a basket, a verb form on its way
// to a row.
//
// WHY A PORTAL: every widget is rendered inside a wrapper carrying the camera's
// `transform: scale(...)` (canvas/WidgetLayer.tsx), and a transformed ancestor
// becomes the containing block for `position: fixed` descendants. A ghost left
// inside the card therefore reads its VIEWPORT coordinates as CARD ones and
// drifts away from the finger — by more the further the card is from the origin
// and the further the zoom is from 100%. Portalling to <body> puts it back in
// real viewport space, which is where usePickPlace's clientX/clientY live.
//
// It is also drawn at the camera scale, so the token in hand is exactly the size
// of the word it was lifted from.

import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useBoardStore } from "@/board/store";
import type { PickPlacePoint } from "@/lang/usePickPlace";

export function PickGhost({
  at,
  children,
}: {
  at: PickPlacePoint;
  children: ReactNode;
}): JSX.Element {
  const scale = useBoardStore((s) => s.camera.scale);
  return createPortal(
    <div
      className="pick-ghost"
      style={{
        left: at.x,
        top: at.y,
        transform: `translate(-50%, -50%) rotate(-3deg) scale(${scale})`,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
