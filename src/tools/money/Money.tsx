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

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import { id as newId } from "@/board/types";
import { pieceQuat } from "@/tools/money/geometry";
import { rollQuat, type Quat } from "@/tools/dice/geometry";
import {
  denominationsFor,
  format,
  getCurrency,
  getDenom,
  type Denomination,
} from "@/tools/money/currencies";
import {
  GAME_META,
  checkAnswer,
  deriveProblem,
  freeSpot,
  liveSum,
  placeField,
  problemStamp,
  prunePlacedPatch,
  readPlacedPieces,
  type MoneyObj,
  type PlacedPiece,
  type Relation,
} from "@/tools/money/games";
import { drawThumb, paintStage, type HitRegion, type RenderPiece } from "@/tools/money/render";
import type { MoneyParams } from "@/tools/money";

const PROMPT_H = 40;
const ANSWER_H = 48;
const TRAY_H = 64;
const CAP = 60; // max pieces on the mat
const DROP_MS = 430;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function Money({ obj }: WidgetProps<MoneyParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

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
  const trayH = usesTray ? TRAY_H : 0;
  const cssW = obj.w;
  const stageH = Math.max(60, obj.h - PROMPT_H - ANSWER_H - trayH);

  const placed = readPlacedPieces(mo);
  const placedTotal = liveSum(placed);

  // The pieces shown on the mat: the question pile (count/change/compare) or the
  // student's placed pile (make/shop/sandbox).
  const matPieces: PlacedPiece[] =
    obj.game === "compare"
      ? [...problem.presented, ...(problem.presentedB ?? [])]
      : obj.game === "count" || obj.game === "change"
        ? problem.presented
        : placed;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<HitRegion[]>([]);
  const animRef = useRef<Map<string, { start: number; kind: "coin" | "bill" }>>(new Map());
  const seenRef = useRef<Set<string>>(new Set());
  const rafRef = useRef(0);

  // Paint the mat at time `now`, folding in any in-progress drop animations.
  const paintRef = useRef<(now: number) => void>(() => {});
  paintRef.current = (now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drop = stageH * 0.32;
    const pieces: RenderPiece[] = matPieces.map((p) => {
      const a = animRef.current.get(p.key);
      if (!a) return { key: p.key, denomId: p.denomId, x: p.x, y: p.y, spin: p.spin };
      const e = easeOutCubic(clamp((now - a.start) / DROP_MS, 0, 1));
      const target = pieceQuat(a.kind, p.spin);
      const quat: Quat = rollQuat(target, target, 2, e);
      return { key: p.key, denomId: p.denomId, x: p.x, y: p.y, spin: p.spin, anim: { quat, dyPx: -(1 - e) * drop } };
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
        if (!seenRef.current.has(p.key)) {
          const d = getDenom(p.denomId);
          animRef.current.set(p.key, { start: performance.now(), kind: d?.kind === "bill" ? "bill" : "coin" });
        }
      }
    }
    seenRef.current = keys;
    if (animRef.current.size > 0) ensureRaf();
    else paintRef.current(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj, stageH, cssW]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

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

  function check() {
    const m = fresh();
    if (!m) return;
    const result = checkAnswer(m, deriveProblem(m));
    updateWidgetState(obj.id, { result });
    track("tool_action", { tool: "money", action: "check" });
  }

  function chooseRelation(rel: Relation) {
    const m = fresh();
    if (!m) return;
    const result: "ok" | "no" = rel === deriveProblem(m).relation ? "ok" : "no";
    updateWidgetState(obj.id, { choice: rel, result });
    track("tool_action", { tool: "money", action: "check" });
  }

  function newProblem() {
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
    const spot = freeSpot(current.map((p) => ({ x: p.x, y: p.y })), Math.random);
    const spin = (Math.random() - 0.5) * (d.kind === "coin" ? 0.7 : 0.28);
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

  // Drag the card to move the object (ignores presses on controls / removals).
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, select, textarea")) return;
    e.stopPropagation();
    const card = e.currentTarget;
    const scale = useBoardStore.getState().camera.scale;
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = obj.x;
    const oy = obj.y;
    let moved = false;
    try {
      card.setPointerCapture(e.pointerId);
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
      card.removeEventListener("pointermove", mv);
      card.removeEventListener("pointerup", up);
    };
    card.addEventListener("pointermove", mv);
    card.addEventListener("pointerup", up);
  }

  // --- render ----------------------------------------------------------------

  const result = mo.result;
  const mark = result === "ok" ? "✓" : result === "no" ? "✗" : "";
  const markCls = result === "ok" ? " ok" : result === "no" ? " no" : "";
  const denoms = denominationsFor(cur, obj.difficulty);

  return (
    <div
      className="imoney"
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
        {obj.game === "shop" && problem.itemEmoji && (
          <div className="imoney-item" title={problem.itemName}>
            {problem.itemEmoji}
          </div>
        )}
        {obj.game === "compare" && <div className="imoney-divider" />}
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
            {(["<", "=", ">"] as Relation[]).map((rel) => (
              <button
                key={rel}
                className={"imoney-choice" + (mo.choice === rel ? " active" : "")}
                onClick={() => chooseRelation(rel)}
              >
                {rel === "<" ? "◀ left less" : rel === ">" ? "right less ▶" : "= equal"}
              </button>
            ))}
            <span className={"imoney-mark" + markCls}>{mark}</span>
          </div>
        )}

        {meta.inputMode === "build" && (
          <>
            <span className="imoney-read">
              {format(placedTotal, cur)} <span className="imoney-slash">/</span>{" "}
              {format(problem.target, cur)}
            </span>
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
        <div className="imoney-tray" style={{ height: TRAY_H + "px" }}>
          {denoms.map((d) => (
            <TrayChip key={d.id} denom={d} onAdd={addPiece} label={format(d.value, cur)} />
          ))}
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
