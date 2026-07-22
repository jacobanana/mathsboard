// WIDGET COMPONENT — the .itable overlay: capture your OWN words and sentences.
//
// A two-column table (known language | learning language) the learner fills in
// themselves. Structural edits — adding and removing rows — are undoable
// document state (`rowIds`, via updateObject). The typed cell text is live
// widget-state keyed by row id (`ca:<id>` / `cb:<id>` via updateWidgetState —
// synced, persisted, undo-invisible, and conflict-free per cell, exactly like
// the worksheet's answers). A per-column "hide" toggle lets the learner cover a
// column and test themselves. Like the worksheet the card self-measures and
// syncs its rendered size back onto the object box. The card body is the drag
// handle (a press that isn't on a control moves the object).

import { useLayoutEffect, useRef } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { id as newId } from "@/board/types";
import { languageByCode } from "@/lang/data";
import type { LangTableParams } from "@/tools/langtable";

const cellA = (rowId: string): string => "ca:" + rowId;
const cellB = (rowId: string): string => "cb:" + rowId;

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

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, input")) return;
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
          <input
            className={"it-cell" + (hideA ? " masked" : "")}
            placeholder="…"
            autoComplete="off"
            value={(rec[cellA(rowId)] as string) ?? ""}
            onChange={(e) => setCell(rowId, "a", e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className={"it-cell" + (hideB ? " masked" : "")}
            placeholder="…"
            autoComplete="off"
            value={(rec[cellB(rowId)] as string) ?? ""}
            onChange={(e) => setCell(rowId, "b", e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button className="it-del" title="Remove this row" onClick={() => removeRow(rowId)}>
            ×
          </button>
        </div>
      ))}

      <div className="it-foot">
        <button className="it-add" onClick={addRow}>
          + Add a word
        </button>
      </div>
    </div>
  );
}
