// WIDGET COMPONENT — the .icj overlay: learn to conjugate a verb.
//
// One verb + one tense, six persons. The mode (chosen in the dialog) decides how
// you work: LEARN shows the table and lets you cover rows to test yourself; PICK
// hides the forms and offers them as a scrambled bank to place into the right
// rows; TYPE asks you to type each form. Correct rows lock green, wrong ones show
// the answer. A "Flash cards" button turns the table into a flash-cards deck. All
// state is live widget-state (see conj.ts). The card body is the drag handle.

import { useEffect, useMemo, useState } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { placeObject } from "@/board/commands";
import { track } from "@/analytics";
import { SpeakButton } from "@/lang/SpeakButton";
import { usePickPlace } from "@/lang/usePickPlace";
import {
  allFilled,
  checkPatch,
  clearCellPatch,
  coverAllPatch,
  coverPatch,
  correctCount,
  deriveTable,
  flashPairs,
  isChecked,
  isCovered,
  newRoundPatch,
  placePatch,
  resetSessionPatch,
  rowAnswer,
  rowCorrect,
  typePatch,
  usedSlots,
  type ConjObj,
} from "@/tools/langconjugate/conj";
import type { LangConjugateParams } from "@/tools/langconjugate";

const HEAD_H = 40;

export function LangConjugate({ obj }: WidgetProps<LangConjugateParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const mo = obj as unknown as ConjObj;
  const mode = obj.mode;
  const table = useMemo(
    () => deriveTable(mo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [obj.id, obj.verb, obj.tense, obj.learning, obj.known, obj.round],
  );
  const size = table.rows.length;
  const checked = isChecked(mo);
  const correct = correctCount(table, mo);
  const used = usedSlots(mo);
  // Type mode keeps its inputs in LOCAL state (committed on Check), so typing
  // doesn't write to the shared doc on every keystroke.
  const [typed, setTyped] = useState<Record<number, string>>({});
  useEffect(() => setTyped({}), [obj.verb, obj.tense, obj.round, obj.mode]);
  const allCovered = size > 0 && table.rows.every((_, i) => isCovered(mo, i));

  const fresh = (): ConjObj | undefined =>
    useBoardStore.getState().board.objects.find((o) => o.id === obj.id) as ConjObj | undefined;

  // --- pick mode -------------------------------------------------------------
  // Drag a bank form onto a row, OR tap the form then tap the row — both land
  // here (see usePickPlace).
  const place = usePickPlace({
    onPlace: (slotStr, rowStr) => {
      if (checked) return;
      const slot = Number(slotStr);
      const i = Number(rowStr);
      updateWidgetState(obj.id, placePatch(i, slot));
      // Auto-check once every row is filled.
      const m = fresh();
      if (m && allFilled(table, m)) {
        updateWidgetState(obj.id, checkPatch());
        track("tool_action", { tool: "langconjugate", action: "check" });
      }
    },
  });
  useEffect(() => place.reset(), [obj.verb, obj.tense, obj.round, obj.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearRow(i: number) {
    if (checked) return;
    updateWidgetState(obj.id, clearCellPatch(i));
  }

  // --- type mode -------------------------------------------------------------
  // Commit every typed form to the doc, then check.
  function commitAndCheck() {
    let patch: Record<string, unknown> = {};
    for (let i = 0; i < size; i++) patch = { ...patch, ...typePatch(i, typed[i] ?? "") };
    updateWidgetState(obj.id, { ...patch, ...checkPatch() });
    track("tool_action", { tool: "langconjugate", action: "check" });
  }

  // --- learn mode ------------------------------------------------------------
  function toggleCover(i: number) {
    updateWidgetState(obj.id, coverPatch(i, !isCovered(mo, i)));
  }
  function coverAll(on: boolean) {
    updateWidgetState(obj.id, coverAllPatch(size, on));
  }

  // --- shared ---------------------------------------------------------------
  function newGame() {
    place.reset();
    updateWidgetState(obj.id, newRoundPatch(fresh() ?? mo));
    track("tool_action", { tool: "langconjugate", action: "new" });
  }
  function tryAgain() {
    place.reset();
    setTyped({});
    updateWidgetState(obj.id, resetSessionPatch(fresh() ?? mo));
  }
  function makeFlashcards() {
    const pairs = flashPairs(table);
    if (pairs.length === 0) return;
    placeObject("langflashcards", {
      known: obj.known,
      learning: obj.learning,
      category: "custom",
      level: "mixed",
      count: pairs.length,
      direction: "known-first",
      easy: false,
      custom: pairs,
    });
    track("tool_action", { tool: "langconjugate", action: "flashcards" });
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input")) return;
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

  const quiz = mode === "pick" || mode === "type";
  const done = quiz && checked && correct === size;

  return (
    <div
      className={"icj" + (done ? " done" : "")}
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="cj-head" style={{ height: HEAD_H + "px" }}>
        <span className="cj-title">
          {table.infinitiveLearning}
          {table.infinitiveLearning && (
            <SpeakButton as="span" text={table.infinitiveLearning} code={obj.learning} />
          )}
          {table.infinitiveKnown && <span className="cj-sub"> · {table.infinitiveKnown}</span>}
          <span className="cj-sub"> · {table.tenseLabel}</span>
        </span>
        {quiz && !checked && <span className="cj-progress">{correct} / {size}</span>}
        <button className="cj-new" title="New / reshuffle" onClick={newGame}>
          New
        </button>
      </div>

      {size === 0 ? (
        <div className="lf-empty">No conjugation for this verb yet.</div>
      ) : (
        <div className="cj-body">
          {mode === "learn" && (
            <div className="cj-learnbar">
              <button className="cj-coverbtn" onClick={() => coverAll(!allCovered)}>
                {allCovered ? "Reveal all" : "Cover all"}
              </button>
              <span className="cj-hint">Tap a row to hide or show it</span>
            </div>
          )}

          <div className="cj-rows">
            {table.rows.map((r, i) => {
              const cellStr = rowAnswer(table, mo, i);
              const ok = checked && rowCorrect(table, mo, i);
              const bad = checked && !ok;
              return (
                <div className="cj-row" key={i}>
                  {/* The subject column carries the elision, so avoir reads
                      "j'" + "ai" = j'ai in every mode, never "je ai". */}
                  <span className="cj-pron">{r.subject}</span>
                  {mode === "learn" ? (
                    <button
                      className={"cj-cell cj-learncell" + (isCovered(mo, i) ? " covered" : "")}
                      onClick={() => toggleCover(i)}
                    >
                      {isCovered(mo, i) ? "•••" : r.form}
                      {!isCovered(mo, i) && r.form && (
                        <SpeakButton as="span" text={r.form} code={obj.learning} />
                      )}
                    </button>
                  ) : mode === "type" ? (
                    checked ? (
                      <span className={"cj-cell" + (ok ? " ok" : " no")}>
                        {ok ? cellStr || r.form : r.form}
                      </span>
                    ) : (
                      <input
                        className="cj-input"
                        placeholder="…"
                        autoComplete="off"
                        value={typed[i] ?? ""}
                        onChange={(e) => setTyped((t) => ({ ...t, [i]: e.target.value }))}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") commitAndCheck();
                        }}
                      />
                    )
                  ) : (
                    // pick mode — a drop target for the bank forms, and a tap
                    // target when a form is picked; tapping a filled cell clears it.
                    (() => {
                      const tp = place.targetProps(String(i), { disabled: checked });
                      return (
                        <button
                          ref={tp.ref}
                          data-over={tp["data-over"]}
                          className={
                            "cj-cell cj-pickcell" +
                            (checked ? (ok ? " ok" : " no") : cellStr ? " filled" : " empty")
                          }
                          onClick={(e) => {
                            if (place.picked != null) tp.onClick(e);
                            else if (cellStr) clearRow(i);
                          }}
                        >
                          {checked && bad ? r.form : cellStr || "____"}
                        </button>
                      );
                    })()
                  )}
                </div>
              );
            })}
          </div>

          {mode === "pick" && !checked && (
            <div className="cj-bank">
              {table.bank.map((form, slot) => (
                <button
                  key={slot}
                  className={"cj-bankitem" + (used.has(slot) ? " used" : "")}
                  disabled={used.has(slot)}
                  {...place.sourceProps(String(slot), { disabled: used.has(slot) })}
                >
                  {form}
                </button>
              ))}
            </div>
          )}

          <div className="cj-foot">
            {quiz && checked ? (
              <>
                <span className={"cj-result " + (correct === size ? "ok" : "no")}>
                  {correct === size ? "All correct! 🎉" : `${correct} / ${size} correct`}
                </span>
                <button className="cj-retry" onClick={tryAgain}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <button className="cj-flash" onClick={makeFlashcards}>
                  🃏 Flash cards
                </button>
                {mode === "type" && (
                  <button className="cj-checkbtn" onClick={commitAndCheck}>
                    Check
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* The floating form that follows the pointer while dragging. */}
      {place.dragId != null && place.ghost && table.bank[Number(place.dragId)] != null && (
        <div className="pick-ghost" style={{ left: place.ghost.x, top: place.ghost.y }}>
          {table.bank[Number(place.dragId)]}
        </div>
      )}
    </div>
  );
}
