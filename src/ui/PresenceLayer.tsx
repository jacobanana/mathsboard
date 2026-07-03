// Live presence overlay: remote cursors (name-tagged) and remote selection
// outlines, plus the PUBLISHING side of local presence (cursor + selection).
//
// PRESENCE IS EPHEMERAL BY CONSTRUCTION: everything here travels over the Yjs
// awareness protocol (session.publishCursor / publishSelection) and is never
// written into the persisted document. Cursor positions are exchanged in WORLD
// coordinates because every participant has their own camera; this layer maps
// them to screen space with the local camera, exactly like the WidgetLayer.
//
// Rendered inside #stage as a pointer-events:none sibling of the canvases.

import { useEffect } from "react";
import { useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import { publishCursor, publishSelection } from "@/collab/session";
import { screenToWorld, worldToScreen, strokeBounds } from "@/board/geometry";

/** Selection outline padding in screen px (matches the local canvas outline). */
const PAD = 8;

export function PresenceLayer(): JSX.Element | null {
  const mode = useCollabStore((s) => s.mode);
  const peers = useCollabStore((s) => s.peers);
  const camera = useBoardStore((s) => s.camera);
  const board = useBoardStore((s) => s.board);

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

  // --- publish the local selection whenever it changes -----------------------
  useEffect(() => {
    if (mode !== "shared") return;
    publishSelection(useBoardStore.getState().selection);
    const unsub = useBoardStore.subscribe((s, prev) => {
      if (s.selection !== prev.selection) publishSelection(s.selection);
    });
    return () => {
      unsub();
      publishSelection(null);
    };
  }, [mode]);

  if (mode !== "shared" || peers.length === 0) return null;

  return (
    <div className="presence-layer" aria-hidden>
      {/* Remote selection outlines (dashed, in each peer's colour). */}
      {peers.flatMap((p) => {
        if (!p.selection) return [];
        const boxes: JSX.Element[] = [];
        for (const id of p.selection.objectIds) {
          const o = board.objects.find((x) => x.id === id);
          if (!o) continue;
          const s = worldToScreen(camera, o.x, o.y);
          boxes.push(
            <div
              key={p.clientId + ":" + id}
              className="remote-sel"
              style={{
                left: s.x - PAD,
                top: s.y - PAD,
                width: o.w * camera.scale + PAD * 2,
                height: o.h * camera.scale + PAD * 2,
                borderColor: p.color,
              }}
            />,
          );
        }
        for (const id of p.selection.strokeIds) {
          const stroke = board.strokes.find((x) => x.id === id);
          if (!stroke) continue;
          const b = strokeBounds(stroke);
          const s = worldToScreen(camera, b.x, b.y);
          boxes.push(
            <div
              key={p.clientId + ":" + id}
              className="remote-sel"
              style={{
                left: s.x - PAD,
                top: s.y - PAD,
                width: b.w * camera.scale + PAD * 2,
                height: b.h * camera.scale + PAD * 2,
                borderColor: p.color,
              }}
            />,
          );
        }
        return boxes;
      })}

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
