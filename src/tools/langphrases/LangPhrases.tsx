// WIDGET COMPONENT — the .iphrases overlay: a little phrasebook of sentences to
// learn. Each row shows a sentence in the prompt language; tap it to reveal the
// translation (tap again to hide). Which rows are revealed is live widget-state
// (`pr:<i>` flags via updateWidgetState — synced, persisted, undo-invisible), so
// a study partner sees the same reveals. A header toggle flips the prompt
// language and a "Show all / Hide all" button reveals or hides every row. The
// card body is the drag handle. Pure content comes from lang/pairs.

import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import { sentencesFor, type LevelFilter } from "@/lang/pairs";
import { categoryById } from "@/lang/data";
import type { LangPhrasesParams } from "@/tools/langphrases";

const HEAD_H = 40;

const revealField = (i: number): string => "pr:" + i;

export function LangPhrases({ obj }: WidgetProps<LangPhrasesParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const rec = obj as unknown as Record<string, unknown>;
  // New objects carry `category`/`level`; legacy ones carried `set`.
  const category = obj.category ?? obj.set ?? "";
  const level: LevelFilter = obj.level ?? "mixed";
  const items = sentencesFor(category, level, { known: obj.known, learning: obj.learning });
  const cat = categoryById(category);
  const promptIsKnown = obj.direction !== "learning-first";

  const revealed = (i: number): boolean =>
    rec[revealField(i)] === 1 || rec[revealField(i)] === true;
  const allShown = items.length > 0 && items.every((_, i) => revealed(i));

  function toggleRow(i: number) {
    updateWidgetState(obj.id, { [revealField(i)]: revealed(i) ? undefined : 1 });
  }

  function toggleAll() {
    const show = !allShown;
    const patch: Record<string, unknown> = {};
    items.forEach((_, i) => (patch[revealField(i)] = show ? 1 : undefined));
    updateWidgetState(obj.id, patch);
    track("tool_action", { tool: "langphrases", action: show ? "show-all" : "hide-all" });
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, .ph-list")) return;
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

  const sceneH = obj.h - HEAD_H;

  return (
    <div
      className="iphrases"
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="ph-head" style={{ height: HEAD_H + "px" }}>
        <span className="ph-title">{cat ? cat.label : "Sentences"}</span>
        <button className="ph-btn" title="Show or hide every translation" onClick={toggleAll}>
          {allShown ? "Hide all" : "Show all"}
        </button>
      </div>

      <div className="ph-list" style={{ height: sceneH + "px" }} onWheel={(e) => e.stopPropagation()}>
        {items.length === 0 && <div className="lf-empty">No sentences yet for this set.</div>}
        {items.map((it, i) => {
          const prompt = promptIsKnown ? it.known : it.learning;
          const answer = promptIsKnown ? it.learning : it.known;
          const open = revealed(i);
          return (
            <button
              key={i}
              className={"ph-row" + (open ? " open" : "")}
              onClick={() => toggleRow(i)}
            >
              <span className="ph-prompt">{prompt}</span>
              <span className="ph-answer">{open ? answer : "· · ·"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
