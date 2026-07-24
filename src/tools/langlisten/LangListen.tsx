// WIDGET COMPONENT — the .ilisten overlay: hear a word, tap what you heard.
//
// One widget runs a session (see listen.ts). Each round SPEAKS a word in the
// learning language and offers a few picture/word choices; the learner taps the
// one they heard. The spoken word is the only clue — its spelling stays hidden
// until the answer is checked, so this genuinely trains listening. A big 🔊
// button replays the word (and it auto-plays each new round). Answers are live
// widget-state (`la:<i>` / checked `lc:<i>` via updateWidgetState — synced,
// persisted, undo-invisible). The card body is the drag handle.

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import { SpeakButton } from "@/lang/SpeakButton";
import { speak } from "@/lang/speech";
import { useVoiceStore } from "@/lang/voiceStore";
import {
  answerOption,
  checkPatch,
  clampRounds,
  deckTitle,
  deriveDeck,
  isChecked,
  isRoundCorrect,
  newDeckPatch,
  nextPatch,
  normalize,
  readAnswer,
  replayPatch,
  retryPatch,
  scoreCount,
  scoreDeck,
  setAnswerPatch,
  verdict,
  type ListenObj,
  type ListenRound,
} from "@/tools/langlisten/listen";
import type { LangListenParams } from "@/tools/langlisten";

const HEAD_H = 40;

export function LangListen({ obj }: WidgetProps<LangListenParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);
  const voiceOn = useVoiceStore((s) => s.enabled);

  const mo = obj as unknown as ListenObj;
  const deck = useMemo(
    () => deriveDeck(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.categories, obj.category, obj.level, obj.known, obj.learning, obj.rounds, obj.round],
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

  const say = () => {
    if (round) speak(round.spoken, obj.learning);
  };
  // Auto-play the word when a fresh, unanswered round appears (respecting the
  // master voice toggle). Replay is always available via the 🔊 button below.
  const spokenKey = `${obj.round ?? 0}:${idx}`;
  useEffect(() => {
    if (voiceOn && round && !checked) speak(round.spoken, obj.learning);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenKey]);

  const fresh = (): ListenObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as ListenObj | undefined;

  function pick(word: string) {
    if (!round || checked) return;
    updateWidgetState(obj.id, { ...setAnswerPatch(idx, word), ...checkPatch(idx) });
    bumpFx(isRoundCorrect(round, word) ? "ok" : "no");
    track("tool_action", { tool: "langlisten", action: "check" });
  }
  function retry() {
    updateWidgetState(obj.id, retryPatch(idx));
    setFx(null);
    say();
  }
  function next() {
    setFx(null);
    updateWidgetState(obj.id, nextPatch(fresh() ?? mo));
    track("tool_action", { tool: "langlisten", action: "next" });
  }
  function newGame() {
    setFx(null);
    updateWidgetState(obj.id, newDeckPatch(fresh() ?? mo));
    track("tool_action", { tool: "langlisten", action: "new" });
  }
  function replay() {
    setFx(null);
    updateWidgetState(obj.id, replayPatch(fresh() ?? mo));
    track("tool_action", { tool: "langlisten", action: "replay" });
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

  const ans = round ? answerOption(round) : undefined;

  return (
    <div
      className={"ilisten" + (fx?.kind === "ok" ? " happy" : fx?.kind === "no" ? " shake" : "")}
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="ls-head" style={{ height: HEAD_H + "px" }}>
        <span className="ls-title">{deckTitle(mo)}</span>
        <span className="ls-progress">{finished ? "Results" : `${idx + 1} / ${rounds}`}</span>
        <button className="ls-new" title="New game" onClick={newGame}>
          New
        </button>
      </div>

      {finished || !round ? (
        deck.length === 0 ? (
          <div className="lf-empty">No words yet for this topic.</div>
        ) : (
          <Summary obj={mo} deck={deck} onReplay={replay} onNew={newGame} />
        )
      ) : (
        <div className="ls-scene" key={spokenKey}>
          <div className="ls-playrow">
            <button className="ls-play" onClick={say} title="Play the word" aria-label="Play the word">
              🔊
            </button>
            <span className="ls-prompt">
              {checked ? (
                <span className={"ls-word " + (correct ? "ok" : "no")}>{round.spoken}</span>
              ) : (
                "Listen, then tap what you heard"
              )}
            </span>
          </div>

          <div className="ls-opts">
            {round.options.map((op, i) => {
              const isAnswer = normalize(op.learning) === normalize(round.spoken);
              const isChosen = checked && normalize(op.learning) === normalize(answer);
              const cls =
                "ls-opt" +
                (checked && isAnswer ? " ok" : "") +
                (checked && isChosen && !isAnswer ? " no" : "") +
                (checked && !isAnswer && !isChosen ? " dim" : "");
              return (
                <button key={i} className={cls} disabled={checked} onClick={() => pick(op.learning)}>
                  {op.emoji && <span className="ls-opt-emoji">{op.emoji}</span>}
                  <span className="ls-opt-word">{op.known}</span>
                </button>
              );
            })}
          </div>

          <div className="ls-foot">
            {checked ? (
              <>
                <span className={"ls-result " + (correct ? "ok" : "no")}>
                  {correct ? "Correct! 🎉" : ans ? `It was ${ans.known}` : "Not quite"}
                </span>
                <SpeakButton text={round.spoken} code={obj.learning} title="Hear it again" />
                {!correct && (
                  <button className="ls-retry" onClick={retry}>
                    Try again
                  </button>
                )}
                <button className="ls-next" onClick={next}>
                  {idx + 1 >= rounds ? "See results ▸" : "Next ▸"}
                </button>
              </>
            ) : (
              <span className="ls-hint">Tap 🔊 to hear it again</span>
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
  obj: ListenObj;
  deck: ListenRound[];
  onReplay: () => void;
  onNew: () => void;
}) {
  const scored = scoreDeck(obj, deck);
  const correct = scoreCount(scored);
  const total = scored.length;
  const v = verdict(correct, total);
  return (
    <div className="ls-summary">
      <div className="ls-score">
        <div className="ls-score-big">
          {correct} <span className="ls-score-of">/ {total}</span>
        </div>
        <div className="ls-score-sub">
          {v.emoji} {v.text}
        </div>
      </div>
      <div className="ls-scroll pp-scroll" onWheel={(e) => e.stopPropagation()}>
        {scored.map((s, i) => {
          const a = answerOption(s.round);
          return (
            <div className={"ls-srow" + (s.correct ? " ok" : " no")} key={i}>
              <span className="ls-srow-mk">{s.correct ? "✓" : "✗"}</span>
              <span className="ls-srow-a">
                {a?.emoji ? a.emoji + " " : ""}
                {s.round.spoken} — {a?.known ?? ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className="ls-summary-actions">
        <button className="ls-again" onClick={onReplay}>
          Play again
        </button>
        <button className="ls-newdeck" onClick={onNew}>
          New game
        </button>
      </div>
    </div>
  );
}
