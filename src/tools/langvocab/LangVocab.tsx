// WIDGET COMPONENT — the .ivocab notepad: a book of vocabulary to browse and
// hear. One PAGE per theme; a header names the open theme and shows the page
// number, the body lists every word the theme offers (headword + meaning +
// pronunciation), and a footer turns the pages. Tapping a word speaks it (the
// whole word is the target — see SpokenWord). Which page is open is live
// widget-state (`page` via updateWidgetState — synced, persisted,
// undo-invisible), so a study partner turns to the same page. The header is the
// drag handle; content comes from lang/pairs, resolved live.

import { useMemo } from "react";
import type { WidgetProps } from "@/tools/registry";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import { SpokenWord } from "@/lang/SpokenWord";
import { categoryById } from "@/lang/data";
import {
  categoriesFromObj,
  vocabFor,
  type LevelFilter,
  type VocabPair,
} from "@/lang/pairs";
import type { LangVocabParams } from "@/tools/langvocab";

/** Header + footer strip heights (px); the list flexes to fill the rest. */
const HEAD_H = 44;
const NAV_H = 46;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One theme's page: its label/emoji and the resolved word pairs. */
interface Page {
  id: string;
  label: string;
  emoji: string;
  words: VocabPair[];
}

export function LangVocab({ obj }: WidgetProps<LangVocabParams>) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const level: LevelFilter = obj.level ?? "mixed";
  const pair = { known: obj.known, learning: obj.learning };

  // One page per chosen theme; themes with no usable words are dropped so a
  // learner never turns to a blank page.
  const pages = useMemo<Page[]>(() => {
    return categoriesFromObj(obj)
      .map((id) => ({
        id,
        label: categoryById(id)?.label ?? id,
        emoji: categoryById(id)?.emoji ?? "📄",
        words: vocabFor(id, level, pair),
      }))
      .filter((p) => p.words.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obj.categories, obj.category, obj.level, obj.known, obj.learning]);

  const pageCount = pages.length;
  const pageIdx = clamp(obj.page ?? 0, 0, Math.max(0, pageCount - 1));
  const page = pages[pageIdx];

  // The headword is the language the learner is studying, unless they flipped it.
  const headIsLearning = obj.direction !== "known-first";
  const headCode = headIsLearning ? obj.learning : obj.known;
  const glossCode = headIsLearning ? obj.known : obj.learning;

  function turn(delta: number) {
    const next = clamp(pageIdx + delta, 0, pageCount - 1);
    if (next === pageIdx) return;
    updateWidgetState(obj.id, { page: next });
    track("tool_action", { tool: "langvocab", action: delta > 0 ? "next" : "prev" });
  }

  function goTo(i: number) {
    if (i === pageIdx) return;
    updateWidgetState(obj.id, { page: i });
    track("tool_action", { tool: "langvocab", action: "jump" });
  }

  // --- card drag (a press that isn't on a control/list moves the object) -----
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, .iv-list")) return;
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
      className="ivocab"
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="iv-head" style={{ height: HEAD_H + "px" }}>
        <span className="iv-emoji" aria-hidden>
          {page?.emoji ?? "📒"}
        </span>
        <span className="iv-title">{page?.label ?? "Word list"}</span>
        {pageCount > 0 && (
          <span className="iv-page-of">
            {pageIdx + 1} / {pageCount}
          </span>
        )}
      </div>

      {pageCount === 0 || !page ? (
        <div className="lf-empty">No words yet for these themes.</div>
      ) : (
        <>
          <ul
            className="iv-list"
            key={pageIdx}
            style={{ height: listH + "px" }}
            onWheel={(e) => e.stopPropagation()}
          >
            {page.words.map((w, i) => {
              const head = headIsLearning ? w.learning : w.known;
              const gloss = headIsLearning ? w.known : w.learning;
              const headPhon = headIsLearning ? w.learningPhonetic : w.knownPhonetic;
              return (
                <li className="iv-row" key={i}>
                  {w.emoji && (
                    <span className="iv-row-emoji" aria-hidden>
                      {w.emoji}
                    </span>
                  )}
                  <span className="iv-row-words">
                    <SpokenWord text={head} code={headCode} className="iv-head-word" />
                    {headPhon && <span className="iv-phon">{headPhon}</span>}
                    <SpokenWord
                      text={gloss}
                      code={glossCode}
                      className="iv-gloss"
                      icon={false}
                    />
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="iv-nav" style={{ height: NAV_H + "px" }}>
            <button
              className="iv-turn"
              onClick={() => turn(-1)}
              disabled={pageIdx === 0}
              title="Previous theme"
              aria-label="Previous theme"
            >
              ‹
            </button>
            <div className="iv-dots" role="tablist" aria-label="Themes">
              {pages.map((p, i) => (
                <button
                  key={p.id}
                  className={"iv-dot" + (i === pageIdx ? " on" : "")}
                  onClick={() => goTo(i)}
                  title={p.label}
                  aria-label={p.label}
                  aria-selected={i === pageIdx}
                  role="tab"
                />
              ))}
            </div>
            <button
              className="iv-turn"
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
