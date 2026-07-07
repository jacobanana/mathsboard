// WIDGET COMPONENT — the .itimer overlay: a clean 2D vector timer you start,
// pause and reset, with a digital hh:mm:ss readout.
//
// The visual matches the MODE (each an SVG in a 100×100 viewBox, flat vector):
//   - countdown  -> an HOURGLASS whose amber sand drains top→bottom (a bounded
//                   fraction; see hourglass.ts). Reset flips the glass.
//   - stopwatch  -> a CHRONOGRAPH dial with a smoothly sweeping second hand and
//                   a slow minute hand (count-up is unbounded, so a dial fits and
//                   an hourglass does not).
//
// A single self-terminating rAF loop drives whichever is showing, updating a
// handful of SVG attributes imperatively (sand bands / stream / flip, or the two
// hand rotations) — no per-frame React re-render, fluid at 60fps.
//
// Start / pause / reset are SHARED STATE via updateWidgetState (INPUT_ORIGIN):
// synced, persisted, undo-invisible, like the dice. A countdown stores an
// absolute anchorAt+anchorMs so every client derives the same value and finish
// moment (no write on finish); `flipSeq` (reset bumps it) drives the flip. The
// board-wide "Time's up!" alert lives in src/ui/TimerDoneLayer.tsx.
//
// Dragging the card moves the object; the controls stopPropagate so a press on
// them never starts a drag. Selection is handled by the WidgetLayer.

import { useEffect, useMemo, useRef } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import {
  VIEW,
  NECK_Y,
  GLASS_PATH,
  sandTopSurfaceY,
  sandBottomSurfaceY,
} from "@/tools/timer/hourglass";
import {
  type TimerLive,
  type TimerMode,
  currentMs,
  displaySeconds,
  finishAt,
  formatHMS,
  pausePatch,
  progress,
  resetPatch,
  restingMs,
  startPatch,
} from "@/tools/timer/time";
import { READOUT_H, CTRL_H, type TimerParams } from "@/tools/timer";

// --- animation timings --------------------------------------------------------

const FLIP_MS = 720; // countdown reset flip-over
const BURST_MS = 1200; // countdown finish ring pop
const INK = "#2F4A48"; // glass/case/ticks/hands
const SAND = "#E0A02F"; // amber accent (sand, second hand)

// Stopwatch dial geometry (same 100×100 viewBox).
const SW_CX = 50;
const SW_CY = 55;
const SW_R = 33;
const TICKS = Array.from({ length: 60 }, (_, i) => ({ a: i * 6, major: i % 5 === 0 }));

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

let uid = 0;

export function Timer({ obj }: WidgetProps<TimerParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mode: TimerMode = obj.mode === "stopwatch" ? "stopwatch" : "countdown";
  const durationMs = Math.max(0, obj.durationMs ?? 0);
  const live: TimerLive = {
    running: obj.running,
    anchorMs: obj.anchorMs,
    anchorAt: obj.anchorAt,
    flipSeq: obj.flipSeq,
  };

  const cssW = obj.w;
  const stageH = Math.max(1, obj.h - READOUT_H - CTRL_H);
  const gid = useMemo(() => `tm${uid++}`, []);

  const readoutRef = useRef<HTMLSpanElement>(null);
  // Hourglass refs
  const groupRef = useRef<SVGGElement>(null);
  const topSandRef = useRef<SVGRectElement>(null);
  const botSandRef = useRef<SVGRectElement>(null);
  const streamRef = useRef<SVGRectElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  // Stopwatch refs
  const secHandRef = useRef<SVGGElement>(null);
  const minHandRef = useRef<SVGGElement>(null);

  const rafRef = useRef(0);
  const lastFlipRef = useRef(obj.flipSeq ?? 0); // seeded: mount/join never flips
  const flipStartRef = useRef<number | null>(null);
  const lastSecRef = useRef<number | null>(null);
  const burstKeyRef = useRef<string | null>(null);
  const burstStartRef = useRef<number | null>(null);

  const restMs = restingMs(mode, durationMs, live);
  // Resting values for the first paint (before rAF runs).
  const initF =
    mode === "countdown"
      ? durationMs > 0
        ? clamp(1 - restMs / durationMs, 0, 1)
        : 1
      : 0;
  const initTopY = sandTopSurfaceY(initF);
  const initBotY = sandBottomSurfaceY(initF);
  const initSec = (restMs / 1000) * 6; // deg
  const initMin = (restMs / 60000) * 6; // deg

  useEffect(() => {
    // A countdown reset bumped flipSeq -> start the flip (never on the seeded
    // mount value; the stopwatch just snaps its hands to zero).
    const flip = obj.flipSeq ?? 0;
    if (flip !== lastFlipRef.current) {
      lastFlipRef.current = flip;
      if (mode === "countdown") flipStartRef.current = Date.now();
    }

    let stopped = false;
    const frame = () => {
      if (stopped) return;
      const now = Date.now();
      const cur = currentMs(mode, durationMs, live, now);
      let keepGoing = false;

      if (mode === "countdown") {
        const finished = !!live.running && cur <= 0;
        const f = progress(mode, durationMs, live, now);

        const topY = sandTopSurfaceY(f);
        const botY = sandBottomSurfaceY(f);
        topSandRef.current?.setAttribute("y", String(topY));
        topSandRef.current?.setAttribute("height", String(Math.max(0, NECK_Y - topY)));
        botSandRef.current?.setAttribute("y", String(botY));
        botSandRef.current?.setAttribute("height", String(Math.max(0, VIEW - botY)));

        const streaming = !!live.running && !finished && f > 0.002 && f < 0.998;
        if (streamRef.current) {
          streamRef.current.setAttribute("opacity", streaming ? "0.9" : "0");
          streamRef.current.setAttribute("height", String(Math.max(0, botY - NECK_Y)));
        }

        let angle = 0;
        let flipping = false;
        if (flipStartRef.current != null) {
          const p = (now - flipStartRef.current) / FLIP_MS;
          if (p >= 1) flipStartRef.current = null;
          else {
            angle = 180 * easeOutCubic(clamp(p, 0, 1));
            flipping = true;
          }
        }

        const fa = finishAt(mode, live);
        if (fa != null && now >= fa) {
          const key = `${obj.id}:${live.anchorAt}`;
          if (burstKeyRef.current !== key) {
            burstKeyRef.current = key;
            if (now - fa < BURST_MS) burstStartRef.current = fa;
          }
        }
        let burst = 0;
        if (burstStartRef.current != null) {
          const bp = (now - burstStartRef.current) / BURST_MS;
          if (bp >= 1) burstStartRef.current = null;
          else burst = clamp(bp, 0, 1);
        }
        if (ringRef.current) {
          ringRef.current.setAttribute("r", String(4 + burst * 46));
          ringRef.current.setAttribute("opacity", burst > 0 ? String((1 - burst) * 0.7) : "0");
        }
        const scale = 1 + 0.06 * Math.sin(burst * Math.PI);
        groupRef.current?.setAttribute(
          "transform",
          `translate(${VIEW / 2} ${VIEW / 2}) rotate(${angle}) scale(${scale}) translate(${-VIEW / 2} ${-VIEW / 2})`,
        );

        keepGoing = flipping || burst > 0 || (!!live.running && !finished);
      } else {
        // Stopwatch: sweep the second hand (360°/min) and creep the minute hand
        // (360°/hour). Both continuous, so the sweep reads smooth.
        secHandRef.current?.setAttribute(
          "transform",
          `rotate(${(cur / 1000) * 6} ${SW_CX} ${SW_CY})`,
        );
        minHandRef.current?.setAttribute(
          "transform",
          `rotate(${(cur / 60000) * 6} ${SW_CX} ${SW_CY})`,
        );
        keepGoing = !!live.running;
      }

      const secs = displaySeconds(cur, mode === "countdown");
      if (secs !== lastSecRef.current) {
        lastSecRef.current = secs;
        if (readoutRef.current)
          readoutRef.current.textContent = formatHMS(cur, mode === "countdown");
      }

      if (keepGoing) rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    obj.running,
    obj.anchorMs,
    obj.anchorAt,
    obj.flipSeq,
    obj.mode,
    obj.durationMs,
  ]);

  // --- controls (write shared state) -----------------------------------------
  function readLive(): TimerLive {
    const o = useBoardStore
      .getState()
      .board.objects.find((x) => x.id === obj.id) as
      | (TimerParams & { id: string })
      | undefined;
    return {
      running: o?.running,
      anchorMs: o?.anchorMs,
      anchorAt: o?.anchorAt,
      flipSeq: o?.flipSeq,
    };
  }

  const write = (patch: TimerLive): void =>
    updateWidgetState(obj.id, patch as Record<string, unknown>);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const l = readLive();
    const now = Date.now();
    if (l.running) {
      write(pausePatch(mode, durationMs, l, now));
      track("tool_action", { tool: "timer", action: "paused" });
    } else {
      const patch = startPatch(mode, durationMs, l, now);
      if (!patch) return; // finished countdown — Reset first
      write(patch);
      track("tool_action", { tool: "timer", action: "started" });
    }
  }

  function reset(e: React.MouseEvent) {
    e.stopPropagation();
    write(resetPatch(readLive()));
    track("tool_action", { tool: "timer", action: "reset" });
  }

  // --- drag (move) the card --------------------------------------------------
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const el = e.currentTarget;
    const scale = useBoardStore.getState().camera.scale;
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = obj.x;
    const oy = obj.y;
    let moved = false;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const mv = (ev: PointerEvent) => {
      if (!moved) {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 3) return;
        moved = true;
        pushHistory();
      }
      moveObject(obj.id, ox + (ev.clientX - sx) / scale, oy + (ev.clientY - sy) / scale);
    };
    const up = () => {
      el.removeEventListener("pointermove", mv);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up);
  }

  const initText = formatHMS(restMs, mode === "countdown");

  return (
    <div
      className="itimer"
      data-id={obj.id}
      style={{ width: cssW + "px", height: obj.h + "px" }}
      onPointerDown={onPointerDown}
    >
      <div className="itimer-stage" style={{ height: stageH + "px" }}>
        <svg
          className="itimer-svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {mode === "countdown" ? (
            <>
              <defs>
                <linearGradient id={`sand-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#F6D277" />
                  <stop offset="1" stopColor="#E0A02F" />
                </linearGradient>
                <linearGradient id={`glass-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
                  <stop offset="1" stopColor="#D9E6EA" stopOpacity="0.45" />
                </linearGradient>
                <clipPath id={`clip-${gid}`}>
                  <path d={GLASS_PATH} />
                </clipPath>
              </defs>
              <g ref={groupRef}>
                <path d={GLASS_PATH} fill={`url(#glass-${gid})`} />
                <g clipPath={`url(#clip-${gid})`}>
                  <rect
                    ref={botSandRef}
                    x="0"
                    width={VIEW}
                    y={initBotY}
                    height={Math.max(0, VIEW - initBotY)}
                    fill={`url(#sand-${gid})`}
                  />
                  <rect
                    ref={topSandRef}
                    x="0"
                    width={VIEW}
                    y={initTopY}
                    height={Math.max(0, NECK_Y - initTopY)}
                    fill={`url(#sand-${gid})`}
                  />
                  <rect
                    ref={streamRef}
                    x={VIEW / 2 - 1.4}
                    width="2.8"
                    y={NECK_Y}
                    height="0"
                    rx="1.2"
                    fill="#EBB94A"
                    opacity="0"
                  />
                </g>
                <path
                  d={GLASS_PATH}
                  fill="none"
                  stroke={INK}
                  strokeWidth="2.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <rect x="14" y="7" width="72" height="8.5" rx="4.25" fill={INK} />
                <rect x="14" y="84.5" width="72" height="8.5" rx="4.25" fill={INK} />
                <circle
                  ref={ringRef}
                  cx={VIEW / 2}
                  cy={VIEW / 2}
                  r="0"
                  fill="none"
                  stroke="#EBB94A"
                  strokeWidth="2.5"
                  opacity="0"
                />
              </g>
            </>
          ) : (
            <>
              {/* Top crown + side pushers (the stopwatch silhouette). */}
              <rect x="46.5" y="6.5" width="7" height="7" rx="2.2" fill={INK} />
              <rect
                x="48"
                y={SW_CY - SW_R - 3}
                width="4"
                height="5"
                rx="1"
                fill={INK}
                transform={`rotate(-40 ${SW_CX} ${SW_CY})`}
              />
              <rect
                x="48"
                y={SW_CY - SW_R - 3}
                width="4"
                height="5"
                rx="1"
                fill={INK}
                transform={`rotate(40 ${SW_CX} ${SW_CY})`}
              />
              {/* Case */}
              <circle cx={SW_CX} cy={SW_CY} r={SW_R} fill="#FDFCF8" stroke={INK} strokeWidth="2.6" />
              <circle cx={SW_CX} cy={SW_CY} r={SW_R - 3.5} fill="none" stroke={INK} strokeWidth="0.5" opacity="0.35" />
              {/* Ticks */}
              {TICKS.map(({ a, major }) => (
                <line
                  key={a}
                  x1={SW_CX}
                  y1={SW_CY - SW_R + 1.5}
                  x2={SW_CX}
                  y2={SW_CY - SW_R + (major ? 7 : 4)}
                  stroke={INK}
                  strokeWidth={major ? 1.7 : 0.9}
                  strokeLinecap="round"
                  opacity={major ? 0.9 : 0.5}
                  transform={`rotate(${a} ${SW_CX} ${SW_CY})`}
                />
              ))}
              {/* Minute hand (slow) */}
              <g ref={minHandRef} transform={`rotate(${initMin} ${SW_CX} ${SW_CY})`}>
                <line
                  x1={SW_CX}
                  y1={SW_CY + 4}
                  x2={SW_CX}
                  y2={SW_CY - SW_R * 0.52}
                  stroke={INK}
                  strokeWidth="2.6"
                  strokeLinecap="round"
                />
              </g>
              {/* Second hand (sweeps) */}
              <g ref={secHandRef} transform={`rotate(${initSec} ${SW_CX} ${SW_CY})`}>
                <line
                  x1={SW_CX}
                  y1={SW_CY + 7}
                  x2={SW_CX}
                  y2={SW_CY - SW_R * 0.82}
                  stroke={SAND}
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </g>
              {/* Hub */}
              <circle cx={SW_CX} cy={SW_CY} r="3" fill={INK} />
              <circle cx={SW_CX} cy={SW_CY} r="1.2" fill={SAND} />
            </>
          )}
        </svg>
      </div>
      <div className="itimer-readout" style={{ height: READOUT_H + "px" }}>
        <span ref={readoutRef}>{initText}</span>
      </div>
      <div className="itimer-controls" style={{ height: CTRL_H + "px" }}>
        <button
          type="button"
          className="itimer-btn primary"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggle}
        >
          {obj.running ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          className="itimer-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={reset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
