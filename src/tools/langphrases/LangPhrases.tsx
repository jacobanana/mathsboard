// WIDGET COMPONENT — the .iphrases notepad: a book of sentences to browse and
// hear. Modelled on the Word list (.ivocab): one PAGE per theme, a header that
// names the open theme and shows the page number, a body that lists every
// sentence the theme offers (the prompt sentence, its translation and any
// pronunciation), and a footer that turns the pages. Tapping a sentence speaks
// it (the whole line is the target — see SpokenWord), so listening is one tap.
// Which page is open is live widget-state (`page` via updateWidgetState —
// synced, persisted, undo-invisible), so a study partner turns to the same
// page. The header is the drag handle; content comes from lang/pairs.

import { useMemo } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import { SpokenWord } from "@/lang/SpokenWord";
import { categoryById } from "@/lang/data";
import {
  categoriesFromObj,
  sentencesFor,
  type LevelFilter,
  type SentencePairText,
} from "@/lang/pairs";
import type { LangPhrasesParams } from "@/tools/langphrases";

/** Header + footer strip heights (px); the list flexes to fill the rest. */
const HEAD_H = 44;
const NAV_H = 46;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One theme's page: its label/emoji and the resolved sentence pairs. */
interface Page {
  id: string;
  label: string;
  emoji: string;
  items: SentencePairText[];
}

export function LangPhrases({ obj }: WidgetProps<LangPhrasesParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const level: LevelFilter = obj.level ?? "mixed";
  const pair = { known: obj.known, learning: obj.learning };

  // One page per chosen theme; themes with no usable sentences are dropped so a
  // learner never turns to a blank page.
  const pages = useMemo<Page[]>(() => {
    return categoriesFromObj(obj)
      .map((id) => ({
        id,
        label: categoryById(id)?.label ?? id,
        emoji: categoryById(id)?.emoji ?? "💬",
        items: sentencesFor(id, level, pair),
      }))
      .filter((p) => p.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.categories, obj.category, obj.level, obj.known, obj.learning]);

  const pageCount = pages.length;
  const pageIdx = clamp(obj.page ?? 0, 0, Math.max(0, pageCount - 1));
  const page = pages[pageIdx];

  // Which language leads each row (the other is its translation, shown beneath).
  const promptIsKnown = obj.direction !== "learning-first";
  const promptCode = promptIsKnown ? obj.known : obj.learning;
  const answerCode = promptIsKnown ? obj.learning : obj.known;

  function turn(delta: number) {
    const next = clamp(pageIdx + delta, 0, pageCount - 1);
    if (next === pageIdx) return;
    updateWidgetState(obj.id, { page: next });
    track("tool_action", { tool: "langphrases", action: delta > 0 ? "next" : "prev" });
  }

  function goTo(i: number) {
    if (i === pageIdx) return;
    updateWidgetState(obj.id, { page: i });
    track("tool_action", { tool: "langphrases", action: "jump" });
  }

  // --- card drag (a press that isn't on a control/list moves the object) -----
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

  const listH = obj.h - HEAD_H - NAV_H;

  return (
    <div
      className="iphrases"
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="ph-head" style={{ height: HEAD_H + "px" }}>
        <span className="ph-emoji" aria-hidden>
          {page?.emoji ?? "💬"}
        </span>
        <span className="ph-title">{page?.label ?? "Sentences"}</span>
        {pageCount > 0 && (
          <span className="ph-page-of">
            {pageIdx + 1} / {pageCount}
          </span>
        )}
      </div>

      {pageCount === 0 || !page ? (
        <div className="lf-empty">No sentences yet for these themes.</div>
      ) : (
        <>
          <ul
            className="ph-list"
            key={pageIdx}
            style={{ height: listH + "px" }}
            onWheel={(e) => e.stopPropagation()}
          >
            {page.items.map((it, i) => {
              const prompt = promptIsKnown ? it.known : it.learning;
              const answer = promptIsKnown ? it.learning : it.known;
              const promptPhon = promptIsKnown ? it.knownPhonetic : it.learningPhonetic;
              const answerPhon = promptIsKnown ? it.learningPhonetic : it.knownPhonetic;
              return (
                <li className="ph-row" key={i}>
                  <span className="ph-row-lines">
                    <SpokenWord text={prompt} code={promptCode} className="ph-prompt" />
                    {promptPhon && <span className="ph-phon">{promptPhon}</span>}
                    <SpokenWord
                      text={answer}
                      code={answerCode}
                      className="ph-answer"
                      icon={false}
                    />
                    {answerPhon && <span className="ph-phon">{answerPhon}</span>}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="ph-nav" style={{ height: NAV_H + "px" }}>
            <button
              className="ph-turn"
              onClick={() => turn(-1)}
              disabled={pageIdx === 0}
              title="Previous theme"
              aria-label="Previous theme"
            >
              ‹
            </button>
            <div className="ph-dots" role="tablist" aria-label="Themes">
              {pages.map((p, i) => (
                <button
                  key={p.id}
                  className={"ph-dot" + (i === pageIdx ? " on" : "")}
                  onClick={() => goTo(i)}
                  title={p.label}
                  aria-label={p.label}
                  aria-selected={i === pageIdx}
                  role="tab"
                />
              ))}
            </div>
            <button
              className="ph-turn"
              onClick={() => turn(1)}
              disabled={pageIdx >= pageCount - 1}
              title="Next theme"
              aria-label="Next theme"
            >
              ›
            </button>
          </div>
        </>
      )}
    </div>
  );
}
