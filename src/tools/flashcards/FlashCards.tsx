// WIDGET COMPONENT — the .iflash overlay: a colourful flip-card game.
//
// One card runs a whole session (see cards.ts). It reads its deck (derived
// deterministically from the params + the `round` counter) and the student's
// response (live widget-state) straight off `obj`, and writes back through
// updateWidgetState (INPUT_ORIGIN) — so the typed answers, the current card and
// the flip all sync to collaborators and persist, but Ctrl+Z never reverts
// them, exactly like the dice roll and the worksheet's answers.
//
// A big 3D card shows ONE question. Typing an answer and pressing Check (or
// Enter, or letting the optional per-card timer run out) FLIPS the card to a
// green ✓ / red ✗ side that reveals the right answer, with a confetti burst or a
// shake. Whether right or wrong, Next moves on; after the last card a summary
// lists every question, answer and result. The card body is the drag handle
// (a press that isn't on a control moves the object).

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { startWidgetCardDrag } from "@/tools/widgetDrag";
import { track } from "@/analytics";
import {
  ansField,
  cardText,
  clampCount,
  deckTitle,
  deriveDeck,
  flipPatch,
  isCorrect,
  newDeckPatch,
  nextPatch,
  readAnswer,
  replayPatch,
  scoreCount,
  scoreDeck,
  verdict,
  type FlashObj,
} from "@/tools/flashcards/cards";
import type { FlashCardsParams } from "@/tools/flashcards";

/** Header strip height (px) — the rest of the card is the flip scene. */
const HEAD_H = 40;

/** Vibrant front-face gradients, cycled per card so the deck feels lively.
 *  All read with white text (a soft shadow guarantees contrast). */
const FRONTS: [string, string][] = [
  ["#6D5EF6", "#8B7BF9"], // violet
  ["#0D9488", "#14B8A6"], // teal
  ["#DB2777", "#EC4899"], // pink
  ["#2563EB", "#38BDF8"], // blue
  ["#7C3AED", "#A855F7"], // purple
  ["#EA580C", "#FB923C"], // orange
];

/** Emoji that burst out on a correct answer (reused from the Money mat). */
const CONFETTI = ["🎉", "⭐", "✨", "🎊", "🥳", "⭐", "✨", "🎉"];
function confettiStyle(i: number): React.CSSProperties {
  const a = (i / CONFETTI.length) * 2 * Math.PI;
  return {
    "--tx": Math.cos(a) * 92 + "px",
    "--ty": Math.sin(a) * 92 + "px",
  } as React.CSSProperties;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function FlashCards({ obj }: WidgetProps<FlashCardsParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);

  const mo = obj as unknown as FlashObj;
  const count = clampCount(obj.count);
  const deck = useMemo(
    () => deriveDeck(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.mode, obj.level, obj.table, obj.count, obj.round],
  );

  const idx = Math.min(obj.idx ?? 0, count);
  const finished = idx >= count;
  const flipped = !!obj.flipped;
  const card = finished ? null : deck[idx];
  const answer = finished ? "" : readAnswer(mo, idx);
  const correct = !!card && flipped && isCorrect(card, answer);
  const timerOn = (obj.seconds ?? 0) > 0;

  // --- layout: everything derives from the box, so the card resizes cleanly ---
  const W = obj.w;
  const sceneH = obj.h - HEAD_H;
  const cardW = W - 24;
  const cardH = sceneH - 24;
  const qFont = Math.round(clamp(Math.min(cardW * 0.17, cardH * 0.28), 22, 60));
  const badgeFont = Math.round(clamp(Math.min(cardW * 0.34, cardH * 0.4), 40, 128));
  const rootVars = {
    "--ifq": qFont + "px",
    "--ifbadge": badgeFont + "px",
  } as React.CSSProperties;

  // --- transient bounce / shake of the whole card on a check (like the mat) ---
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

  // --- helpers ---------------------------------------------------------------
  const fresh = (): FlashObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as
      | FlashObj
      | undefined;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  // Only steal focus once the pupil has started playing (so merely placing the
  // card, or a collaborator watching, never yanks the page's focus).
  const played = useRef(false);

  function setAnswer(v: string) {
    updateWidgetState(obj.id, { [ansField(idx)]: v });
  }

  // Turn the current card to its answer side. Reads FRESH state so a timer tick
  // and a click can't double-flip, and so the celebration matches what's stored.
  function commit() {
    const m = fresh();
    if (!m || m.flipped) return;
    const fidx = m.idx ?? 0;
    const fcard = deriveDeck(m)[fidx];
    if (!fcard) return;
    const ok = isCorrect(fcard, readAnswer(m, fidx));
    updateWidgetState(obj.id, flipPatch());
    bumpFx(ok ? "ok" : "no");
    track("tool_action", { tool: "flashcards", action: "check" });
  }
  // The per-card timer's rAF calls the LATEST commit without re-arming itself.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  function next() {
    played.current = true;
    const m = fresh() ?? mo;
    updateWidgetState(obj.id, nextPatch(m));
    track("tool_action", { tool: "flashcards", action: "next" });
  }

  function newDeck() {
    played.current = true;
    setFx(null);
    const m = fresh() ?? mo;
    updateWidgetState(obj.id, newDeckPatch(m));
    track("tool_action", { tool: "flashcards", action: "new" });
  }

  function replay() {
    played.current = true;
    setFx(null);
    const m = fresh() ?? mo;
    updateWidgetState(obj.id, replayPatch(m));
    track("tool_action", { tool: "flashcards", action: "replay" });
  }

  // --- per-card countdown (optional) -----------------------------------------
  // Local to each client and driven by rAF straight onto the bar/label refs (no
  // per-frame React re-render). Restarts on every new front-facing card; on zero
  // it commits, exactly as a Check would. Because commit reads shared state,
  // whoever's timer fires first flips the card for everyone.
  const barRef = useRef<HTMLDivElement | null>(null);
  const secRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!timerOn || flipped || finished) return;
    const secs = obj.seconds ?? 0;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const remain = Math.max(0, secs - (performance.now() - start) / 1000);
      const frac = secs > 0 ? remain / secs : 0;
      if (barRef.current) barRef.current.style.width = frac * 100 + "%";
      if (secRef.current) {
        secRef.current.textContent = Math.ceil(remain) + "s";
        secRef.current.classList.toggle("urgent", remain <= 3);
      }
      if (remain <= 0) {
        commitRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerOn, obj.seconds, flipped, finished, idx, obj.round]);

  // --- keyboard focus flow: type → Enter → flip → Enter → next ---------------
  useEffect(() => {
    if (!played.current || finished) return;
    const el = flipped ? nextRef.current : inputRef.current;
    el?.focus({ preventScroll: true });
  }, [idx, obj.round, flipped, finished]);

  // --- card drag (a press that isn't on a control acts like a canvas object) -
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, select, textarea, .if-scroll"))
      return;
    startWidgetCardDrag(e, obj.id, { x: obj.x, y: obj.y });
  }

  // --- render ----------------------------------------------------------------
  const front = FRONTS[idx % FRONTS.length];
  const frontBg = `linear-gradient(150deg, ${front[0]} 0%, ${front[1]} 100%)`;

  return (
    <div
      className={"iflash" + (fx?.kind === "ok" ? " happy" : fx?.kind === "no" ? " shake" : "")}
      data-id={obj.id}
      style={{ width: W + "px", height: obj.h + "px", ...rootVars }}
      onPointerDown={onCardPointerDown}
    >
      <div className="if-head" style={{ height: HEAD_H + "px" }}>
        <span className="if-title">{deckTitle(mo)}</span>
        <span className="if-progress">
          {finished ? "Results" : `${idx + 1} / ${count}`}
        </span>
        <button className="if-new" title="New deck" onClick={newDeck}>
          New
        </button>
      </div>

      {finished ? (
        <Summary obj={mo} deck={deck} onReplay={replay} onNew={newDeck} />
      ) : (
        <div className="if-scene" style={{ height: sceneH + "px" }}>
          {/* The deal-in fade lives on this wrapper, NOT on the flip element:
              an opacity < 1 would force transform-style back to `flat` and the
              flip would show a mirrored front instead of the back. */}
          <div className="if-dealwrap" key={`${obj.round ?? 0}:${idx}`}>
            <div
              className={"if-flip" + (flipped ? " flipped" : "") + (correct ? " ok" : flipped ? " no" : "")}
            >
              {/* FRONT — the question + the answer input */}
            <div className="if-face if-front" style={{ background: frontBg }}>
              {timerOn && (
                <div className="if-timer">
                  <div className="if-timer-track">
                    <div className="if-timer-bar" ref={barRef} />
                  </div>
                  <span className="if-timer-secs" ref={secRef}>
                    {obj.seconds}s
                  </span>
                </div>
              )}
              <div className="if-q">{card && cardText(card)}</div>
              <div className="if-ansrow">
                <span className="if-eq">=</span>
                <input
                  ref={inputRef}
                  className="if-input"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="?"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commit();
                  }}
                />
                <button className="if-check" onClick={commit}>
                  Check
                </button>
              </div>
            </div>

            {/* BACK — the result, revealed by the flip */}
            <div className="if-face if-back">
              <span className="if-badge">{correct ? "✓" : "✗"}</span>
              <div className="if-truth">{card && `${cardText(card)} = ${card.ans}`}</div>
              <div className="if-yours">
                {correct
                  ? "Correct!"
                  : `You said ${answer.trim() === "" ? "—" : answer.trim()}`}
              </div>
              <button
                className="if-next"
                ref={nextRef}
                onClick={next}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") next();
                }}
              >
                {idx + 1 >= count ? "See results ▸" : "Next ▸"}
              </button>
              {correct &&
                CONFETTI.map((emoji, i) => (
                  <span key={i} className="if-confetti" style={confettiStyle(i)}>
                    {emoji}
                  </span>
                ))}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The end-of-deck review: a score, then every question with its answer/result. */
function Summary({
  obj,
  deck,
  onReplay,
  onNew,
}: {
  obj: FlashObj;
  deck: ReturnType<typeof deriveDeck>;
  onReplay: () => void;
  onNew: () => void;
}) {
  const scored = scoreDeck(obj, deck);
  const correct = scoreCount(scored);
  const total = scored.length;
  const v = verdict(correct, total);
  return (
    <div className="if-summary">
      <div className="if-score">
        <div className="if-score-big">
          {correct} <span className="if-score-of">/ {total}</span>
        </div>
        <div className="if-score-sub">
          {v.emoji} {v.text}
        </div>
      </div>
      <div className="if-scroll" onWheel={(e) => e.stopPropagation()}>
        {scored.map((s, i) => (
          <div className={"if-srow" + (s.correct ? " ok" : " no")} key={i}>
            <span className="if-srow-mk">{s.correct ? "✓" : "✗"}</span>
            <span className="if-srow-q">{cardText(s.card)} =</span>
            <span className="if-srow-a">{s.answer.trim() === "" ? "—" : s.answer.trim()}</span>
            {!s.correct && <span className="if-srow-c">{s.card.ans}</span>}
          </div>
        ))}
      </div>
      <div className="if-summary-actions">
        <button className="if-again" onClick={onReplay}>
          Play again
        </button>
        <button className="if-newdeck" onClick={onNew}>
          New deck
        </button>
      </div>
    </div>
  );
}
