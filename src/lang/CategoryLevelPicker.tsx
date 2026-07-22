// The shared "theme + level" picker rendered inside every language tool dialog.
// Presentational: it reflects a ContentPicker (see contentPicker.ts). Themes are
// a MULTI-select dropdown (choose one or several); level is a dropdown whose
// options a theme can't offer are disabled. "Mixed" means every level.

import { LEVELS, LEVEL_LABEL } from "@/lang/data";
import { MultiSelect } from "@/lang/MultiSelect";
import type { ContentPicker } from "@/lang/contentPicker";
import type { LevelFilter } from "@/lang/pairs";

export function CategoryLevelPicker({ picker }: { picker: ContentPicker }): JSX.Element {
  const { selected, level, categories, availableLevels, toggleCategory, setLevel } = picker;
  return (
    <>
      <div className="field">
        <label>Themes</label>
        <MultiSelect
          options={categories.map((c) => ({ id: c.id, label: `${c.emoji} ${c.label}` }))}
          selected={selected}
          onToggle={toggleCategory}
          placeholder="Choose a theme…"
        />
      </div>

      <div className="field">
        <label htmlFor="clpLevel">Level</label>
        <select
          id="clpLevel"
          className="lang-select"
          value={level}
          onChange={(e) => setLevel(e.target.value as LevelFilter)}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l} disabled={!availableLevels.includes(l)}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
          <option value="mixed">Mixed (all levels)</option>
        </select>
      </div>
    </>
  );
}
