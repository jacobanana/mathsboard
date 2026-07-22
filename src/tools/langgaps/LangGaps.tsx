// WIDGET COMPONENT — the .igaps overlay: fill the missing word in a sentence.
//
// One widget runs a session (see gaps.ts). Each round shows a sentence in the
// learning language with one word blanked (the known-language sentence is the
// hint). EASY mode offers word buttons to tap; HARD mode gives a box to type
// into. Answers are live widget-state (`ga:<i>` / checked `gc:<i>` via
// updateWidgetState — synced, persisted, undo-invisible). The card body is the
// drag handle.

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import {
  affixes,
  checkPatch,
  clampRounds,
  deckTitle,
  deriveDeck,
  isChecked,
  isRoundCorrect,
  newDeckPatch,
  nextPatch,
  readAnswer,
  replayPatch,
  retryPatch,
  scoreCount,
  scoreDeck,
  setAnswerPatch,
  verdict,
  type GapObj,
} from "@/tools/langgaps/gaps";
import type { LangGapsParams } from "@/tools/langgaps";

const HEAD_H = 40;

const BANNERS: [string, string][] = [
  ["#6D5EF6", "#8B7BF9"],
  ["#0D9488", "#14B8A6"],
  ["#DB2777", "#EC4899"],
  ["#2563EB", "#38BDF8"],
  ["#7C3AED", "#A855F7"],
  ["#EA580C", "#FB923C"],
];

export function LangGaps({ obj }: WidgetProps<LangGapsParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mo = obj as unknown as GapObj;
  const deck = useMemo(
    () => deriveDeck(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.category, obj.level, obj.known, obj.learning, obj.rounds, obj.round],
  );
  const rounds = deck.length || clampRounds(obj.rounds);
  const idx = Math.min(obj.idx ?? 0, rounds);
  const finished = idx >= rounds || deck.length === 0;
  const round = finished ? null : deck[idx];
  const checked = finished ? false : isChecked(mo, idx);
  const answer = finished ? "" : readAnswer(mo, idx);
  const correct = !!round && checked && isRoundCorrect(round, answer);
  const typing = obj.difficulty === "type";

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

  const inputRef = useRef<HTMLInputElement | null>(null);
  const played = useRef(false);
  const fresh = (): GapObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as GapObj | undefined;

  function commit(value: string) {
    if (!round || value.trim() === "") return;
    played.current = true;
    updateWidgetState(obj.id, { ...setAnswerPatch(idx, value), ...checkPatch(idx) });
    bumpFx(isRoundCorrect(round, value) ? "ok" : "no");
    track("tool_action", { tool: "langgaps", action: "check" });
  }
  function pick(option: string) {
    commit(option);
  }
  function clearRound() {
    updateWidgetState(obj.id, retryPatch(idx));
    setFx(null);
  }
  function next() {
    setFx(null);
    played.current = true;
    updateWidgetState(obj.id, nextPatch(fresh() ?? mo));
    track("tool_action", { tool: "langgaps", action: "next" });
  }
  function newGame() {
    setFx(null);
    updateWidgetState(obj.id, newDeckPatch(fresh() ?? mo));
    track("tool_action", { tool: "langgaps", action: "new" });
  }
  function replay() {
    setFx(null);
    updateWidgetState(obj.id, replayPatch(fresh() ?? mo));
    track("tool_action", { tool: "langgaps", action: "replay" });
  }

  // Focus the input on a fresh typing round once play has begun.
  useEffect(() => {
    if (typing && played.current && !finished && !checked) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [idx, obj.round, typing, finished, checked]);

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, .gp-scroll")) return;
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

  const banner = BANNERS[idx % BANNERS.length];
  const bannerBg = `linear-gradient(150deg, ${banner[0]} 0%, ${banner[1]} 100%)`;

  // Type-mode local input value (uncontrolled by store until Check).
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [idx, obj.round]);
  const blankShown = checked ? answer : typing ? typed : answer;

  return (
    <div
      className={"igaps" + (fx?.kind === "ok" ? " happy" : fx?.kind === "no" ? " shake" : "")}
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="gp-head" style={{ height: HEAD_H + "px" }}>
        <span className="gp-title">{deckTitle(mo)}</span>
        <span className="gp-progress">{finished ? "Results" : `${idx + 1} / ${rounds}`}</span>
        <button className="gp-new" title="New game" onClick={newGame}>
          New
        </button>
      </div>

      {finished || !round ? (
        deck.length === 0 ? (
          <div className="lf-empty">No sentences yet for this set.</div>
        ) : (
          <Summary obj={mo} deck={deck} onReplay={replay} onNew={newGame} />
        )
      ) : (
        <div className="gp-scene" key={`${obj.round ?? 0}:${idx}`}>
          <div className="gp-prompt" style={{ background: bannerBg }}>
            {round.prompt}
          </div>

          {/* The learning sentence with the gap filled or blank. */}
          <div className="gp-sentence">
            {round.tokens.map((tok, i) => {
              if (i !== round.gapIndex) return <span key={i} className="gp-tok">{tok}</span>;
              const { lead, trail } = affixes(tok);
              const cls = checked ? (correct ? " ok" : " no") : blankShown ? " filled" : "";
              return (
                <span key={i} className="gp-tok">
                  {lead}
                  <span className={"gp-blank" + cls}>{blankShown || "____"}</span>
                  {trail}
                </span>
              );
            })}
          </div>

          {/* The input: word buttons (easy) or a text box (hard). */}
          {!checked && (
            <div className="gp-input">
              {typing ? (
                <div className="gp-typerow">
                  <input
                    ref={inputRef}
                    className="gp-type"
                    placeholder="type the word…"
                    autoComplete="off"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commit(typed);
                    }}
                  />
                  <button className="gp-check" onClick={() => commit(typed)}>
                    Check
                  </button>
                </div>
              ) : (
                <div className="gp-opts">
                  {round.options.map((op, i) => (
                    <button key={i} className="gp-opt" onClick={() => pick(op)}>
                      {op}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="gp-foot">
            {checked ? (
              <>
                <span className={"gp-result " + (correct ? "ok" : "no")}>
                  {correct ? "Correct! 🎉" : `Answer: ${round.answer}`}
                </span>
                {!correct && (
                  <button className="gp-retry" onClick={clearRound}>
                    Try again
                  </button>
                )}
                <button className="gp-next" onClick={next}>
                  {idx + 1 >= rounds ? "See results ▸" : "Next ▸"}
                </button>
              </>
            ) : (
              <span className="gp-hint">
                {typing ? "Type the missing word" : "Tap the missing word"}
              </span>
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
  obj: GapObj;
  deck: ReturnType<typeof deriveDeck>;
  onReplay: () => void;
  onNew: () => void;
}) {
  const scored = scoreDeck(obj, deck);
  const correct = scoreCount(scored);
  const total = scored.length;
  const v = verdict(correct, total);
  return (
    <div className="gp-summary">
      <div className="gp-score">
        <div className="gp-score-big">
          {correct} <span className="gp-score-of">/ {total}</span>
        </div>
        <div className="gp-score-sub">
          {v.emoji} {v.text}
        </div>
      </div>
      <div className="gp-scroll" onWheel={(e) => e.stopPropagation()}>
        {scored.map((s, i) => (
          <div className={"gp-srow" + (s.correct ? " ok" : " no")} key={i}>
            <span className="gp-srow-mk">{s.correct ? "✓" : "✗"}</span>
            <span className="gp-srow-a">{s.round.tokens.join(" ")}</span>
          </div>
        ))}
      </div>
      <div className="gp-summary-actions">
        <button className="gp-again" onClick={onReplay}>
          Play again
        </button>
        <button className="gp-newdeck" onClick={onNew}>
          New game
        </button>
      </div>
    </div>
  );
}
