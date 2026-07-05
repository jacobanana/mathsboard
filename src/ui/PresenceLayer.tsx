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

import { useEffect, useRef } from "react";
import { useBoardStore } from "@/board/store";
import { useCollabStore } from "@/collab/collabStore";
import { publishCursor } from "@/collab/session";
import { screenToWorld, worldToScreen } from "@/board/geometry";
import { applyLaserFocus } from "@/canvas/viewport";
import { LASER_COLOR } from "@/canvas/interactions/laser";

export function PresenceLayer(): JSX.Element | null {
  const mode = useCollabStore((s) => s.mode);
  const peers = useCollabStore((s) => s.peers);
  const camera = useBoardStore((s) => s.camera);

  // --- receive laser "guide my view" commands (director model) --------------
  // A peer's laser click / framed area moves OUR camera (recentre a hidden spot,
  // or zoom to fit an area). Each command carries a per-sender seq so we apply
  // it exactly once, even though awareness fires on every cursor tick.
  const seenFocus = useRef<Map<number, number>>(new Map());
  useEffect(() => {
    if (mode !== "shared") return;
    for (const p of peers) {
      const f = p.laserFocus;
      if (!f) continue;
      if (seenFocus.current.get(p.clientId) === f.seq) continue;
      seenFocus.current.set(p.clientId, f.seq);
      applyLaserFocus(f);
    }
  }, [peers, mode]);

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

  const lasers = peers.filter((p) => p.laser && p.laser.points.length > 0);

  return (
    <div className="presence-layer" aria-hidden>
      {/* Remote laser trails: a peer's ephemeral "look here" comet, drawn to
          match the local laser (canvas/interactions/laser.ts) IN THAT PEER'S
          colour. World points are mapped to screen with the LOCAL camera,
          exactly like the cursors. */}
      {lasers.length > 0 && (
        <svg className="laser-layer">
          {lasers.map((p) => {
            const color = p.laser!.color || LASER_COLOR;
            const pts = p.laser!.points.map((w) => worldToScreen(camera, w.x, w.y));
            const head = pts[pts.length - 1];
            return (
              <g key={p.clientId}>
                {pts.length > 1 && (
                  <polyline
                    points={pts.map((s) => `${s.x},${s.y}`).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeOpacity={0.35}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                <circle
                  cx={head.x}
                  cy={head.y}
                  r={6}
                  fill={color}
                  style={{ filter: `drop-shadow(0 0 5px ${color})` }}
                />
                <circle cx={head.x} cy={head.y} r={1.6} fill="#fff" />
              </g>
            );
          })}
        </svg>
      )}

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
