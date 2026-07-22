// WIDGET COMPONENT — the .ilmatch overlay: match the translation by drawing a
// line between a word and its translation.
//
// Two columns: known words on the left, scrambled translations on the right. The
// learner presses a word and drags to its translation; a live line follows the
// pointer, and on release the connection is KEPT and coloured by correctness —
// GREEN when right (locked), RED when wrong. A wrong line can be undone by
// tapping the line itself, or either of its two words, which removes it so the
// learner can try again. Connections are live widget-state (`mc:<i>` = the joined
// right slot, via updateWidgetState — synced, persisted, undo-invisible); the
// lines are DERIVED and re-drawn from the node positions, so they survive reload
// and resize. The card body is the drag handle. See match.ts for the pure engine.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import {
  allMatched,
  connectPatch,
  connectionSlot,
  connections,
  correctCount,
  deriveRound,
  disconnectPatch,
  newRoundPatch,
  occupiedRightSlots,
  title,
  type Connection,
  type MatchObj,
} from "@/tools/langmatch/match";
import type { LangMatchParams } from "@/tools/langmatch";

const HEAD_H = 40;

const GREEN = "#16A34A";
const RED = "#DC2626";

interface Pt {
  x: number;
  y: number;
}

export function LangMatch({ obj }: WidgetProps<LangMatchParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mo = obj as unknown as MatchObj;
  const round = useMemo(
    () => deriveRound(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.categories, obj.category, obj.level, obj.known, obj.learning, obj.count, obj.round],
  );
  const size = round.items.length;
  const done = allMatched(mo);
  const correct = correctCount(round, mo);

  // Resolve the current connections and index them by endpoint.
  const conns = connections(round, mo);
  const byLeft = new Map<number, Connection>(conns.map((c) => [c.left, c]));
  const byRight = new Map<number, Connection>(conns.map((c) => [c.right, c]));

  // --- refs for measuring node anchors --------------------------------------
  const boardRef = useRef<HTMLDivElement | null>(null);
  const leftRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rightRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // A live drag line, in board-local (unscaled) coordinates.
  const [pending, setPending] = useState<{ from: Pt; to: Pt } | null>(null);
  // Bumped after mount and on any size/round/connection change so the derived
  // lines recompute once the node refs (and their offsets) are in place.
  const [, setMeasure] = useState(0);
  useLayoutEffect(() => {
    setMeasure((n) => n + 1);
  }, [obj.w, obj.h, obj.round, conns.length, size]);
  useEffect(() => setMeasure((n) => n + 1), []);

  // --- anchor geometry (board-local px; layout is unscaled) -----------------
  // Anchor to the node's DOT centre, measured in screen px and converted to the
  // board's local unscaled space (getBoundingClientRect, not offsetLeft, since
  // the columns are positioned). The dot is the visible join point.
  function anchor(el: HTMLElement | null): Pt | null {
    const board = boardRef.current;
    if (!el || !board) return null;
    const target = (el.querySelector(".lm-dot") as HTMLElement | null) ?? el;
    const br = board.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const scale = useBoardStore.getState().camera.scale || 1;
    return {
      x: (r.left + r.width / 2 - br.left) / scale,
      y: (r.top + r.height / 2 - br.top) / scale,
    };
  }

  /** Convert a pointer event to board-local (unscaled) coordinates. */
  function toLocal(clientX: number, clientY: number): Pt {
    const r = boardRef.current?.getBoundingClientRect();
    const scale = useBoardStore.getState().camera.scale || 1;
    return {
      x: (clientX - (r?.left ?? 0)) / scale,
      y: (clientY - (r?.top ?? 0)) / scale,
    };
  }

  const fresh = (): MatchObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as
      | MatchObj
      | undefined;

  // --- drag a connection ----------------------------------------------------
  function startConnect(
    side: "left" | "right",
    index: number,
    e: React.PointerEvent<HTMLButtonElement>,
  ) {
    e.stopPropagation();
    e.preventDefault();
    const startEl = e.currentTarget;
    const from = anchor(startEl);
    if (!from) return;
    setPending({ from, to: toLocal(e.clientX, e.clientY) });

    const move = (ev: PointerEvent) => {
      setPending({ from, to: toLocal(ev.clientX, ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPending(null);
      drop(side, index, ev.clientX, ev.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Resolve which opposite-column node the pointer was released over, then join
   *  the two — KEEPING the connection whether right or wrong (its colour tells
   *  the learner which). Only joins when BOTH endpoints are still free. */
  function drop(side: "left" | "right", index: number, clientX: number, clientY: number) {
    const targets = side === "left" ? rightRefs.current : leftRefs.current;
    let hit = -1;
    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        hit = i;
        break;
      }
    }
    if (hit < 0) return;
    const leftIdx = side === "left" ? index : hit;
    const rightSlot = side === "left" ? hit : index;
    // Re-read the latest state so two quick joins can't collide.
    const m = fresh() ?? mo;
    const rnd = deriveRound(m);
    if (connectionSlot(m, leftIdx) != null) return; // left already joined
    if (occupiedRightSlots(rnd, m).has(rightSlot)) return; // right already used
    updateWidgetState(obj.id, connectPatch(leftIdx, rightSlot));
    track("tool_action", { tool: "langmatch", action: "connect" });
  }

  function removeConn(left: number) {
    updateWidgetState(obj.id, disconnectPatch(left));
    track("tool_action", { tool: "langmatch", action: "remove" });
  }

  function newGame() {
    updateWidgetState(obj.id, newRoundPatch(fresh() ?? mo));
    track("tool_action", { tool: "langmatch", action: "new" });
  }

  // --- card drag (a press that isn't on a node/button moves the object) -----
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, .lm-hit")) return;
    e.stopPropagation();
    const cardEl = e.currentTarget;
    const scale = useBoardStore.getState().camera.scale;
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = obj.x;
    const oy = obj.y;
    let moved = false;
    try {
      cardEl.setPointerCapture(e.pointerId);
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
      cardEl.removeEventListener("pointermove", mv);
      cardEl.removeEventListener("pointerup", up);
    };
    cardEl.addEventListener("pointermove", mv);
    cardEl.addEventListener("pointerup", up);
  }

  // --- lines (derived from the connections) ---------------------------------
  const lines = conns
    .map((c) => {
      const from = anchor(leftRefs.current[c.left]);
      const to = anchor(rightRefs.current[c.right]);
      return from && to ? { ...c, from, to } : null;
    })
    .filter((l): l is Connection & { from: Pt; to: Pt } => l != null);

  return (
    <div
      className={"ilmatch" + (done ? " done" : "")}
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="lm-head" style={{ height: HEAD_H + "px" }}>
        <span className="lm-title">{title(mo)}</span>
        <span className="lm-progress">{done ? "Done! 🎉" : `${correct} / ${size}`}</span>
        <button className="lm-new" title="New game" onClick={newGame}>
          New
        </button>
      </div>

      {size === 0 ? (
        <div className="lf-empty">No words yet for this topic.</div>
      ) : (
        <div className="lm-board" ref={boardRef}>
          {/* the connecting lines (green = correct/locked, red = wrong/removable),
              plus the live drag line */}
          <svg className="lm-lines" aria-hidden={false}>
            {lines.map((l) => (
              <g key={l.left}>
                {/* A wide, invisible hit line so tapping the RED line removes it
                    (the visible line is thin; correct green lines aren't clickable). */}
                {!l.correct && (
                  <line
                    className="lm-hit"
                    x1={l.from.x}
                    y1={l.from.y}
                    x2={l.to.x}
                    y2={l.to.y}
                    stroke="transparent"
                    strokeWidth={20}
                    strokeLinecap="round"
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeConn(l.left)}
                  />
                )}
                <line
                  x1={l.from.x}
                  y1={l.from.y}
                  x2={l.to.x}
                  y2={l.to.y}
                  stroke={l.correct ? GREEN : RED}
                  strokeWidth={4}
                  strokeLinecap="round"
                  style={{ pointerEvents: "none" }}
                />
              </g>
            ))}
            {pending && (
              <line
                x1={pending.from.x}
                y1={pending.from.y}
                x2={pending.to.x}
                y2={pending.to.y}
                stroke="#94A3B8"
                strokeWidth={4}
                strokeDasharray="7 6"
                strokeLinecap="round"
                style={{ pointerEvents: "none" }}
              />
            )}
          </svg>

          <div className="lm-col lm-left">
            {round.left.map((w, i) => {
              const c = byLeft.get(i);
              const state = c ? (c.correct ? "matched" : "wrong") : "free";
              return (
                <button
                  key={i}
                  ref={(el) => (leftRefs.current[i] = el)}
                  className={"lm-node" + (state !== "free" ? " " + state : "")}
                  title={state === "wrong" ? "Not quite — tap to remove" : undefined}
                  onPointerDown={state === "free" ? (e) => startConnect("left", i, e) : undefined}
                  onClick={state === "wrong" ? () => removeConn(i) : undefined}
                >
                  {round.emojis[i] && <span className="lm-emoji">{round.emojis[i]}</span>}
                  <span className="lm-word">{w}</span>
                  <span className="lm-dot lm-dot-r" />
                </button>
              );
            })}
          </div>

          <div className="lm-col lm-right">
            {round.right.map((w, r) => {
              const c = byRight.get(r);
              const state = c ? (c.correct ? "matched" : "wrong") : "free";
              return (
                <button
                  key={r}
                  ref={(el) => (rightRefs.current[r] = el)}
                  className={"lm-node lm-node-r" + (state !== "free" ? " " + state : "")}
                  title={state === "wrong" ? "Not quite — tap to remove" : undefined}
                  onPointerDown={state === "free" ? (e) => startConnect("right", r, e) : undefined}
                  onClick={state === "wrong" && c ? () => removeConn(c.left) : undefined}
                >
                  <span className="lm-dot lm-dot-l" />
                  <span className="lm-word">{w}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
