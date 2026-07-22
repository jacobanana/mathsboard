// The shared "theme + level" picker rendered inside every language tool dialog.
// Presentational: it reflects a ContentPicker (see contentPicker.ts). Levels the
// current theme can't offer are disabled; "Mixed" (all levels) is always there.

import { LEVELS, LEVEL_LABEL } from "@/lang/data";
import type { ContentPicker } from "@/lang/contentPicker";

export function CategoryLevelPicker({ picker }: { picker: ContentPicker }): JSX.Element {
  const { category, level, categories, availableLevels, setCategory, setLevel } = picker;
  return (
    <>
      <div className="field">
        <label>Theme</label>
        <div className="flash-opts">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={"flash-opt" + (category === c.id ? " active" : "")}
              onClick={() => setCategory(c.id)}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Level</label>
        <div className="flash-opts">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={!availableLevels.includes(l)}
              className={"flash-opt" + (level === l ? " active" : "")}
              onClick={() => setLevel(l)}
            >
              {LEVEL_LABEL[l]}
            </button>
          ))}
          <button
            type="button"
            className={"flash-opt" + (level === "mixed" ? " active" : "")}
            onClick={() => setLevel("mixed")}
          >
            Mixed
          </button>
        </div>
      </div>
    </>
  );
}
