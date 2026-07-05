// WIDGET COMPONENT — the .iworksheet overlay card.
//
// Renders a light title row (title, New, Check) and the body rows (question
// label · input · mark). There is NO chrome bar: editing settings and deleting
// are the systemic selection actions every object now has (the FloatButtons
// over the selection, double-click, the Delete key), so a per-widget ✎/×
// would be redundant. The whole card is the drag handle (any press that isn't
// on a control moves the object).
//
// Typed answers and marks are SHARED STATE: they live on the object as
// per-question fields ("ans:<qid>" / "mark:<qid>") written under INPUT_ORIGIN
// via updateWidgetState, so every collaborator sees them live and they persist
// with the document — but Ctrl+Z never reverts them. Keying by question id (not
// index) means a fresh question set (New / settings edit) starts blank
// everywhere without any clearing pass. The score line is derived from the
// marks, so it can never go stale.
//
// The WidgetLayer positions and scales this element, so we never set
// left/top/transform here. The card's rendered size is synced back onto the
// object's box (updateWidgetState — shared + persisted, undo-invisible) so the
// selection frame and FloatButtons cover the whole widget, whose height depends
// on the question count.

import { useLayoutEffect, useRef } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import {
  ansField,
  genQuestions,
  markAnswers,
  markField,
  qKey,
  widgetTitle,
  type Mark,
  type WorksheetParams,
} from "@/tools/worksheet";

export function Worksheet({ obj }: WidgetProps<WorksheetParams>) {
  const updateObject = useBoardStore((s) => s.updateObject);
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  // Shared state, read straight off the object (no local copies to reset).
  const rec = obj as unknown as Record<string, unknown>;
  const answers = obj.questions.map(
    (q, i) => (rec[ansField(q, i)] as string) ?? "",
  );
  const marks = obj.questions.map(
    (q, i) => (rec[markField(q, i)] as Mark) ?? null,
  );
  const checked = marks.some((m) => m !== null);
  const correct = marks.filter((m) => m?.kind === "ok").length;
  const score = checked
    ? correct + " / " + obj.questions.length + " correct"
    : "";

  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Keep the object's box matched to the rendered card so the selection frame
  // and float buttons cover the whole widget. offset sizes are the unscaled
  // layout size (the camera scale is a CSS transform, which doesn't affect
  // them), and at scale 1 one CSS px is one world unit — so they ARE the box.
  // Written as live widget state: shared + persisted, never an undo step.
  const lastSize = useRef({ w: obj.w, h: obj.h });
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (
        Math.abs(w - lastSize.current.w) > 0.5 ||
        Math.abs(h - lastSize.current.h) > 0.5
      ) {
        lastSize.current = { w, h };
        updateWidgetState(obj.id, { w, h });
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [obj.id, updateWidgetState]);

  // --- card drag (any press that isn't on a control moves the object) ------
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, select, textarea"))
      return;
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
      // Push one history entry at the REAL drag start (past a small jitter
      // threshold) so a plain click-to-select never logs an empty undo step.
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

  // --- check (marks are shared state, the score derives from them) ---------
  function check() {
    updateWidgetState(obj.id, markAnswers(obj.questions, answers));
  }

  // --- new questions (port of regenWidget — persists via the store) -------
  function regen() {
    const questions = genQuestions(obj);
    // Replace the questions AND prune every stale answer/mark field in the
    // same (undoable) patch — undo restores the old set with its answers.
    const patch: Record<string, unknown> = { questions };
    for (const k of Object.keys(rec)) {
      if (k.startsWith("ans:") || k.startsWith("mark:")) patch[k] = undefined;
    }
    updateObject(obj.id, patch);
  }

  function setAnswer(i: number, v: string) {
    updateWidgetState(obj.id, { [ansField(obj.questions[i], i)]: v });
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    e.stopPropagation();
    if (e.key === "Enter") {
      const nextEl = inputs.current[i + 1];
      if (nextEl) nextEl.focus();
      else check();
    }
  }

  return (
    <div
      className="iworksheet"
      data-id={obj.id}
      ref={cardRef}
      onPointerDown={onCardPointerDown}
    >
      <div className="iw-body">
        <div className="iw-top">
          <span className="iw-title">{widgetTitle(obj)}</span>
          <span className="iw-sp" />
          <button className="iw-btn" title="New questions" onClick={regen}>
            New
          </button>
          <button className="iw-btn check" onClick={check}>
            Check
          </button>
        </div>

        {obj.questions.map((q, i) => {
          const mark = marks[i];
          const inOk = mark?.kind === "ok";
          const inNo = mark?.kind === "no";
          return (
            <div className="iw-row" key={qKey(q, i)}>
              <span className="iw-q">
                {q.a} {q.op} {q.b} =
              </span>
              <input
                ref={(el) => (inputs.current[i] = el)}
                className={"iw-in" + (inOk ? " ok" : inNo ? " no" : "")}
                inputMode="numeric"
                autoComplete="off"
                value={answers[i] ?? ""}
                onChange={(e) => setAnswer(i, e.target.value)}
                onKeyDown={(e) => onInputKeyDown(e, i)}
              />
              <span
                className={
                  "iw-mark" + (inOk ? " ok" : inNo ? " no" : "")
                }
              >
                {mark?.text ?? ""}
              </span>
            </div>
          );
        })}
        <div className="iw-score">{score}</div>
      </div>
    </div>
  );
}
