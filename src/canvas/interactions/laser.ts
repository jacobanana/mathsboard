// The laser-pointer interaction controller: an ephemeral "look here" comet.
//
// WHY IT EXISTS: over a video call (learner on their own tablet, or the tutor
// screen-sharing) there is no way to point at something without marking it —
// on touch there isn't even a hover cursor, since pointermove only fires while
// a finger is down (and that draws). The laser is a press-drag pointer that
// leaves a short fading trail and writes NOTHING to the document: no object, no
// stroke, no undo. It therefore cannot corrupt the CRDT — the lowest-risk tool.
//
// RENDERING IS SPLIT ON PURPOSE (see docs/feature-roadmap.md A1):
//   - the LOCAL trail draws on the canvas ink layer via drawOverlay(), so it
//     works in every build/mode — solo, static single-user, and captured by a
//     plain screen-share;
//   - REMOTE peers' trails travel over the Yjs awareness channel (publishLaser)
//     and are drawn by ui/PresenceLayer.tsx, which is always-on while shared
//     regardless of the local tool. Both use the same colours below so a peer's
//     laser looks identical to your own.

import { publishLaser } from "@/collab/session";
import type { InteractionController, Pt } from "@/canvas/interactions/types";

/** Laser visuals, shared with the remote renderer (ui/PresenceLayer.tsx). */
export const LASER_COLOR = "#ff2b2b";
export const LASER_CORE = "#ff6b6b";
/** How many of the most recent points form the comet tail. */
const MAX_TRAIL = 8;

// Live trail (world coords, oldest→newest) and the pointer that owns it. Held
// as module locals — the controller is a singleton, only one laser is live.
let trail: Pt[] | null = null;
let pid = -1;

// Broadcasts are throttled to one per animation frame, matching the cursor's
// publish rate; pointermove can fire faster than the display refreshes.
let pubRaf = 0;
let pubPending: Pt[] | null = null;
function schedulePublish(points: Pt[] | null): void {
  pubPending = points;
  if (pubRaf) return;
  pubRaf = requestAnimationFrame(() => {
    pubRaf = 0;
    publishLaser(pubPending);
  });
}
/** Publish immediately, dropping any queued frame (used when the laser ends so
 *  the dot clears on peers without a frame of lag). */
function publishNow(points: Pt[] | null): void {
  if (pubRaf) {
    cancelAnimationFrame(pubRaf);
    pubRaf = 0;
  }
  pubPending = points;
  publishLaser(points);
}

/** End the live trail: clear locally and tell peers to drop it. */
function end(c: { render(): void }): void {
  trail = null;
  pid = -1;
  publishNow(null);
  c.render();
}

export const laserController: InteractionController = {
  tool: "laser",
  // A precise aim point while hovering (desktop); on touch the dot IS the aim.
  cursor: "crosshair",

  onPointerDown(e, c) {
    pid = e.pointerId;
    const pp = c.evPos(e);
    trail = [c.toWorld(pp.x, pp.y)];
    schedulePublish(trail.slice());
    c.render();
  },

  onPointerMove(e, c) {
    if (!trail || e.pointerId !== pid) return;
    const pp = c.evPos(e);
    trail.push(c.toWorld(pp.x, pp.y));
    if (trail.length > MAX_TRAIL) trail.shift();
    schedulePublish(trail.slice());
    c.render();
  },

  onPointerUp(e, c) {
    if (e.pointerId !== pid) return;
    end(c);
  },

  // A second finger turned the tap into a pinch — abandon the trail.
  cancel(c) {
    if (trail) end(c);
  },

  // The LOCAL trail, painted over the committed ink. The ink ctx already has
  // the camera transform applied (like the brush ring), so points are drawn in
  // world space and pixel sizes are divided by scale to stay constant on screen.
  drawOverlay(kit) {
    const t = trail;
    if (!t || t.length === 0) return;
    const ctx = kit.ink;
    const s = kit.camera.scale;
    ctx.save();
    // Comet tail through the recent points.
    if (t.length > 1) {
      ctx.beginPath();
      ctx.moveTo(t[0].x, t[0].y);
      for (let i = 1; i < t.length; i++) ctx.lineTo(t[i].x, t[i].y);
      ctx.strokeStyle = "rgba(255,43,43,0.35)";
      ctx.lineWidth = 4 / s;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    const head = t[t.length - 1];
    // Glowing head, then a lighter core and a white centre for a laser look.
    ctx.shadowColor = LASER_COLOR;
    ctx.shadowBlur = 12 / s;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 6 / s, 0, Math.PI * 2);
    ctx.fillStyle = LASER_COLOR;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 3.5 / s, 0, Math.PI * 2);
    ctx.fillStyle = LASER_CORE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(head.x, head.y, 1.4 / s, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
  },
};
