// A compact multi-select dropdown: a button showing the current choices that
// opens a checkbox panel. Used for the theme picker (choose one OR several
// themes) in the language tool dialogs.

import { useEffect, useRef, useState } from "react";

export interface MultiOption {
  id: string;
  label: string;
}

export function MultiSelect({
  options,
  selected,
  onToggle,
  placeholder = "Choose…",
}: {
  options: MultiOption[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close when clicking outside the control.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const chosen = options.filter((o) => selected.includes(o.id));
  const summary =
    chosen.length === 0
      ? placeholder
      : chosen.length <= 2
        ? chosen.map((o) => o.label).join(", ")
        : `${chosen[0].label} +${chosen.length - 1} more`;

  return (
    <div className={"ms" + (open ? " open" : "")} ref={ref}>
      <button type="button" className="ms-btn" onClick={() => setOpen((o) => !o)}>
        <span className="ms-val">{summary}</span>
        <span className="ms-caret" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="ms-panel" role="listbox" aria-multiselectable>
          {options.map((o) => {
            const on = selected.includes(o.id);
            return (
              <label key={o.id} className={"ms-opt" + (on ? " on" : "")}>
                <input type="checkbox" checked={on} onChange={() => onToggle(o.id)} />
                <span>{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
