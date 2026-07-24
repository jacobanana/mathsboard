// WIDGET COMPONENT — the .igender overlay: sort each noun into its gender basket.
//
// A pile of nouns sits above two-or-more baskets, one per definite article the
// learning language uses (le / la, der / die / das). The learner taps a word to
// pick it up, then taps a basket to drop it in: a right drop LOCKS green, a wrong
// one turns red and can be tapped to send the word back to the pile. Placements
// are live widget-state (`gb:<i>` = the basket index, via updateWidgetState —
// synced, persisted, undo-invisible); correctness is derived, so it can't drift.
// Pile words are spoken WITHOUT their article (that's the puzzle); once sorted
// correctly a word is spoken WITH it ("le chien"). The card body is the drag
// handle. See gender.ts for the pure engine.

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import { SpeakButton } from "@/lang/SpeakButton";
import {
  allSorted,
  cardsInBucket,
  correctCount,
  deriveRound,
  isCardCorrect,
  newRoundPatch,
  pileCards,
  placePatch,
  removePatch,
  roundSize,
  title,
  type GenderObj,
} from "@/tools/langgender/gender";
import type { LangGenderParams } from "@/tools/langgender";

const HEAD_H = 40;

export function LangGender({ obj }: WidgetProps<LangGenderParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mo = obj as unknown as GenderObj;
  const round = useMemo(
    () => deriveRound(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.categories, obj.category, obj.level, obj.known, obj.learning, obj.count, obj.round],
  );
  const size = roundSize(mo);
  const done = allSorted(mo);
  const correct = correctCount(round, mo);

  // The word the learner has "picked up", waiting for a basket. LOCAL, ephemeral
  // (each collaborator has their own selection); placement is the shared state.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [obj.round, size]);

  const [fx, setFx] = useState<{ kind: "ok" | "no"; n: number } | null>(null);
  const fxSeq = useRef(0);
  const fxTimer = useRef(0);
  function bumpFx(kind: "ok" | "no") {
    fxSeq.current += 1;
    setFx({ kind, n: fxSeq.current });
    window.clearTimeout(fxTimer.current);
    fxTimer.current = window.setTimeout(() => setFx(null), kind === "ok" ? 900 : 600);
  }
  useEffect(() => () => window.clearTimeout(fxTimer.current), []);

  const pile = pileCards(round, mo);

  function pick(i: number) {
    setPicked((cur) => (cur === i ? null : i));
  }
  function drop(bucket: number) {
    if (picked == null) return;
    const i = picked;
    setPicked(null);
    const rightBasket = round.buckets[bucket] === round.items[i]?.article;
    updateWidgetState(obj.id, placePatch(i, bucket));
    bumpFx(rightBasket ? "ok" : "no");
    track("tool_action", { tool: "langgender", action: rightBasket ? "correct" : "wrong" });
  }
  function sendBack(i: number) {
    updateWidgetState(obj.id, removePatch(i));
    setFx(null);
  }
  function newGame() {
    setPicked(null);
    setFx(null);
    const fresh =
      (useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as unknown as
        | GenderObj
        | undefined) ?? mo;
    updateWidgetState(obj.id, newRoundPatch(fresh));
    track("tool_action", { tool: "langgender", action: "new" });
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, .gd-basket, .lang-speak")) return;
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

  return (
    <div
      className={"igender" + (done ? " done" : fx?.kind === "ok" ? " happy" : fx?.kind === "no" ? " shake" : "")}
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="gd-head" style={{ height: HEAD_H + "px" }}>
        <span className="gd-title">{title(mo)}</span>
        <span className="gd-progress">{done ? "Done! 🎉" : `${correct} / ${size}`}</span>
        <button className="gd-new" title="New game" onClick={newGame}>
          New
        </button>
      </div>

      {size === 0 ? (
        <div className="lf-empty">No gendered words yet for this topic.</div>
      ) : (
        <div className="gd-body">
          {/* the pile of words still to sort */}
          <div className="gd-pile">
            {pile.length === 0 ? (
              <span className="gd-pile-empty">All sorted! 🎉</span>
            ) : (
              pile.map((i) => {
                const n = round.items[i];
                return (
                  <button
                    key={i}
                    className={"gd-word" + (picked === i ? " picked" : "")}
                    onClick={() => pick(i)}
                  >
                    {n.emoji && <span className="gd-emoji">{n.emoji}</span>}
                    <span className="gd-w">{n.learning}</span>
                    <span className="gd-gloss">{n.known}</span>
                    <SpeakButton as="span" text={n.learning} code={obj.learning} />
                  </button>
                );
              })
            )}
          </div>

          {/* the baskets, one per article */}
          <div className="gd-baskets">
            {round.buckets.map((article, b) => (
              <button
                key={b}
                className={"gd-basket" + (picked != null ? " active" : "")}
                onClick={() => drop(b)}
                disabled={picked == null}
              >
                <span className="gd-basket-head">{article}</span>
                <span className="gd-basket-cards">
                  {cardsInBucket(round, mo, b).map((i) => {
                    const n = round.items[i];
                    const ok = isCardCorrect(round, mo, i);
                    return (
                      <span
                        key={i}
                        className={"gd-chip " + (ok ? "ok" : "no")}
                        title={ok ? undefined : "Not quite — tap to try again"}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!ok) sendBack(i);
                        }}
                      >
                        {n.emoji && <span className="gd-chip-emoji">{n.emoji}</span>}
                        <span className="gd-chip-w">{ok ? `${article} ${n.learning}` : n.learning}</span>
                        {ok && (
                          <SpeakButton as="span" text={`${article} ${n.learning}`} code={obj.learning} />
                        )}
                      </span>
                    );
                  })}
                </span>
              </button>
            ))}
          </div>

          <div className="gd-foot">
            {done ? (
              <span className="gd-foot-done">Every word in the right basket 🎉</span>
            ) : (
              <span className="gd-foot-hint">
                {picked == null ? "Tap a word, then tap its basket" : "Now tap the right basket"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
