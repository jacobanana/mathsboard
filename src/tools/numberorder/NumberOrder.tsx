// WIDGET COMPONENT — the .iorder overlay: a colourful number-ordering game.
//
// One widget runs a whole session (see order.ts). It reads its rounds (derived
// deterministically from the params + the `round` counter) and the student's
// response (live widget-state) straight off `obj`, and writes back through
// updateWidgetState (INPUT_ORIGIN) — so the tapped chain and the current round
// sync to collaborators and persist, but Ctrl+Z never reverts them, exactly
// like the flash cards and the dice roll.
//
// Each round shows a set of number tiles and an instruction. In a `pick` round
// the pupil taps ONE tile (the biggest / smallest) and it checks at once. In a
// `sort` round she taps the tiles in order to build a numbered CHAIN — tapping a
// tile again takes it back out to correct a mistake — and once every tile is in
// the chain it checks, with a green sweep + confetti or a shake. A summary at
// the end lists every round and whether it was right. The card body is the drag
// handle (a press that isn't on a tile or button moves the object).

import { useEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import {
  applyTap,
  deckTitle,
  deriveDeck,
  formatNum,
  goalPrompt,
  isChecked,
  isPickGoal,
  newDeckPatch,
  nextPatch,
  pickIndex,
  readChain,
  replayPatch,
  retryPatch,
  roundCorrect,
  roundText,
  scoreCount,
  scoreDeck,
  sortOrder,
  tapStatePatch,
  verdict,
  clampNums,
  clampRounds,
  type OrderObj,
  type OrderRound,
} from "@/tools/numberorder/order";
import type { NumberOrderParams } from "@/tools/numberorder";

/** Header strip height (px) — the rest of the card is the play area. */
const HEAD_H = 40;

/** Vibrant instruction-banner gradients, cycled per round so the game feels
 *  lively (the same palette the flash cards use for their card fronts). */
const BANNERS: [string, string][] = [
  ["#6D5EF6", "#8B7BF9"], // violet
  ["#0D9488", "#14B8A6"], // teal
  ["#DB2777", "#EC4899"], // pink
  ["#2563EB", "#38BDF8"], // blue
  ["#7C3AED", "#A855F7"], // purple
  ["#EA580C", "#FB923C"], // orange
];

/** Emoji that burst out on a correct answer (reused from the flash cards). */
const CONFETTI = ["🎉", "⭐", "✨", "🎊", "🥳", "⭐", "✨", "🎉"];
function confettiStyle(i: number): React.CSSProperties {
  const a = (i / CONFETTI.length) * 2 * Math.PI;
  return {
    "--tx": Math.cos(a) * 96 + "px",
    "--ty": Math.sin(a) * 96 + "px",
  } as React.CSSProperties;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function NumberOrder({ obj }: WidgetProps<NumberOrderParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mo = obj as unknown as OrderObj;
  const rounds = clampRounds(obj.rounds);
  const count = clampNums(obj.count);
  const deck = useMemo(
    () => deriveDeck(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.mode, obj.target, obj.level, obj.count, obj.rounds, obj.round],
  );

  const idx = Math.min(obj.idx ?? 0, rounds);
  const finished = idx >= rounds;
  const round = finished ? null : deck[idx];
  const chain = finished ? [] : readChain(mo, idx);
  const checked = finished ? false : isChecked(mo, idx);
  const correct = !!round && checked && roundCorrect(round, chain);

  // --- layout: everything derives from the box, so the card resizes cleanly ---
  const W = obj.w;
  const sceneH = obj.h - HEAD_H;
  // Tile WIDTH must fit the widest FORMATTED number (commas included), so the
  // hard level's seven-digit millions still tile into columns instead of
  // overflowing the card. We lay the tiles on an explicit column grid and size
  // the font to fit that column, rather than letting the text set the width.
  const maxDigits = round ? Math.max(...round.nums.map((n) => formatNum(n).length)) : 1;
  const GAP = 10;
  const BANNER_H = 44; // instruction banner
  const FOOT_H = 42; // hint / result row
  const cols = count <= 2 ? count : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  // Scene padding (12 each side) + the card's 1px border each side + a little
  // slack, so a full row of tiles never overflows by a pixel and wraps early.
  const innerW = W - 30;
  const tilesH = Math.max(80, sceneH - 24 - 24 - BANNER_H - FOOT_H); // pad + two 12px gaps
  const tileW = Math.round(clamp((innerW - GAP * (cols - 1)) / cols, 46, 300));
  const tileH = Math.round(clamp((tilesH - GAP * (rows - 1)) / rows, 44, 150));
  // ~0.62em per bold tabular digit/comma; fit to the narrower of width/height.
  const fontByW = (tileW - 22) / (maxDigits * 0.62);
  const fontByH = tileH * 0.52;
  const tileFont = Math.round(clamp(Math.min(fontByW, fontByH), 12, 52));
  const rootVars = {
    "--iotileW": tileW + "px",
    "--iotileH": tileH + "px",
    "--iogap": GAP + "px",
    "--iotilefont": tileFont + "px",
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
  const fresh = (): OrderObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as
      | OrderObj
      | undefined;

  const nextRef = useRef<HTMLButtonElement | null>(null);
  // Only steal focus once the pupil has started playing (so merely placing the
  // card, or a collaborator watching, never yanks the page's focus).
  const played = useRef(false);

  // Tap tile `j` in the current round. Reads FRESH state so two quick taps (or a
  // collaborator's tap) can't desync the chain, and so the celebration matches
  // what is actually stored.
  function tap(j: number) {
    played.current = true;
    const m = fresh();
    if (!m) return;
    const fidx = m.idx ?? 0;
    const froundArr = deriveDeck(m);
    const fround = froundArr[fidx];
    if (!fround) return;
    const out = applyTap(fround, readChain(m, fidx), isChecked(m, fidx), j);
    if (!out) return; // round is locked
    updateWidgetState(obj.id, tapStatePatch(fidx, out));
    if (out.justChecked) bumpFx(out.correct ? "ok" : "no");
    track("tool_action", { tool: "numberorder", action: out.justChecked ? "check" : "tap" });
  }

  function clearRound() {
    played.current = true;
    setFx(null);
    updateWidgetState(obj.id, retryPatch(idx));
  }

  function next() {
    played.current = true;
    setFx(null);
    const m = fresh() ?? mo;
    updateWidgetState(obj.id, nextPatch(m));
    track("tool_action", { tool: "numberorder", action: "next" });
  }

  function newGame() {
    played.current = true;
    setFx(null);
    const m = fresh() ?? mo;
    updateWidgetState(obj.id, newDeckPatch(m));
    track("tool_action", { tool: "numberorder", action: "new" });
  }

  function replay() {
    played.current = true;
    setFx(null);
    const m = fresh() ?? mo;
    updateWidgetState(obj.id, replayPatch(m));
    track("tool_action", { tool: "numberorder", action: "replay" });
  }

  // --- keyboard: once checked, move focus to Next so Enter advances ----------
  useEffect(() => {
    if (!played.current || finished || !checked) return;
    nextRef.current?.focus({ preventScroll: true });
  }, [idx, obj.round, checked, finished]);

  // --- card drag (a press that isn't on a control moves the object) ----------
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, .io-scroll")) return;
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
  const banner = BANNERS[idx % BANNERS.length];
  const bannerBg = `linear-gradient(150deg, ${banner[0]} 0%, ${banner[1]} 100%)`;
  const isPick = round ? isPickGoal(round.goal) : false;
  const showConfetti = correct;

  return (
    <div
      className={"iorder" + (fx?.kind === "ok" ? " happy" : fx?.kind === "no" ? " shake" : "")}
      data-id={obj.id}
      style={{ width: W + "px", height: obj.h + "px", ...rootVars }}
      onPointerDown={onCardPointerDown}
    >
      <div className="io-head" style={{ height: HEAD_H + "px" }}>
        <span className="io-title">{deckTitle(mo)}</span>
        <span className="io-progress">{finished ? "Results" : `${idx + 1} / ${rounds}`}</span>
        <button className="io-new" title="New game" onClick={newGame}>
          New
        </button>
      </div>

      {finished || !round ? (
        <Summary obj={mo} deck={deck} onReplay={replay} onNew={newGame} />
      ) : (
        <div className="io-scene" style={{ height: sceneH + "px" }} key={`${obj.round ?? 0}:${idx}`}>
          <div className="io-prompt" style={{ background: bannerBg }}>
            {goalPrompt(round.goal)}
          </div>

          <div className="io-tiles">
            {round.nums.map((n, j) => {
              const pos = chain.indexOf(j); // -1 when not tapped
              const state = tileState(round, chain, checked, j);
              const badge = tileBadge(round, chain, checked, j, isPick);
              return (
                <button
                  key={j}
                  type="button"
                  className={"io-tile io-" + state + (pos >= 0 && !checked ? " sel" : "")}
                  style={{ animationDelay: j * 45 + "ms" }}
                  disabled={checked}
                  onClick={() => tap(j)}
                >
                  <span className="io-num">{formatNum(n)}</span>
                  {badge != null && <span className="io-badge">{badge}</span>}
                </button>
              );
            })}
            {showConfetti &&
              CONFETTI.map((emoji, i) => (
                <span key={"c" + i} className="io-confetti" style={confettiStyle(i)}>
                  {emoji}
                </span>
              ))}
          </div>

          <div className="io-foot">
            {checked ? (
              <>
                <span className={"io-result " + (correct ? "ok" : "no")}>
                  {correct ? "Correct! 🎉" : "Not quite"}
                </span>
                {!correct && (
                  <button className="io-retry" onClick={clearRound}>
                    Try again
                  </button>
                )}
                <button className="io-next" ref={nextRef} onClick={next}>
                  {idx + 1 >= rounds ? "See results ▸" : "Next ▸"}
                </button>
              </>
            ) : (
              <>
                <span className="io-hint">
                  {isPick
                    ? "Tap a number"
                    : chain.length > 0
                      ? "Tap in order · tap again to undo"
                      : "Tap the numbers in order"}
                </span>
                {!isPick && chain.length > 0 && (
                  <button className="io-clear" onClick={clearRound}>
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

/** Visual state of tile `j`. While playing, only "sel" (via a separate flag)
 *  matters; once checked, tiles turn green (right) / red (wrong) / dim. */
function tileState(
  round: OrderRound,
  chain: number[],
  checked: boolean,
  j: number,
): "idle" | "right" | "wrong" | "dim" {
  if (!checked) return "idle";
  if (isPickGoal(round.goal)) {
    if (j === pickIndex(round)) return "right";
    if (j === chain[0]) return "wrong";
    return "dim";
  }
  const want = sortOrder(round);
  return chain.indexOf(j) === want.indexOf(j) ? "right" : "wrong";
}

/** The badge on tile `j`: the chain position while building; the CORRECT
 *  position (sort) or a tick / cross (pick) once checked. */
function tileBadge(
  round: OrderRound,
  chain: number[],
  checked: boolean,
  j: number,
  isPick: boolean,
): string | number | null {
  if (!checked) {
    if (isPick) return null;
    const pos = chain.indexOf(j);
    return pos >= 0 ? pos + 1 : null;
  }
  if (isPick) {
    if (j === pickIndex(round)) return "✓";
    if (j === chain[0]) return "✗";
    return null;
  }
  // sort: show where the tile SHOULD have gone, so the right order is legible.
  return sortOrder(round).indexOf(j) + 1;
}

/** The end-of-session review: a score, then every round with its result. */
function Summary({
  obj,
  deck,
  onReplay,
  onNew,
}: {
  obj: OrderObj;
  deck: OrderRound[];
  onReplay: () => void;
  onNew: () => void;
}) {
  const scored = scoreDeck(obj, deck);
  const correct = scoreCount(scored);
  const total = scored.length;
  const v = verdict(correct, total);
  return (
    <div className="io-summary">
      <div className="io-score">
        <div className="io-score-big">
          {correct} <span className="io-score-of">/ {total}</span>
        </div>
        <div className="io-score-sub">
          {v.emoji} {v.text}
        </div>
      </div>
      <div className="io-scroll" onWheel={(e) => e.stopPropagation()}>
        {scored.map((s, i) => (
          <div className={"io-srow" + (s.correct ? " ok" : " no")} key={i}>
            <span className="io-srow-mk">{s.correct ? "✓" : "✗"}</span>
            <span className="io-srow-q">{goalPrompt(s.round.goal)}</span>
            <span className="io-srow-n">{roundText(s.round)}</span>
          </div>
        ))}
      </div>
      <div className="io-summary-actions">
        <button className="io-again" onClick={onReplay}>
          Play again
        </button>
        <button className="io-newdeck" onClick={onNew}>
          New game
        </button>
      </div>
    </div>
  );
}
