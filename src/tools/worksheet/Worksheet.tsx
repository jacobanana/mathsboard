// WIDGET COMPONENT — the .iworksheet overlay card.
//
// Renders the header (title, New, Check, settings ✎, ×) and the body rows
// (question label · input · mark). Typed answers and marks are SHARED STATE:
// they live on the object as per-question fields ("ans:<qid>" / "mark:<qid>")
// written under INPUT_ORIGIN via updateWidgetState, so every collaborator sees
// them live and they persist with the document — but Ctrl+Z never reverts
// them. Keying by question id (not index) means a fresh question set (New /
// settings edit) starts blank everywhere without any clearing pass. The score
// line is derived from the marks, so it can never go stale.
//
// The WidgetLayer positions and scales this element, so we never set
// left/top/transform here. Header drag moves the object through the store
// (pushHistory once at drag start, then moveObject per pointer move), mirroring
// the prototype's attachDrag.
//
// Ported from buildBody, checkWidget, createWidgetEl and attachDrag
// (maths-whiteboard.html lines 580-593).

import { useRef } from "react";
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

export function Worksheet({ obj, onEdit }: WidgetProps<WorksheetParams>) {
  const updateObject = useBoardStore((s) => s.updateObject);
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const removeObject = useBoardStore((s) => s.removeObject);
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

  // --- header drag (pointer events on the head only) ----------------------
  function onHeadPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    e.stopPropagation();
    const head = e.currentTarget;
    const scale = useBoardStore.getState().camera.scale;
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = obj.x;
    const oy = obj.y;
    pushHistory(); // once at drag start; moveObject pushes no history.
    try {
      head.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const mv = (ev: PointerEvent) => {
      moveObject(obj.id, ox + (ev.clientX - sx) / scale, oy + (ev.clientY - sy) / scale);
    };
    const up = () => {
      head.removeEventListener("pointermove", mv);
      head.removeEventListener("pointerup", up);
    };
    head.addEventListener("pointermove", mv);
    head.addEventListener("pointerup", up);
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
    <div className="iworksheet" data-id={obj.id}>
      <div className="iw-head" onPointerDown={onHeadPointerDown}>
        <span className="iw-title">{widgetTitle(obj)}</span>
        <span className="iw-sp" />
        <button className="iw-btn" title="New questions" onClick={regen}>
          New
        </button>
        <button className="iw-btn check" onClick={check}>
          Check
        </button>
        <button
          className="iw-btn"
          title="Settings"
          onClick={() => onEdit?.()}
        >
          ✎
        </button>
        <button
          className="iw-x"
          title="Remove"
          onClick={() => removeObject(obj.id)}
        >
          ×
        </button>
      </div>

      <div className="iw-body">
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
