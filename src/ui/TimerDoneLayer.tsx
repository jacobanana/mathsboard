// The board-wide "Time's up!" alert. When any timer's COUNTDOWN reaches zero,
// EVERY connected client shows a full-screen flash + banner + confetti for a few
// seconds, then it auto-clears.
//
// No extra broadcast is needed: a countdown stores an absolute finish moment
// (anchorAt + anchorMs) in shared state, so each client independently derives the
// crossing from the synced object — the same way every dice client animates off
// the shared `roll`. A per-session `seen` set keyed on `${id}:${anchorAt}` plus a
// "within the window" gate means a reload or late-join past the window stays
// silent, while joining DURING the window still shows the tail. The per-widget
// sand burst lives in Timer.tsx; this layer owns only the board-wide part.

import { useCallback, useEffect, useRef, useState } from "react";
import { useBoardStore } from "@/board/store";
import { finishAt, type TimerMode } from "@/tools/timer/time";

/** How long the alert stays on screen. */
const CELEBRATE_MS = 4000;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** The timer fields this layer reads off a board object. */
interface TimerObj {
  id: string;
  type: string;
  mode?: TimerMode;
  running?: boolean;
  anchorMs?: number;
  anchorAt?: number;
}

const asTimer = (o: { id: string; type: string }): TimerObj =>
  o as unknown as TimerObj;

export function TimerDoneLayer(): JSX.Element | null {
  const objects = useBoardStore((s) => s.board.objects);
  const seenRef = useRef<Set<string>>(new Set());
  const clearRef = useRef<number | null>(null);
  // The alert currently on screen (null = nothing), with the wall-clock it ends.
  const [active, setActive] = useState<{ until: number } | null>(null);

  // Only scan while at least one running countdown exists.
  const hasRunningCountdown = objects.some((o) => {
    const t = asTimer(o);
    return t.type === "timer" && !!t.running && t.mode === "countdown";
  });

  const celebrate = useCallback((until: number) => {
    setActive((prev) => ({ until: Math.max(prev?.until ?? 0, until) }));
    if (clearRef.current) window.clearTimeout(clearRef.current);
    clearRef.current = window.setTimeout(
      () => setActive(null),
      Math.max(0, until - Date.now()),
    );
  }, []);

  useEffect(() => {
    if (!hasRunningCountdown) return;
    const scan = () => {
      const now = Date.now();
      let fire = false;
      let until = 0;
      for (const o of useBoardStore.getState().board.objects) {
        const t = asTimer(o);
        if (t.type !== "timer") continue;
        const fa = finishAt(t.mode ?? "countdown", {
          running: t.running,
          anchorMs: t.anchorMs,
          anchorAt: t.anchorAt,
        });
        if (fa == null || now < fa) continue;
        const key = `${t.id}:${t.anchorAt}`;
        if (seenRef.current.has(key)) continue;
        seenRef.current.add(key); // one-shot per run
        if (now - fa < CELEBRATE_MS) {
          fire = true;
          until = Math.max(until, fa + CELEBRATE_MS);
        }
      }
      if (fire) celebrate(until);
    };
    const id = window.setInterval(scan, 200);
    scan();
    return () => window.clearInterval(id);
  }, [hasRunningCountdown, celebrate]);

  useEffect(
    () => () => {
      if (clearRef.current) window.clearTimeout(clearRef.current);
    },
    [],
  );

  if (!active) return null;
  return (
    <div className="timer-done" aria-hidden>
      <div className="timer-flash" />
      <Confetti until={active.until} />
      <div className="timer-banner">Time&rsquo;s up!</div>
    </div>
  );
}

/** A dependency-free full-screen confetti burst that self-fades by `until`. */
function Confetti({ until }: { until: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = (): void => {
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    resize();

    const colors = ["#E7B84B", "#2E9E5B", "#2E6FB7", "#D6469B", "#E8842B", "#7E57C2"];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const parts = Array.from({ length: 96 }, () => ({
      x: Math.random() * W,
      y: -20 - Math.random() * H * 0.6,
      vx: (Math.random() - 0.5) * 140,
      vy: 140 + Math.random() * 200,
      s: 6 + Math.random() * 9,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 7,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));

    let last = Date.now();
    let raf = 0;
    const frame = (): void => {
      const now = Date.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const fade = clamp((until - now) / 700, 0, 1); // ease out the last 700ms
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 240 * dt; // gravity
        p.rot += p.vr * dt;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
        ctx.restore();
      }
      if (now < until) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [until]);

  return <canvas ref={ref} className="timer-confetti" />;
}
