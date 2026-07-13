// WIDGET COMPONENT — the .imoney overlay: a 3D money mat with six games.
//
// One card hosts every game (see games.ts). It reads its problem (derived
// deterministically from params + the `round` counter) and the student's
// response (live widget-state) straight off `obj`, and writes back through
// updateWidgetState (INPUT_ORIGIN) — so answers, the placed pile and "New
// problem" all sync to collaborators and persist, but Ctrl+Z never reverts
// them, exactly like the dice roll and the worksheet's typed answers.
//
// The mat is drawn on a <canvas> by the software-3D painter (render.ts). Coins
// and notes are placed by CLICKING a tray chip (one CRDT field per piece,
// keyed pc:<id>), drop in with a short tumble (reusing the dice `rollQuat`), and
// are removed by clicking them. Dragging the card moves the object; a settings
// change reseeds the problem and clears the pile.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { startWidgetCardDrag } from "@/tools/widgetDrag";
import { track } from "@/analytics";
import { id as newId } from "@/board/types";
import {
  denominationsFor,
  format,
  getCurrency,
  getDenom,
  type Denomination,
} from "@/tools/money/currencies";
import {
  GAME_META,
  PROMPT_H,
  ANSWER_H,
  checkAnswer,
  deriveProblem,
  freeSpot,
  liveSum,
  placeField,
  problemStamp,
  prunePlacedPatch,
  readPlacedPieces,
  stageSize,
  trayHeight,
  type MoneyObj,
  type PlacedPiece,
  type Relation,
} from "@/tools/money/games";
import { drawThumb, paintStage, type HitRegion, type RenderPiece } from "@/tools/money/render";
import type { MoneyParams } from "@/tools/money";

const CAP = 60; // max pieces on the mat
const DROP_MS = 430;
const AUTO_MS = 3000; // auto-advance delay after a correct answer
/** Emoji that burst out on a correct answer. */
const CONFETTI = ["🎉", "⭐", "✨", "💰", "🎊", "🪙", "⭐", "✨"];
function confettiStyle(i: number): React.CSSProperties {
  const a = (i / CONFETTI.length) * 2 * Math.PI;
  return { "--tx": Math.cos(a) * 96 + "px", "--ty": Math.sin(a) * 96 + "px" } as React.CSSProperties;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/** Overshoot ease for a springy pop (0→1, briefly past 1). */
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function Money({ obj }: WidgetProps<MoneyParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);

  const mo = obj as unknown as MoneyObj;
  const cur = getCurrency(obj.currency);
  const meta = GAME_META[obj.game];
  const problem = useMemo(() => deriveProblem(mo), [
    obj.id,
    obj.game,
    obj.currency,
    obj.difficulty,
    obj.round,
  ]);

  const usesTray = meta.inputMode === "build" || meta.inputMode === "none";
  const { w: cssW, h: stageH } = stageSize(mo);

  const placed = readPlacedPieces(mo);
  const placedTotal = liveSum(placed);

  // The pieces shown on the mat: the question pile (count/compare) or the
  // student's placed pile (make/shop/change/sandbox — the build games).
  const matPieces: PlacedPiece[] =
    obj.game === "compare"
      ? [...problem.presented, ...(problem.presentedB ?? [])]
      : obj.game === "count"
        ? problem.presented
        : placed;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<HitRegion[]>([]);
  const animRef = useRef<Map<string, { start: number }>>(new Map());
  const seenRef = useRef<Set<string>>(new Set());
  const rafRef = useRef(0);

  // Transient celebrate/commiserate animation, and the auto-advance timer.
  const [fx, setFx] = useState<{ kind: "ok" | "no"; n: number } | null>(null);
  const fxSeqRef = useRef(0);
  const fxTimerRef = useRef(0);
  const autoTimerRef = useRef(0);

  // Paint the mat at time `now`, folding in any in-progress drop animations.
  const paintRef = useRef<(now: number) => void>(() => {});
  paintRef.current = (now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drop = stageH * 0.28;
    const pieces: RenderPiece[] = matPieces.map((p) => {
      const a = animRef.current.get(p.key);
      if (!a) return { key: p.key, denomId: p.denomId, x: p.x, y: p.y, spin: p.spin };
      const t = clamp((now - a.start) / DROP_MS, 0, 1);
      // A springy pop: fall in from above while growing to full size.
      return {
        key: p.key,
        denomId: p.denomId,
        x: p.x,
        y: p.y,
        spin: p.spin,
        anim: { dyPx: -(1 - easeOutCubic(t)) * drop, scale: 0.6 + 0.4 * easeOutBack(t) },
      };
    });
    hitsRef.current = paintStage(canvas, { currency: obj.currency, cssW, cssH: stageH, pieces });
  };

  function ensureRaf() {
    if (rafRef.current) return;
    const tick = () => {
      const now = performance.now();
      paintRef.current(now);
      let active = false;
      for (const [k, a] of animRef.current) {
        if (now - a.start >= DROP_MS) animRef.current.delete(k);
        else active = true;
      }
      rafRef.current = active ? requestAnimationFrame(tick) : 0;
      if (!active) paintRef.current(performance.now());
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  // Detect newly placed pieces → start their drop; repaint on any change.
  useEffect(() => {
    const keys = new Set<string>();
    if (usesTray) {
      for (const p of placed) {
        keys.add(p.key);
        if (!seenRef.current.has(p.key)) animRef.current.set(p.key, { start: performance.now() });
      }
    }
    seenRef.current = keys;
    if (animRef.current.size > 0) ensureRaf();
    else paintRef.current(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj, stageH, cssW]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(fxTimerRef.current);
      window.clearTimeout(autoTimerRef.current);
    },
    [],
  );

  // Reseed + clear the pile when the game / currency / difficulty changes (an
  // edit through the Dialog). The problem already depends on these via its seed;
  // this just drops a now-irrelevant pile and stale answer.
  useEffect(() => {
    const stamp = problemStamp(mo);
    if (mo.stamp !== stamp) {
      updateWidgetState(obj.id, {
        stamp,
        ...prunePlacedPatch(mo),
        ans: undefined,
        choice: undefined,
        result: undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.game, obj.currency, obj.difficulty]);

  // --- helpers ---------------------------------------------------------------

  const fresh = (): MoneyObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as MoneyObj | undefined;

  function setAns(v: string) {
    updateWidgetState(obj.id, { ans: v, result: undefined });
  }

  // Play the happy/lame animation, and (if auto-advance is on) queue the next
  // question after a correct answer. The queued advance re-checks the result at
  // fire time, so any edit the student makes in the meantime cancels it.
  function afterCheck(result: "ok" | "no") {
    fxSeqRef.current += 1;
    setFx({ kind: result, n: fxSeqRef.current });
    window.clearTimeout(fxTimerRef.current);
    fxTimerRef.current = window.setTimeout(() => setFx(null), result === "ok" ? 1700 : 1000);
    window.clearTimeout(autoTimerRef.current);
    if (result === "ok" && obj.autoNew) {
      autoTimerRef.current = window.setTimeout(() => {
        if (fresh()?.result === "ok") newProblem();
      }, AUTO_MS);
    }
  }

  function check() {
    const m = fresh();
    if (!m) return;
    const result = checkAnswer(m, deriveProblem(m));
    updateWidgetState(obj.id, { result });
    afterCheck(result);
    track("tool_action", { tool: "money", action: "check" });
  }

  function chooseRelation(rel: Relation) {
    const m = fresh();
    if (!m) return;
    const result: "ok" | "no" = rel === deriveProblem(m).relation ? "ok" : "no";
    updateWidgetState(obj.id, { choice: rel, result });
    afterCheck(result);
    track("tool_action", { tool: "money", action: "check" });
  }

  function newProblem() {
    window.clearTimeout(autoTimerRef.current);
    setFx(null);
    const m = fresh() ?? mo;
    updateWidgetState(obj.id, {
      round: (m.round ?? 0) + 1,
      stamp: problemStamp(m),
      ...prunePlacedPatch(m),
      ans: undefined,
      choice: undefined,
      result: undefined,
    });
    track("tool_action", { tool: "money", action: "new" });
  }

  function clearPile() {
    const m = fresh() ?? mo;
    updateWidgetState(obj.id, { ...prunePlacedPatch(m), result: undefined });
  }

  function addPiece(denomId: string) {
    const m = fresh();
    if (!m) return;
    const current = readPlacedPieces(m);
    if (current.length >= CAP) return;
    const d = getDenom(denomId);
    if (!d) return;
    const spot = freeSpot(current, denomId, m, Math.random);
    const spin = (Math.random() - 0.5) * (d.kind === "coin" ? 0.7 : 0.22);
    updateWidgetState(obj.id, {
      [placeField(newId())]: { d: denomId, x: spot.x, y: spot.y, s: spin },
      result: undefined,
    });
    track("tool_action", { tool: "money", action: "place" });
  }

  // Click a placed piece to remove it (build/sandbox only); otherwise let the
  // press fall through so an empty-mat drag moves the card.
  function onStagePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!usesTray) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = cssW / rect.width;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sx;
    const hits = hitsRef.current;
    for (let i = hits.length - 1; i >= 0; i--) {
      const hh = hits[i];
      if ((x - hh.cx) ** 2 + (y - hh.cy) ** 2 <= hh.r * hh.r) {
        e.stopPropagation();
        updateWidgetState(obj.id, { [placeField(hh.key)]: undefined, result: undefined });
        return;
      }
    }
  }

  // Drag the card the way a canvas object responds to the tool (ignores presses
  // on controls / removals).
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, select, textarea")) return;
    startWidgetCardDrag(e, obj.id, { x: obj.x, y: obj.y });
  }

  // --- render ----------------------------------------------------------------

  const result = mo.result;
  const mark = result === "ok" ? "✓" : result === "no" ? "✗" : "";
  const markCls = result === "ok" ? " ok" : result === "no" ? " no" : "";
  const denoms = denominationsFor(cur, obj.difficulty);

  return (
    <div
      className={"imoney" + (fx?.kind === "ok" ? " happy" : fx?.kind === "no" ? " shake" : "")}
      data-id={obj.id}
      style={{ width: cssW + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="imoney-prompt" style={{ height: PROMPT_H + "px" }}>
        <span className="imoney-q">{meta.prompt(problem)}</span>
        {obj.game !== "sandbox" && (
          <button className="imoney-new" title="New problem" onClick={newProblem}>
            New
          </button>
        )}
      </div>

      <div className="imoney-stage" style={{ height: stageH + "px" }}>
        <canvas
          ref={canvasRef}
          className="imoney-canvas"
          style={{ width: cssW + "px", height: stageH + "px" }}
          onPointerDown={onStagePointerDown}
        />
        {obj.game === "shop" && problem.items && (
          <div className="imoney-shop">
            {problem.items.map((it, i) => (
              <span className="imoney-shop-item" key={i} title={it.name}>
                <span className="imoney-shop-emoji">{it.emoji}</span>
                <span className="imoney-shop-price">{format(it.price, cur)}</span>
              </span>
            ))}
          </div>
        )}
        {obj.game === "compare" && <div className="imoney-divider" />}
        {fx && (
          <div className={"imoney-fx " + fx.kind} key={fx.n}>
            <span className="imoney-fx-badge">{fx.kind === "ok" ? "✓" : "✗"}</span>
            {fx.kind === "ok" &&
              CONFETTI.map((emoji, i) => (
                <span key={i} className="imoney-confetti" style={confettiStyle(i)}>
                  {emoji}
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="imoney-controls" style={{ height: ANSWER_H + "px" }}>
        {meta.inputMode === "amount" && (
          <>
            <span className="imoney-sym">{cur.symbol}</span>
            <input
              className={"imoney-input" + markCls}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={mo.ans ?? ""}
              onChange={(e) => setAns(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") check();
              }}
            />
            <button className="imoney-check" onClick={check}>
              Check
            </button>
            <span className={"imoney-mark" + markCls}>{mark}</span>
          </>
        )}

        {meta.inputMode === "choice" && (
          <div className="imoney-choices">
            {([[">", "◀ Left"], ["=", "Equal"], ["<", "Right ▶"]] as [Relation, string][]).map(
              ([rel, label]) => (
                <button
                  key={rel}
                  className={"imoney-choice" + (mo.choice === rel ? " active" : "")}
                  onClick={() => chooseRelation(rel)}
                >
                  {label}
                </button>
              ),
            )}
            <span className={"imoney-mark" + markCls}>{mark}</span>
          </div>
        )}

        {meta.inputMode === "build" && (
          <>
            {/* Hide the running total until Check — otherwise it gives the answer
                away. After checking, reveal what was built vs. what was needed. */}
            {result ? (
              <span className={"imoney-read" + markCls}>
                {format(placedTotal, cur)} <span className="imoney-slash">/</span>{" "}
                {format(problem.target, cur)}
              </span>
            ) : (
              <span className="imoney-hint">Build it, then check</span>
            )}
            <button className="imoney-check" onClick={check}>
              Check
            </button>
            <span className={"imoney-mark" + markCls}>{mark}</span>
          </>
        )}

        {meta.inputMode === "none" && (
          <>
            <span className="imoney-read big">{format(placedTotal, cur)}</span>
            <button className="imoney-clear" onClick={clearPile} disabled={placed.length === 0}>
              Clear
            </button>
          </>
        )}
      </div>

      {usesTray && (
        <div className="imoney-tray" style={{ height: trayHeight(mo) + "px" }}>
          {/* Coins on one row, notes on the next. */}
          <div className="imoney-tray-row">
            {denoms
              .filter((d) => d.kind === "coin")
              .map((d) => (
                <TrayChip key={d.id} denom={d} onAdd={addPiece} label={format(d.value, cur)} />
              ))}
          </div>
          {denoms.some((d) => d.kind === "bill") && (
            <div className="imoney-tray-row">
              {denoms
                .filter((d) => d.kind === "bill")
                .map((d) => (
                  <TrayChip key={d.id} denom={d} onAdd={addPiece} label={format(d.value, cur)} />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A tray denomination: a small 3D thumbnail you click to drop one on the mat. */
function TrayChip({
  denom,
  onAdd,
  label,
}: {
  denom: Denomination;
  onAdd: (id: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (ref.current) drawThumb(ref.current, denom.id);
  }, [denom.id]);
  return (
    <button
      className={"imoney-chip " + denom.kind}
      title={label}
      onClick={() => onAdd(denom.id)}
    >
      <canvas ref={ref} className="imoney-chip-cv" />
    </button>
  );
}
