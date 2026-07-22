// WIDGET COMPONENT — the .isent overlay: build a sentence from scrambled words.
//
// One widget runs a whole session (see builder.ts). It reads its rounds (derived
// from the params + `round`) and the learner's tapped chain (live widget-state)
// off `obj`, writing back through updateWidgetState (INPUT_ORIGIN) — synced,
// persisted, undo-invisible, like the number-order game it borrows its shape
// from. Each round shows a sentence in the known language and the scrambled
// words of its translation; tap the words in order to rebuild it (tap a word
// again to take it back), and it checks once every word is placed. The card body
// is the drag handle (a press that isn't on a tile or button moves the object).

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import {
  applyTap,
  builtWords,
  clampRounds,
  deckTitle,
  deriveDeck,
  isChecked,
  newDeckPatch,
  nextPatch,
  readChain,
  replayPatch,
  retryPatch,
  roundCorrect,
  scoreCount,
  scoreDeck,
  tapStatePatch,
  verdict,
  type SentenceObj,
} from "@/tools/langsentence/builder";
import type { LangSentenceParams } from "@/tools/langsentence";

const HEAD_H = 40;

const BANNERS: [string, string][] = [
  ["#6D5EF6", "#8B7BF9"],
  ["#0D9488", "#14B8A6"],
  ["#DB2777", "#EC4899"],
  ["#2563EB", "#38BDF8"],
  ["#7C3AED", "#A855F7"],
  ["#EA580C", "#FB923C"],
];

export function LangSentence({ obj }: WidgetProps<LangSentenceParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mo = obj as unknown as SentenceObj;
  const deck = useMemo(
    () => deriveDeck(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.category, obj.level, obj.known, obj.learning, obj.rounds, obj.round],
  );
  const rounds = deck.length || clampRounds(obj.rounds);

  const idx = Math.min(obj.idx ?? 0, rounds);
  const finished = idx >= rounds || deck.length === 0;
  const round = finished ? null : deck[idx];
  const chain = finished ? [] : readChain(mo, idx);
  const checked = finished ? false : isChecked(mo, idx);
  const correct = !!round && checked && roundCorrect(round, chain);

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

  const fresh = (): SentenceObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as
      | SentenceObj
      | undefined;

  function tap(j: number) {
    const m = fresh();
    if (!m) return;
    const fidx = Math.min(m.idx ?? 0, rounds);
    const fround = deriveDeck(m)[fidx];
    if (!fround) return;
    const out = applyTap(fround, readChain(m, fidx), isChecked(m, fidx), j);
    if (!out) return;
    updateWidgetState(obj.id, tapStatePatch(fidx, out));
    if (out.justChecked) bumpFx(out.correct ? "ok" : "no");
    track("tool_action", { tool: "langsentence", action: out.justChecked ? "check" : "tap" });
  }

  function clearRound() {
    setFx(null);
    updateWidgetState(obj.id, retryPatch(idx));
  }
  function next() {
    setFx(null);
    updateWidgetState(obj.id, nextPatch(fresh() ?? mo));
    track("tool_action", { tool: "langsentence", action: "next" });
  }
  function newGame() {
    setFx(null);
    updateWidgetState(obj.id, newDeckPatch(fresh() ?? mo));
    track("tool_action", { tool: "langsentence", action: "new" });
  }
  function replay() {
    setFx(null);
    updateWidgetState(obj.id, replayPatch(fresh() ?? mo));
    track("tool_action", { tool: "langsentence", action: "replay" });
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, .sb-scroll")) return;
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
  const built = round ? builtWords(round, chain) : [];

  return (
    <div
      className={"isent" + (fx?.kind === "ok" ? " happy" : fx?.kind === "no" ? " shake" : "")}
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="sb-head" style={{ height: HEAD_H + "px" }}>
        <span className="sb-title">{deckTitle(mo)}</span>
        <span className="sb-progress">{finished ? "Results" : `${idx + 1} / ${rounds}`}</span>
        <button className="sb-new" title="New game" onClick={newGame}>
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
        <div className="sb-scene" key={`${obj.round ?? 0}:${idx}`}>
          <div className="sb-prompt" style={{ background: bannerBg }}>
            {round.prompt}
          </div>

          {/* The sentence being built — chips in order, coloured once checked. */}
          <div className="sb-answer">
            {built.length === 0 && !checked && (
              <span className="sb-answer-hint">Tap the words in order…</span>
            )}
            {chain.map((tileIdx, k) => {
              const ok = checked && round.answer[k] === round.tiles[tileIdx];
              const cls = checked ? (ok ? " ok" : " no") : "";
              return (
                <button
                  key={k}
                  className={"sb-chip" + cls}
                  disabled={checked}
                  onClick={() => tap(tileIdx)}
                >
                  {round.tiles[tileIdx]}
                </button>
              );
            })}
          </div>

          {/* The word bank — used words dim out. */}
          <div className="sb-bank">
            {round.tiles.map((w, j) => {
              const used = chain.includes(j);
              return (
                <button
                  key={j}
                  className={"sb-tile" + (used ? " used" : "")}
                  disabled={checked || used}
                  onClick={() => tap(j)}
                >
                  {w}
                </button>
              );
            })}
          </div>

          <div className="sb-foot">
            {checked ? (
              <>
                <span className={"sb-result " + (correct ? "ok" : "no")}>
                  {correct ? "Correct! 🎉" : "Not quite"}
                </span>
                {!correct && (
                  <button className="sb-retry" onClick={clearRound}>
                    Try again
                  </button>
                )}
                <button className="sb-next" onClick={next}>
                  {idx + 1 >= rounds ? "See results ▸" : "Next ▸"}
                </button>
              </>
            ) : (
              <>
                <span className="sb-hint">
                  {chain.length > 0 ? "Tap a word to take it back" : "Build the sentence"}
                </span>
                {chain.length > 0 && (
                  <button className="sb-clear" onClick={clearRound}>
                    Clear
                  </button>
                )}
              </>
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
  obj: SentenceObj;
  deck: ReturnType<typeof deriveDeck>;
  onReplay: () => void;
  onNew: () => void;
}) {
  const scored = scoreDeck(obj, deck);
  const correct = scoreCount(scored);
  const total = scored.length;
  const v = verdict(correct, total);
  return (
    <div className="sb-summary">
      <div className="sb-score">
        <div className="sb-score-big">
          {correct} <span className="sb-score-of">/ {total}</span>
        </div>
        <div className="sb-score-sub">
          {v.emoji} {v.text}
        </div>
      </div>
      <div className="sb-scroll" onWheel={(e) => e.stopPropagation()}>
        {scored.map((s, i) => (
          <div className={"sb-srow" + (s.correct ? " ok" : " no")} key={i}>
            <span className="sb-srow-mk">{s.correct ? "✓" : "✗"}</span>
            <span className="sb-srow-a">{s.round.answer.join(" ")}</span>
          </div>
        ))}
      </div>
      <div className="sb-summary-actions">
        <button className="sb-again" onClick={onReplay}>
          Play again
        </button>
        <button className="sb-newdeck" onClick={onNew}>
          New game
        </button>
      </div>
    </div>
  );
}
