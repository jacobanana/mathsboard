// WIDGET COMPONENT — the .ilmatch overlay: match the translation by drawing a
// line between a word and its translation.
//
// Two columns: known words on the left, scrambled translations on the right. The
// learner presses a word and drags to its translation; a live line follows the
// pointer, and on release the connection is checked — correct locks a green
// line, wrong flashes red and is dropped. The matched set is live widget-state
// (`mm:<i>` flags via updateWidgetState — synced, persisted, undo-invisible);
// the lines are DERIVED from it and re-drawn from the node positions, so they
// survive reload and resize. The card body is the drag handle (a press that
// isn't on a node/button moves the object). See match.ts for the pure engine.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import {
  allMatched,
  correctSlotFor,
  deriveRound,
  isConnectionCorrect,
  isMatched,
  matchPatch,
  matchedCount,
  newRoundPatch,
  title,
  type MatchObj,
} from "@/tools/langmatch/match";
import type { LangMatchParams } from "@/tools/langmatch";

const HEAD_H = 40;

/** Line colours for the connections (locked matches cycle through them so a
 *  finished board looks like a tangle of happy threads). */
const LINE_COLORS = ["#6D5EF6", "#0D9488", "#DB2777", "#2563EB", "#7C3AED", "#EA580C", "#16A34A", "#DC2626"];

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
    [obj.id, obj.category, obj.level, obj.known, obj.learning, obj.count, obj.round],
  );
  const size = round.items.length;
  const done = allMatched(mo);
  const matched = matchedCount(mo, size);

  // --- refs for measuring node anchors --------------------------------------
  const boardRef = useRef<HTMLDivElement | null>(null);
  const leftRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rightRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // A live drag line, in board-local (unscaled) coordinates.
  const [pending, setPending] = useState<{ from: Pt; to: Pt } | null>(null);
  const [wrong, setWrong] = useState<number | null>(null); // left index flashing
  const wrongTimer = useRef(0);
  // Bumped after mount and on any size/round change so the derived match lines
  // recompute once the node refs (and their offsets) are in place.
  const [, setMeasure] = useState(0);
  useLayoutEffect(() => {
    setMeasure((n) => n + 1);
  }, [obj.w, obj.h, obj.round, matched, size]);
  useEffect(() => () => window.clearTimeout(wrongTimer.current), []);

  // --- anchor geometry (board-local px; layout is unscaled) -----------------
  // Anchor to the node's DOT centre, measured in screen px and converted to the
  // board's local unscaled space. Using getBoundingClientRect (not offsetLeft)
  // is essential: the columns are positioned, so offsetLeft is column-relative,
  // which would land the right endpoint at the board's left edge. The dot is the
  // visible join point, so lines meet dot-to-dot across the gap.
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
      x: ((clientX - (r?.left ?? 0)) / scale),
      y: ((clientY - (r?.top ?? 0)) / scale),
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
    // Already-matched endpoints are inert.
    if (side === "left" && isMatched(mo, index)) return;
    if (side === "right" && isMatched(mo, round.rightOrder[index])) return;
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

  /** Resolve which opposite-column node the pointer was released over, and
   *  validate the connection. */
  function drop(
    side: "left" | "right",
    index: number,
    clientX: number,
    clientY: number,
  ) {
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
    if (isMatched(mo, leftIdx)) return;
    if (isConnectionCorrect(round, leftIdx, rightSlot)) {
      updateWidgetState(obj.id, matchPatch(leftIdx));
      track("tool_action", { tool: "langmatch", action: "match" });
    } else {
      flashWrong(leftIdx);
    }
  }

  function flashWrong(leftIdx: number) {
    setWrong(leftIdx);
    window.clearTimeout(wrongTimer.current);
    wrongTimer.current = window.setTimeout(() => setWrong(null), 500);
  }

  function newGame() {
    updateWidgetState(obj.id, newRoundPatch(fresh() ?? mo));
    track("tool_action", { tool: "langmatch", action: "new" });
  }

  // --- card drag (a press that isn't on a node/button moves the object) -----
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
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

  // --- locked match lines (derived from the matched flags) ------------------
  const lines: { from: Pt; to: Pt; color: string }[] = [];
  for (let i = 0; i < size; i++) {
    if (!isMatched(mo, i)) continue;
    const from = anchor(leftRefs.current[i]);
    const to = anchor(rightRefs.current[correctSlotFor(round, i)]);
    if (from && to) lines.push({ from, to, color: LINE_COLORS[i % LINE_COLORS.length] });
  }

  return (
    <div
      className={"ilmatch" + (done ? " done" : "")}
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="lm-head" style={{ height: HEAD_H + "px" }}>
        <span className="lm-title">{title(mo)}</span>
        <span className="lm-progress">
          {done ? "Done! 🎉" : `${matched} / ${size}`}
        </span>
        <button className="lm-new" title="New game" onClick={newGame}>
          New
        </button>
      </div>

      {size === 0 ? (
        <div className="lf-empty">No words yet for this topic.</div>
      ) : (
        <div className="lm-board" ref={boardRef}>
          {/* the connecting lines (locked + the live drag) */}
          <svg className="lm-lines" aria-hidden>
            {lines.map((l, i) => (
              <line
                key={i}
                x1={l.from.x}
                y1={l.from.y}
                x2={l.to.x}
                y2={l.to.y}
                stroke={l.color}
                strokeWidth={4}
                strokeLinecap="round"
              />
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
              />
            )}
          </svg>

          <div className="lm-col lm-left">
            {round.left.map((w, i) => (
              <button
                key={i}
                ref={(el) => (leftRefs.current[i] = el)}
                className={
                  "lm-node" +
                  (isMatched(mo, i) ? " matched" : "") +
                  (wrong === i ? " wrong" : "")
                }
                onPointerDown={(e) => startConnect("left", i, e)}
              >
                {round.emojis[i] && <span className="lm-emoji">{round.emojis[i]}</span>}
                <span className="lm-word">{w}</span>
                <span className="lm-dot lm-dot-r" />
              </button>
            ))}
          </div>

          <div className="lm-col lm-right">
            {round.right.map((w, r) => {
              const owner = round.rightOrder[r];
              return (
                <button
                  key={r}
                  ref={(el) => (rightRefs.current[r] = el)}
                  className={"lm-node lm-node-r" + (isMatched(mo, owner) ? " matched" : "")}
                  onPointerDown={(e) => startConnect("right", r, e)}
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
