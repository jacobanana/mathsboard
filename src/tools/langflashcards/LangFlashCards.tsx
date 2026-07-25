// WIDGET COMPONENT — vocabulary flash cards (reuses the .iflash flip-card look).
//
// One card runs a whole study session (see deck.ts). It reads its deck (derived
// deterministically from the params + `round`) and the learner's self-ratings
// (live widget-state) off `obj`, and writes back through updateWidgetState
// (INPUT_ORIGIN) — synced, persisted, undo-invisible, exactly like the maths
// flash cards. A big card shows a word; "Show answer" flips it to the
// translation (a round flip button sits in the corner of BOTH faces, so the card
// can always be turned over — and back); the learner taps "👍 Knew it" or
// "❌ Didn't know" and it moves on. A summary at the end tallies how many were
// known, and offers to COLLECT the ones they didn't know into a practice-set
// deck of their own (see the practice-set section of deck.ts) — a set that
// shrinks again as they're learned. The card body is the drag handle (a press
// that isn't on a control moves the object).

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { placeObject } from "@/board/commands";
import { track } from "@/analytics";
import { SpokenWord } from "@/lang/SpokenWord";
import {
  customWords,
  deckTitle,
  deriveDeck,
  flipPatch,
  isPractice,
  knownPairs,
  mergePairs,
  missedPairs,
  newDeckPatch,
  newToSet,
  ratePatch,
  removePairs,
  replayPatch,
  resetSessionPatch,
  scoreCount,
  scoreDeck,
  verdict,
  type CustomPair,
  type LangFlashObj,
} from "@/tools/langflashcards/deck";
import type { LangFlashParams } from "@/tools/langflashcards";

/** Header strip height (px) — the rest of the card is the flip scene. */
const HEAD_H = 40;

/** Vibrant front-face gradients, cycled per card (shared with the maths deck). */
const FRONTS: [string, string][] = [
  ["#6D5EF6", "#8B7BF9"],
  ["#0D9488", "#14B8A6"],
  ["#DB2777", "#EC4899"],
  ["#2563EB", "#38BDF8"],
  ["#7C3AED", "#A855F7"],
  ["#EA580C", "#FB923C"],
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A crisp "flip the card over" glyph (two curved arrows around a card). */
function FlipIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path
        d="M4 8a8 8 0 0 1 14-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M18.5 2.5V6H15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M20 16a8 8 0 0 1-14 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5.5 21.5V18H9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The turn-the-card control. One sits in the corner of EACH face — never in the
 *  flexible word block — so a flip is always one tap away and always visible,
 *  whichever side is showing and however long the word is. */
function FlipButton({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button className="lf-turn" title={label} aria-label={label} onClick={onClick}>
      <FlipIcon />
    </button>
  );
}

export function LangFlashCards({ obj }: WidgetProps<LangFlashParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const updateObject = useBoardStore((s) => s.updateObject);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mo = obj as unknown as LangFlashObj;
  const deck = useMemo(
    () => deriveDeck(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.known, obj.learning, obj.categories, obj.category, obj.level, obj.direction, obj.round],
  );
  const count = deck.length;

  const idx = Math.min(obj.idx ?? 0, count);
  const finished = idx >= count || deck.length === 0;
  const flipped = !!obj.flipped;
  const card = finished ? null : deck[idx];

  // --- layout: everything derives from the box, so the card resizes cleanly ---
  const W = obj.w;
  const sceneH = obj.h - HEAD_H;
  const cardW = W - 24;
  const cardH = sceneH - 24;
  // Words can be longer than a number, so scale a touch smaller and let them wrap.
  const qFont = Math.round(clamp(Math.min(cardW * 0.14, cardH * 0.24), 20, 46));
  const rootVars = { "--ifq": qFont + "px" } as React.CSSProperties;

  // --- transient bounce / shake of the whole card ---------------------------
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

  const fresh = (): LangFlashObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as
      | LangFlashObj
      | undefined;

  function flip() {
    const m = fresh();
    if (!m || m.flipped) return;
    updateWidgetState(obj.id, flipPatch());
    track("tool_action", { tool: "langflashcards", action: "flip" });
  }

  /** Turn the card back to its prompt side (peek at the first side again). */
  function flipBack() {
    const m = fresh();
    if (!m || !m.flipped) return;
    updateWidgetState(obj.id, { flipped: false });
    track("tool_action", { tool: "langflashcards", action: "flip-back" });
  }

  function rate(knew: boolean) {
    const m = fresh() ?? mo;
    const i = Math.min(m.idx ?? 0, count);
    updateWidgetState(obj.id, ratePatch(i, knew));
    bumpFx(knew ? "ok" : "no");
    track("tool_action", { tool: "langflashcards", action: knew ? "knew" : "practise" });
  }

  function newDeck() {
    setFx(null);
    updateWidgetState(obj.id, newDeckPatch(fresh() ?? mo));
    track("tool_action", { tool: "langflashcards", action: "new" });
  }

  function replay() {
    setFx(null);
    updateWidgetState(obj.id, replayPatch(fresh() ?? mo));
    track("tool_action", { tool: "langflashcards", action: "replay" });
  }

  // --- the practice set ------------------------------------------------------
  //
  // Collecting hands the run's "didn't know" words to THE practice deck for
  // this language pair: the one already on the board if there is one (merged
  // into, so a second collection never duplicates a word or the card itself),
  // otherwise a fresh deck placed like any other widget. Its word list is an
  // ordinary param, so the change is undoable — unlike the run state around it.
  function addToPractice(pairs: CustomPair[]) {
    if (pairs.length === 0) return;
    const st = useBoardStore.getState();
    const set = st.board.objects.find(
      (o) =>
        o.type === "langflashcards" &&
        o.practice === true &&
        o.known === obj.known &&
        o.learning === obj.learning,
    ) as LangFlashObj | undefined;
    if (set) {
      const words = customWords(set);
      const merged = mergePairs(words, pairs);
      if (merged.length > words.length) {
        st.updateObject(set.id, { custom: merged });
        // The deck re-derives (and reshuffles) from the new word list, so the
        // old position and ratings no longer line up — start it clean.
        st.updateWidgetState(set.id, resetSessionPatch(set));
      }
      // Point at the set that just grew, so it's obvious where the words went.
      st.setSelection({ objectIds: [set.id], strokeIds: [] });
    } else {
      placeObject("langflashcards", {
        known: obj.known,
        learning: obj.learning,
        categories: [],
        category: "custom",
        level: "mixed",
        direction: obj.direction,
        easy: obj.easy,
        custom: pairs,
        practice: true,
      });
    }
    track("tool_action", { tool: "langflashcards", action: "practice-add" });
  }

  /** Retire the words this practice run got right — the set shrinks as they
   *  stick, and the next run drills only what's left. */
  function removeFromPractice(pairs: CustomPair[]) {
    if (pairs.length === 0) return;
    const m = fresh() ?? mo;
    updateObject(obj.id, { custom: removePairs(customWords(m), pairs) });
    updateWidgetState(obj.id, resetSessionPatch(m));
    track("tool_action", { tool: "langflashcards", action: "practice-remove" });
  }

  // --- card drag (a press that isn't on a control moves the object) ----------
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, .if-scroll")) return;
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

  // --- render ----------------------------------------------------------------
  const front = FRONTS[idx % FRONTS.length];
  const frontBg = `linear-gradient(150deg, ${front[0]} 0%, ${front[1]} 100%)`;
  // Which language each face is in, so 🔊 speaks it in the right voice.
  const knownFirst = obj.direction === "known-first";
  const frontCode = knownFirst ? obj.known : obj.learning;
  const backCode = knownFirst ? obj.learning : obj.known;

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
        deck.length === 0 ? (
          <div className="lf-empty">
            {isPractice(mo)
              ? "🎉 Nothing left to practise — you knew them all!"
              : "No words yet for this topic."}
          </div>
        ) : (
          <Summary
            obj={mo}
            deck={deck}
            onReplay={replay}
            onNew={newDeck}
            onAddPractice={addToPractice}
            onRemovePractice={removeFromPractice}
          />
        )
      ) : (
        <div className="if-scene" style={{ height: sceneH + "px" }}>
          <div className="if-dealwrap" key={`${obj.round ?? 0}:${idx}`}>
            <div className={"if-flip" + (flipped ? " flipped" : "")}>
              {/* FRONT — the prompt word (tap it to hear it).
                  The word block is the flexible part (.lf-body) and the controls
                  sit outside it, so a long word or a small card can never push
                  the flip button off the card — it is ALWAYS reachable. */}
              <div className="if-face if-front" style={{ background: frontBg }}>
                <FlipButton label="Show the answer" onClick={flip} />
                <div className="lf-body">
                  {obj.easy && card?.emoji && <div className="lf-emoji">{card.emoji}</div>}
                  <SpokenWord
                    text={card?.front ?? ""}
                    code={frontCode}
                    className="if-q lf-word"
                  />
                  {card?.frontPhonetic && <div className="lf-phon">{card.frontPhonetic}</div>}
                </div>
                <button className="if-check lf-flipbtn" onClick={flip}>
                  Show answer
                </button>
              </div>

              {/* BACK — the translation (tap to hear) + self-rating */}
              <div className="if-face if-back">
                <FlipButton label="See the first side again" onClick={flipBack} />
                <div className="lf-body">
                  {obj.easy && card?.emoji && <div className="lf-emoji">{card.emoji}</div>}
                  <SpokenWord
                    text={card?.back ?? ""}
                    code={backCode}
                    className="if-truth lf-word"
                  />
                  {card?.backPhonetic && <div className="lf-phon">{card.backPhonetic}</div>}
                </div>
                <div className="lf-rate">
                  <button className="lf-btn missed" onClick={() => rate(false)}>
                    ❌ Didn't know
                  </button>
                  <button className="lf-btn knew" onClick={() => rate(true)}>
                    👍 Knew it
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The end-of-deck review: how many were known, then every word — plus the one
 *  action that carries the run forward. On a topic (or My words) deck that's
 *  "Add to practice set" (the words rated "Didn't know"); on the practice set
 *  itself it's retiring the words that have stuck. */
function Summary({
  obj,
  deck,
  onReplay,
  onNew,
  onAddPractice,
  onRemovePractice,
}: {
  obj: LangFlashObj;
  deck: ReturnType<typeof deriveDeck>;
  onReplay: () => void;
  onNew: () => void;
  onAddPractice: (pairs: CustomPair[]) => void;
  onRemovePractice: (pairs: CustomPair[]) => void;
}) {
  const scored = scoreDeck(obj, deck);
  const known = scoreCount(scored);
  const total = scored.length;
  const v = verdict(known, total);
  const practice = isPractice(obj);
  const missed = missedPairs(obj, deck);
  const learned = knownPairs(obj, deck);
  // How many of this run's misses aren't in the set yet (a repeat run of the
  // same deck shouldn't offer to add words that are already waiting there).
  const board = useBoardStore((s) => s.board.objects);
  const set = practice
    ? undefined
    : (board.find(
        (o) =>
          o.type === "langflashcards" &&
          o.practice === true &&
          o.known === obj.known &&
          o.learning === obj.learning,
      ) as LangFlashObj | undefined);
  const toAdd = practice ? 0 : newToSet(set ? customWords(set) : [], missed);
  return (
    <div className="if-summary">
      <div className="if-score">
        <div className="if-score-big">
          {known} <span className="if-score-of">/ {total}</span>
        </div>
        <div className="if-score-sub">
          {v.emoji} {v.text}
        </div>
      </div>
      <div className="if-scroll" onWheel={(e) => e.stopPropagation()}>
        {scored.map((s, i) => (
          <div className={"if-srow" + (s.knew ? " ok" : " no")} key={i}>
            <span className="if-srow-mk">{s.knew ? "👍" : "❌"}</span>
            <span className="if-srow-a">{s.card.front}</span>
            <span className="if-srow-c lf-srow-c">{s.card.back}</span>
          </div>
        ))}
      </div>
      {/* Always there at the end of a normal run — the words you didn't know go
          to the practice set with one tap. It stays on show (disabled, saying
          why) when there is nothing left to add, so the action is where the
          learner expects it every time rather than appearing only sometimes. */}
      {!practice && (
        <button
          className="lf-collect"
          disabled={toAdd === 0}
          title="Collect the words you didn't know into your practice set"
          onClick={() => onAddPractice(missed)}
        >
          {missed.length === 0
            ? "🎉 Nothing to add — you knew them all"
            : toAdd === 0
              ? `✓ ${missed.length === 1 ? "It's" : "They're"} in your practice set`
              : `➕ Add ${toAdd} to practice set`}
        </button>
      )}
      {practice && learned.length > 0 && (
        <button className="lf-prune" onClick={() => onRemovePractice(learned)}>
          ✅ Remove the {learned.length} {learned.length === 1 ? "word" : "words"} I knew
        </button>
      )}
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
