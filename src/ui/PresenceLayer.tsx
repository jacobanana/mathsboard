// Live presence overlay: remote cursors (name-tagged), plus the PUBLISHING
// side of the local cursor. Selections are deliberately NOT part of presence -
// what someone has selected stays local to them.
//
// PRESENCE IS EPHEMERAL BY CONSTRUCTION: everything here travels over the Yjs
// awareness protocol (session.publishCursor) and is never written into the
// persisted document. Cursor positions are exchanged in WORLD coordinates
// because every participant has their own camera; this layer maps them to
// screen space with the local camera, exactly like the WidgetLayer.
//
// Rendered inside #stage as a pointer-events:none sibling of the canvases.

import { useEffect } from "react";
import { useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import { publishCursor } from "@/collab/session";
import { screenToWorld, worldToScreen } from "@/board/geometry";

export function PresenceLayer(): JSX.Element | null {
  const mode = useCollabStore((s) => s.mode);
  const peers = useCollabStore((s) => s.peers);
  const camera = useBoardStore((s) => s.camera);

  // --- publish the local cursor, throttled to animation frames --------------
  useEffect(() => {
    if (mode !== "shared") return;
    const stage = document.getElementById("stage");
    if (!stage) return;
    let raf = 0;
    let pending: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const cam = useBoardStore.getState().camera;
      pending = screenToWorld(cam, e.clientX - r.left, e.clientY - r.top);
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          publishCursor(pending);
        });
      }
    };
    const onLeave = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      publishCursor(null);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      publishCursor(null);
    };
  }, [mode]);

  if (mode !== "shared" || peers.length === 0) return null;

  return (
    <div className="presence-layer" aria-hidden>
      {/* Remote cursors with name tags. */}
      {peers.map((p) => {
        if (!p.cursor) return null;
        const s = worldToScreen(camera, p.cursor.x, p.cursor.y);
        return (
          <div
            key={p.clientId}
            className="remote-cursor"
            style={{ left: s.x, top: s.y }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path
                d="M2 1l6 14 2.2-5.8L16 7z"
                fill={p.color}
                stroke="#fff"
                strokeWidth="1.2"
              />
            </svg>
            <span className="rc-name" style={{ background: p.color }}>
              {p.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
