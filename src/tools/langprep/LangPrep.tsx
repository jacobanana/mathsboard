// WIDGET COMPONENT — the .iprep overlay: "where is it?" pick the preposition.
//
// One widget runs a session (see prep.ts). Each round DRAWS a scene — an object
// emoji placed on / in / under / in front of / behind / beside a box — and the
// learner taps the preposition that names it. Answers are live widget-state
// (`pa:<i>` / checked `pc:<i>` via updateWidgetState — synced, persisted,
// undo-invisible). The card body is the drag handle.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMemo } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import { SpeakButton } from "@/lang/SpeakButton";
import {
  checkPatch,
  clampRounds,
  deriveDeck,
  isChecked,
  isRoundCorrect,
  newDeckPatch,
  nextPatch,
  readAnswer,
  replayPatch,
  scoreCount,
  scoreDeck,
  setAnswerPatch,
  verdict,
  type PrepObj,
  type PrepRound,
} from "@/tools/langprep/prep";
import type { PrepPosition } from "@/lang/content/schema";
import type { LangPrepParams } from "@/tools/langprep";

const HEAD_H = 40;

// Where the object emoji sits relative to the box (centred at 50%,50%), plus its
// z-order against the box — so "behind" tucks under it and "front" sits over it.
const SCENE: Record<PrepPosition, { style: CSSProperties; z: number }> = {
  on: { style: { left: "50%", top: "20%", transform: "translate(-50%,-50%)" }, z: 2 },
  under: { style: { left: "50%", top: "84%", transform: "translate(-50%,-50%)" }, z: 2 },
  beside: { style: { left: "82%", top: "52%", transform: "translate(-50%,-50%)" }, z: 2 },
  in: { style: { left: "50%", top: "50%", transform: "translate(-50%,-50%) scale(.58)" }, z: 2 },
  front: { style: { left: "56%", top: "66%", transform: "translate(-50%,-50%)" }, z: 3 },
  behind: { style: { left: "44%", top: "36%", transform: "translate(-50%,-50%)" }, z: 1 },
};

function Scene({ round }: { round: PrepRound }) {
  const s = SCENE[round.position];
  return (
    <div className="pp-scene-art" aria-hidden>
      <span className="pp-box" style={{ zIndex: 2 }}>
        📦
      </span>
      <span className="pp-obj" style={{ ...s.style, zIndex: s.z }}>
        {round.emoji}
      </span>
    </div>
  );
}

export function LangPrep({ obj }: WidgetProps<LangPrepParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mo = obj as unknown as PrepObj;
  const deck = useMemo(
    () => deriveDeck(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.known, obj.learning, obj.rounds, obj.round],
  );
  const rounds = deck.length || clampRounds(obj.rounds);
  const idx = Math.min(obj.idx ?? 0, rounds);
  const finished = idx >= rounds || deck.length === 0;
  const round = finished ? null : deck[idx];
  const checked = finished ? false : isChecked(mo, idx);
  const answer = finished ? "" : readAnswer(mo, idx);
  const correct = !!round && checked && isRoundCorrect(round, answer);

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

  const fresh = (): PrepObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as PrepObj | undefined;

  function pick(option: string) {
    if (!round) return;
    updateWidgetState(obj.id, { ...setAnswerPatch(idx, option), ...checkPatch(idx) });
    bumpFx(isRoundCorrect(round, option) ? "ok" : "no");
    track("tool_action", { tool: "langprep", action: "check" });
  }
  function retry() {
    updateWidgetState(obj.id, { [`pa:${idx}`]: undefined, [`pc:${idx}`]: undefined });
    setFx(null);
  }
  function next() {
    setFx(null);
    updateWidgetState(obj.id, nextPatch(fresh() ?? mo));
    track("tool_action", { tool: "langprep", action: "next" });
  }
  function newGame() {
    setFx(null);
    updateWidgetState(obj.id, newDeckPatch(fresh() ?? mo));
    track("tool_action", { tool: "langprep", action: "new" });
  }
  function replay() {
    setFx(null);
    updateWidgetState(obj.id, replayPatch(fresh() ?? mo));
    track("tool_action", { tool: "langprep", action: "replay" });
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, .pp-scroll, .lang-speak")) return;
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
      className={"iprep" + (fx?.kind === "ok" ? " happy" : fx?.kind === "no" ? " shake" : "")}
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="pp-head" style={{ height: HEAD_H + "px" }}>
        <span className="pp-title">Where is it?</span>
        <span className="pp-progress">{finished ? "Results" : `${idx + 1} / ${rounds}`}</span>
        <button className="pp-new" title="New game" onClick={newGame}>
          New
        </button>
      </div>

      {finished || !round ? (
        deck.length === 0 ? (
          <div className="lf-empty">No prepositions yet for this language.</div>
        ) : (
          <Summary obj={mo} deck={deck} onReplay={replay} onNew={newGame} />
        )
      ) : (
        <div className="pp-scene" key={`${obj.round ?? 0}:${idx}`}>
          <Scene round={round} />

          <div className="pp-q">Where is the {round.emoji}?</div>

          {!checked && (
            <div className="pp-opts">
              {round.options.map((op, i) => (
                <button key={i} className="pp-opt" onClick={() => pick(op)}>
                  {op}
                </button>
              ))}
            </div>
          )}

          <div className="pp-foot">
            {checked ? (
              <>
                <span className={"pp-result " + (correct ? "ok" : "no")}>
                  {correct ? `Correct! ${round.answer} = ${round.known} 🎉` : `Answer: ${round.answer}`}
                </span>
                <SpeakButton text={round.answer} code={obj.learning} title="Hear the word" />
                {!correct && (
                  <button className="pp-retry" onClick={retry}>
                    Try again
                  </button>
                )}
                <button className="pp-next" onClick={next}>
                  {idx + 1 >= rounds ? "See results ▸" : "Next ▸"}
                </button>
              </>
            ) : (
              <span className="pp-hint">Tap the word for where it is</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({
  obj,
  deck,
  onReplay,
  onNew,
}: {
  obj: PrepObj;
  deck: PrepRound[];
  onReplay: () => void;
  onNew: () => void;
}) {
  const scored = scoreDeck(obj, deck);
  const correct = scoreCount(scored);
  const total = scored.length;
  const v = verdict(correct, total);
  return (
    <div className="pp-summary">
      <div className="pp-score">
        <div className="pp-score-big">
          {correct} <span className="pp-score-of">/ {total}</span>
        </div>
        <div className="pp-score-sub">
          {v.emoji} {v.text}
        </div>
      </div>
      <div className="pp-scroll" onWheel={(e) => e.stopPropagation()}>
        {scored.map((s, i) => (
          <div className={"pp-srow" + (s.correct ? " ok" : " no")} key={i}>
            <span className="pp-srow-mk">{s.correct ? "✓" : "✗"}</span>
            <span className="pp-srow-a">
              {s.round.emoji} {s.round.answer} — {s.round.known}
            </span>
          </div>
        ))}
      </div>
      <div className="pp-summary-actions">
        <button className="pp-again" onClick={onReplay}>
          Play again
        </button>
        <button className="pp-newdeck" onClick={onNew}>
          New game
        </button>
      </div>
    </div>
  );
}
