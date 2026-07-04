// The LaTeX cheat-sheet drawer: a right-hand panel listing the notation a
// primary tutor actually reaches for, with every example rendered by KaTeX
// itself. Clicking an example inserts its LaTeX into the dialog's input
// (onPick) — the drawer stays open so it can be read while typing.
//
// Rendered through a portal so it sits BESIDE the modal .card, not inside it:
// z-index 50 puts it above the #scrim (40) and below the toasts (60). There is
// deliberately no backdrop — the dialog stays fully interactive alongside it.
// Escape is intercepted on the window CAPTURE phase and consumed, so it closes
// just the drawer: the Modal shell's own bubble-phase Escape handler skips
// events marked defaultPrevented (see ui/Modal.tsx).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { loadKatex } from "@/tools/mathtext/loadKatex";

interface Row {
  latex: string;
  note?: string;
}
interface Group {
  title: string;
  rows: Row[];
}

const GROUPS: Group[] = [
  {
    title: "Fractions",
    rows: [
      { latex: "\\frac{3}{4}", note: "fraction" },
      { latex: "3\\tfrac{1}{2}", note: "mixed number" },
    ],
  },
  {
    title: "Multiply & divide",
    rows: [{ latex: "12 \\times 3" }, { latex: "12 \\div 3" }],
  },
  {
    title: "Powers & roots",
    rows: [
      { latex: "2^{5}", note: "power" },
      { latex: "\\sqrt{81}", note: "square root" },
      { latex: "\\sqrt[3]{27}", note: "cube root" },
    ],
  },
  {
    title: "Comparing",
    rows: [
      { latex: "7 \\ne 8", note: "not equal" },
      { latex: "x \\le 10", note: "less or equal" },
      { latex: "x \\ge 10", note: "greater or equal" },
      { latex: "\\pi \\approx 3.14", note: "roughly equal" },
    ],
  },
  {
    title: "Symbols & units",
    rows: [
      { latex: "90^\\circ", note: "degrees" },
      { latex: "50\\%", note: "percent needs \\" },
      { latex: "0.\\dot{3}", note: "recurring" },
      { latex: "5\\,\\text{cm}", note: "upright words" },
    ],
  },
];

export interface CheatSheetProps {
  /** Insert this LaTeX into the dialog's input at the cursor. */
  onPick: (latex: string) => void;
  onClose: () => void;
}

export function CheatSheet({ onPick, onClose }: CheatSheetProps) {
  const [katex, setKatex] = useState<
    (typeof import("katex"))["default"] | null
  >(null);

  useEffect(() => {
    let live = true;
    void loadKatex().then((m) => {
      if (live) setKatex(m.default);
    });
    return () => {
      live = false;
    };
  }, []);

  // Escape closes only the drawer (capture phase beats the modal shell).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Our own constant strings through KaTeX — safe for innerHTML.
  const tex = (src: string) => ({
    __html: katex
      ? katex.renderToString(src, { throwOnError: false, output: "html" })
      : "",
  });

  return createPortal(
    <aside className="cheat-drawer" role="dialog" aria-label="LaTeX cheat sheet">
      <div className="cheat-head">
        <h3>LaTeX cheat sheet</h3>
        <button
          type="button"
          className="cheat-close"
          aria-label="Close cheat sheet"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="cheat-tip">
        Click a line to add it to your maths. Group things with{" "}
        <code>{"{ }"}</code>; spaces don’t matter; plain letters come out
        italic, like algebra.
      </p>
      {GROUPS.map((g) => (
        <section key={g.title}>
          <div className="cheat-sub">{g.title}</div>
          {g.rows.map((r) => (
            <button
              key={r.latex}
              type="button"
              className="cheat-row"
              onClick={() => onPick(r.latex)}
            >
              <code>{r.latex}</code>
              <span className="cheat-eq" dangerouslySetInnerHTML={tex(r.latex)} />
              {r.note && <span className="cheat-note">{r.note}</span>}
            </button>
          ))}
        </section>
      ))}
    </aside>,
    document.body,
  );
}
