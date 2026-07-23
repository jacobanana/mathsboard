// WIDGET COMPONENT — the .itable overlay: capture your OWN words and sentences.
//
// A two-column table (known language | learning language) the learner fills in
// themselves. Cells are auto-growing textareas, so full sentences wrap instead
// of being clipped. Structural edits — adding and removing rows — are undoable
// document state (`rowIds`, via updateObject). The typed cell text is live
// widget-state keyed by row id (`ca:<id>` / `cb:<id>` via updateWidgetState —
// synced, persisted, undo-invisible, and conflict-free per cell, like the
// worksheet's answers). A per-column "hide" toggle lets the learner cover a
// column and test themselves, and "Flash cards" turns the filled rows into a
// flash-cards deck. Like the worksheet the card self-measures and syncs its
// rendered size back onto the object box. The card body is the drag handle.

import { useLayoutEffect, useRef } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { id as newId } from "@/board/types";
import { placeObject } from "@/board/commands";
import { languageByCode } from "@/lang/data";
import { SpeakButton } from "@/lang/SpeakButton";
import type { LangTableParams } from "@/tools/langtable";

const cellA = (rowId: string): string => "ca:" + rowId;
const cellB = (rowId: string): string => "cb:" + rowId;

/** Grow a textarea to fit its content (so sentences wrap and stay visible). */
function autosize(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.max(el.scrollHeight, 22) + "px";
}

export function LangTable({ obj }: WidgetProps<LangTableParams>) {
  const updateObject = useBoardStore((s) => s.updateObject);
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const rec = obj as unknown as Record<string, unknown>;
  const rowIds = Array.isArray(obj.rowIds) ? obj.rowIds : [];
  const hideA = rec["hide:a"] === 1;
  const hideB = rec["hide:b"] === 1;

  const knownName = languageByCode(obj.known)?.name ?? obj.known;
  const learningName = languageByCode(obj.learning)?.name ?? obj.learning;

  const cellText = (rowId: string, col: "a" | "b"): string =>
    ((rec[(col === "a" ? cellA : cellB)(rowId)] as string) ?? "");

  // Rows with BOTH sides filled — the deck the "Flash cards" button builds.
  const filled = rowIds
    .map((id) => ({ known: cellText(id, "a").trim(), learning: cellText(id, "b").trim() }))
    .filter((p) => p.known && p.learning);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const lastSize = useRef({ w: obj.w, h: obj.h });

  // Keep the object's box matched to the rendered card (see Worksheet.tsx).
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

  function setCell(rowId: string, col: "a" | "b", v: string) {
    updateWidgetState(obj.id, { [(col === "a" ? cellA : cellB)(rowId)]: v });
  }

  function addRow() {
    updateObject(obj.id, { rowIds: [...rowIds, newId()] });
  }

  function removeRow(rowId: string) {
    updateObject(obj.id, { rowIds: rowIds.filter((r) => r !== rowId) });
    // Tidy up the orphaned cell text (undo-invisible, matches the worksheet).
    updateWidgetState(obj.id, { [cellA(rowId)]: undefined, [cellB(rowId)]: undefined });
  }

  function toggleHide(col: "a" | "b") {
    const key = col === "a" ? "hide:a" : "hide:b";
    updateWidgetState(obj.id, { [key]: rec[key] === 1 ? undefined : 1 });
  }

  // Turn the filled rows into a flash-cards deck (its own words, no topic).
  function makeFlashcards() {
    if (filled.length === 0) return;
    placeObject("langflashcards", {
      known: obj.known,
      learning: obj.learning,
      category: "custom",
      level: "mixed",
      count: filled.length,
      direction: "known-first",
      easy: false,
      custom: filled,
    });
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input, textarea")) return;
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

  return (
    <div className="itable" data-id={obj.id} ref={cardRef} onPointerDown={onCardPointerDown}>
      <div className="it-head">
        <span className="it-title">My words</span>
      </div>

      <div className="it-cols">
        <button
          className={"it-col-h" + (hideA ? " hidden" : "")}
          title="Hide this column to test yourself"
          onClick={() => toggleHide("a")}
        >
          {knownName} {hideA ? "🙈" : ""}
        </button>
        <button
          className={"it-col-h" + (hideB ? " hidden" : "")}
          title="Hide this column to test yourself"
          onClick={() => toggleHide("b")}
        >
          {learningName} {hideB ? "🙈" : ""}
        </button>
        <span className="it-col-sp" />
      </div>

      {rowIds.map((rowId) => (
        <div className="it-row" key={rowId}>
          <div className="it-cellwrap">
            <textarea
              ref={autosize}
              rows={1}
              className={"it-cell" + (hideA ? " masked" : "")}
              placeholder="…"
              autoComplete="off"
              value={cellText(rowId, "a")}
              onChange={(e) => {
                autosize(e.currentTarget);
                setCell(rowId, "a", e.target.value);
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
            {!hideA && (
              <SpeakButton text={cellText(rowId, "a")} code={obj.known} className="it-speak" />
            )}
          </div>
          <div className="it-cellwrap">
            <textarea
              ref={autosize}
              rows={1}
              className={"it-cell" + (hideB ? " masked" : "")}
              placeholder="…"
              autoComplete="off"
              value={cellText(rowId, "b")}
              onChange={(e) => {
                autosize(e.currentTarget);
                setCell(rowId, "b", e.target.value);
              }}
              onKeyDown={(e) => e.stopPropagation()}
            />
            {!hideB && (
              <SpeakButton text={cellText(rowId, "b")} code={obj.learning} className="it-speak" />
            )}
          </div>
          <button className="it-del" title="Remove this row" onClick={() => removeRow(rowId)}>
            ×
          </button>
        </div>
      ))}

      <div className="it-foot">
        <button className="it-add" onClick={addRow}>
          + Add a row
        </button>
        <button
          className="it-flash"
          disabled={filled.length === 0}
          title={
            filled.length === 0
              ? "Fill in some words first"
              : "Make flash cards from these words"
          }
          onClick={makeFlashcards}
        >
          🃏 Flash cards
        </button>
      </div>
    </div>
  );
}
