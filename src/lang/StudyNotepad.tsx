// SHARED WIDGET BODY — the "study notepad" both the Word list (langvocab) and
// the Sentences phrasebook (langphrases) render. One PAGE per theme, a header
// naming the open theme with a page-counter pill and a "Hide answers" toggle, a
// paper body listing rows (a lead line + its answer beneath), and a footer of
// prev/next arrows and theme dots. Tapping a line speaks it (SpokenWord), so
// listening is one tap. When answers are hidden each answer shows as a
// placeholder the learner taps to reveal — a self-test, per row.
//
// The two widgets differ only in their CONTENT (which pairs, which direction)
// and their ACCENT colour (a `variant` → a CSS class); everything structural
// and every interaction lives here so the two can't drift. All interactive
// state — the open page, whether answers are hidden, which rows are revealed —
// is live widget-state (via updateWidgetState: synced, persisted,
// undo-invisible), so a study partner sees the same page and reveals.

import { useMemo } from "react";
import { useBoardStore } from "@/board/store";
import { track } from "@/analytics";
import { SpokenWord } from "@/lang/SpokenWord";
import type { BoardObjectBase } from "@/board/types";

/** Header + footer strip heights (px); the list flexes to fill the rest. */
const HEAD_H = 44;
const NAV_H = 46;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** One row: a lead line (always shown) and its answer (hideable). Either line
 *  taps to hear itself; the optional phonetics are shown, never spoken. */
export interface StudyRow {
  /** Optional picture cue shown at the row's left (vocab uses it; sentences don't). */
  emoji?: string;
  lead: string;
  leadCode: string;
  leadPhonetic?: string;
  answer: string;
  answerCode: string;
  answerPhonetic?: string;
}

/** One theme's page: its label/emoji and the resolved rows. */
export interface StudyPage {
  id: string;
  label: string;
  emoji: string;
  rows: StudyRow[];
}

export interface StudyNotepadProps {
  /** The host object — read for geometry/id and for live study state. */
  obj: BoardObjectBase;
  /** Pages to leaf through (already resolved for the pair + direction). */
  pages: StudyPage[];
  /** Accent theme: adds `snote is-<variant>` so the CSS picks the hue. */
  variant: "vocab" | "phrases";
  /** Header emoji/title when no page is open (empty set). */
  headEmojiFallback: string;
  titleFallback: string;
  /** Shown in place of the list when no theme has any rows. */
  emptyText: string;
  /** Analytics tool name for the paging/hide events. */
  tool: string;
}

const revealKey = (pageId: string, i: number): string => `rv:${pageId}:${i}`;

export function StudyNotepad({
  obj,
  pages,
  variant,
  headEmojiFallback,
  titleFallback,
  emptyText,
  tool,
}: StudyNotepadProps) {
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);
  const moveObject = useBoardStore((s) => s.moveObject);
  const pushHistory = useBoardStore((s) => s.pushHistory);

  const rec = obj as unknown as Record<string, unknown>;
  const pageCount = pages.length;
  const pageIdx = clamp((rec.page as number) ?? 0, 0, Math.max(0, pageCount - 1));
  const page = pages[pageIdx];

  // Answers hidden for self-testing? `rgen` bumps on each "Hide" so previously
  // revealed rows fall stale automatically — no need to enumerate/clear keys.
  const hidden = rec.hideAns === 1;
  const rgen = (rec.rgen as number) ?? 0;
  const answerShown = (pageId: string, i: number): boolean =>
    !hidden || rec[revealKey(pageId, i)] === rgen;

  // Any answers on the open page to hide? (No point showing the toggle otherwise.)
  const canHide = useMemo(
    () => pages.some((p) => p.rows.some((r) => r.answer.trim().length > 0)),
    [pages],
  );

  function turn(delta: number) {
    const next = clamp(pageIdx + delta, 0, pageCount - 1);
    if (next === pageIdx) return;
    updateWidgetState(obj.id, { page: next });
    track("tool_action", { tool, action: delta > 0 ? "next" : "prev" });
  }

  function goTo(i: number) {
    if (i === pageIdx) return;
    updateWidgetState(obj.id, { page: i });
    track("tool_action", { tool, action: "jump" });
  }

  function toggleHide() {
    if (hidden) {
      updateWidgetState(obj.id, { hideAns: undefined });
      track("tool_action", { tool, action: "show-answers" });
    } else {
      updateWidgetState(obj.id, { hideAns: 1, rgen: rgen + 1 });
      track("tool_action", { tool, action: "hide-answers" });
    }
  }

  function reveal(pageId: string, i: number) {
    updateWidgetState(obj.id, { [revealKey(pageId, i)]: rgen });
    track("tool_action", { tool, action: "reveal" });
  }

  // --- card drag (a press that isn't on a control/list moves the object) -----
  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, .snote-list")) return;
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
      className={"snote is-" + variant}
      data-id={obj.id}
      style={{ width: obj.w + "px", height: obj.h + "px" }}
      onPointerDown={onCardPointerDown}
    >
      <div className="snote-head" style={{ height: HEAD_H + "px" }}>
        <span className="snote-emoji" aria-hidden>
          {page?.emoji ?? headEmojiFallback}
        </span>
        <span className="snote-title">{page?.label ?? titleFallback}</span>
        {pageCount > 0 && canHide && (
          <button
            className={"snote-hide" + (hidden ? " on" : "")}
            title={hidden ? "Show the answers" : "Hide the answers to test yourself"}
            onClick={toggleHide}
          >
            {hidden ? "Show" : "Hide"}
          </button>
        )}
        {pageCount > 0 && (
          <span className="snote-page-of">
            {pageIdx + 1} / {pageCount}
          </span>
        )}
      </div>

      {pageCount === 0 || !page ? (
        <div className="lf-empty">{emptyText}</div>
      ) : (
        <>
          <ul
            className="snote-list"
            key={pageIdx}
            style={{ height: listH + "px" }}
            onWheel={(e) => e.stopPropagation()}
          >
            {page.rows.map((row, i) => {
              const shown = answerShown(page.id, i);
              return (
                <li className="snote-row" key={i}>
                  {row.emoji && (
                    <span className="snote-row-emoji" aria-hidden>
                      {row.emoji}
                    </span>
                  )}
                  <span className="snote-row-lines">
                    <SpokenWord text={row.lead} code={row.leadCode} className="snote-lead" />
                    {row.leadPhonetic && <span className="snote-phon">{row.leadPhonetic}</span>}
                    {shown ? (
                      <>
                        <SpokenWord
                          text={row.answer}
                          code={row.answerCode}
                          className="snote-answer"
                          icon={false}
                        />
                        {row.answerPhonetic && (
                          <span className="snote-phon snote-phon-a">{row.answerPhonetic}</span>
                        )}
                      </>
                    ) : (
                      <button
                        className="snote-reveal"
                        title="Tap to show the answer"
                        onClick={() => reveal(page.id, i)}
                      >
                        · · ·
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="snote-nav" style={{ height: NAV_H + "px" }}>
            <button
              className="snote-turn"
              onClick={() => turn(-1)}
              disabled={pageIdx === 0}
              title="Previous theme"
              aria-label="Previous theme"
            >
              ‹
            </button>
            <div className="snote-dots" role="tablist" aria-label="Themes">
              {pages.map((p, i) => (
                <button
                  key={p.id}
                  className={"snote-dot" + (i === pageIdx ? " on" : "")}
                  onClick={() => goTo(i)}
                  title={p.label}
                  aria-label={p.label}
                  aria-selected={i === pageIdx}
                  role="tab"
                />
              ))}
            </div>
            <button
              className="snote-turn"
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
