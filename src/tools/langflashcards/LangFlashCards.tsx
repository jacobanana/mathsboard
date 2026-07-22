// WIDGET COMPONENT — vocabulary flash cards (reuses the .iflash flip-card look).
//
// One card runs a whole study session (see deck.ts). It reads its deck (derived
// deterministically from the params + `round`) and the learner's self-ratings
// (live widget-state) off `obj`, and writes back through updateWidgetState
// (INPUT_ORIGIN) — synced, persisted, undo-invisible, exactly like the maths
// flash cards. A big card shows a word; "Show answer" flips it to the
// translation; the learner taps "Knew it 👍" or "Practise 🔁" and it moves on.
// A summary at the end tallies how many were known. The card body is the drag
// handle (a press that isn't on a control moves the object).

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import {
  clampCount,
  deckTitle,
  deriveDeck,
  flipPatch,
  newDeckPatch,
  ratePatch,
  replayPatch,
  scoreCount,
  scoreDeck,
  verdict,
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

export function LangFlashCards({ obj }: WidgetProps<LangFlashParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mo = obj as unknown as LangFlashObj;
  const deck = useMemo(
    () => deriveDeck(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.known, obj.learning, obj.categories, obj.category, obj.level, obj.direction, obj.count, obj.round],
  );
  const count = deck.length || clampCount(obj.count);

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
          <div className="lf-empty">No words yet for this topic.</div>
        ) : (
          <Summary obj={mo} deck={deck} onReplay={replay} onNew={newDeck} />
        )
      ) : (
        <div className="if-scene" style={{ height: sceneH + "px" }}>
          <div className="if-dealwrap" key={`${obj.round ?? 0}:${idx}`}>
            <div className={"if-flip" + (flipped ? " flipped" : "")}>
              {/* FRONT — the prompt word */}
              <div className="if-face if-front" style={{ background: frontBg }}>
                {obj.easy && card?.emoji && <div className="lf-emoji">{card.emoji}</div>}
                <div className="if-q lf-word">{card?.front}</div>
                <button className="if-check" onClick={flip}>
                  Show answer
                </button>
              </div>

              {/* BACK — the translation + self-rating */}
              <div className="if-face if-back">
                {obj.easy && card?.emoji && <div className="lf-emoji">{card.emoji}</div>}
                <div className="if-truth lf-word">{card?.back}</div>
                <div className="lf-rate">
                  <button className="lf-btn practise" onClick={() => rate(false)}>
                    🔁 Practise
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

/** The end-of-deck review: how many were known, then every word. */
function Summary({
  obj,
  deck,
  onReplay,
  onNew,
}: {
  obj: LangFlashObj;
  deck: ReturnType<typeof deriveDeck>;
  onReplay: () => void;
  onNew: () => void;
}) {
  const scored = scoreDeck(obj, deck);
  const known = scoreCount(scored);
  const total = scored.length;
  const v = verdict(known, total);
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
            <span className="if-srow-mk">{s.knew ? "👍" : "🔁"}</span>
            <span className="if-srow-a">{s.card.front}</span>
            <span className="if-srow-c lf-srow-c">{s.card.back}</span>
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
