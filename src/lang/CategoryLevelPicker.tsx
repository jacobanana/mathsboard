// The shared "theme + level" picker rendered inside every language tool dialog.
// Presentational: it reflects a ContentPicker (see contentPicker.ts). Themes are
// chosen from a multi-select dropdown — SEVERAL can be picked at once — and the
// level from a plain dropdown, with levels the chosen themes can't offer
// disabled. "Mixed" (all levels) is always available.

import { useEffect, useRef, useState } from "react";
import { LEVELS, LEVEL_LABEL } from "@/lang/data";
import type { ContentPicker } from "@/lang/contentPicker";

export function CategoryLevelPicker({ picker }: { picker: ContentPicker }): JSX.Element {
  return (
    <>
      <div className="field">
        <label>Themes</label>
        <ThemeDropdown picker={picker} />
      </div>

      <div className="field">
        <label htmlFor="clpLevel">Level</label>
        <select
          id="clpLevel"
          value={picker.level}
          onChange={(e) => picker.setLevel(e.target.value as ContentPicker["level"])}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l} disabled={!picker.availableLevels.includes(l)}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
          <option value="mixed">Mixed</option>
        </select>
      </div>
    </>
  );
}

/** A dropdown of theme checkboxes: pick one or several. Its button summarises
 *  the current choice; clicking outside (or pressing Escape) closes it. */
function ThemeDropdown({ picker }: { picker: ContentPicker }): JSX.Element {
  const { selected, categories, toggle } = picker;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chosen = categories.filter((c) => selected.includes(c.id));
  const summary =
    chosen.length === 0
      ? "Choose themes"
      : chosen.length === 1
        ? `${chosen[0].emoji} ${chosen[0].label}`
        : `${chosen.length} themes`;

  return (
    <div className="theme-select" ref={ref}>
      <button
        type="button"
        className="theme-select-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="theme-select-label">{summary}</span>
        <span className="theme-select-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="theme-menu" role="listbox">
          {categories.map((c) => {
            const on = selected.includes(c.id);
            // Don't let the learner untick the last remaining theme.
            const locked = on && selected.length === 1;
            return (
              <label key={c.id} className={"theme-opt" + (on ? " on" : "")}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={locked}
                  onChange={() => toggle(c.id)}
                />
                <span className="theme-opt-emoji" aria-hidden>
                  {c.emoji}
                </span>
                <span className="theme-opt-label">{c.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
