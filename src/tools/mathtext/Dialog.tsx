// Dialog for the maths-notation tool: a LaTeX input with a live KaTeX preview
// (roadmap B1), following the numberline/note dialog conventions.
//
//   - EDIT vs CREATE decided by `initial`; validate on submit, set .err and
//     DO NOT call onSubmit on failure; empty input cancels (like the note).
//   - Submit measures the rendered notation (svg.ts#measureMath) and stores
//     natW/natH alongside the LaTeX, so the tool's size() stays synchronous.
//   - Quick-insert buttons cover the constructs a primary tutor reaches for
//     (fraction, x, /, root, power, pi) so no LaTeX memorisation is needed.
//
// KaTeX itself loads lazily (see loadKatex.ts). The "LaTeX cheat sheet" link
// opens a side drawer (CheatSheet.tsx) whose examples insert at the cursor.

import { useEffect, useRef, useState } from "react";
import type { ToolDialogProps } from "@/tools/registry";
import type { MathTextParams } from "@/tools/mathtext";
import { loadKatex } from "@/tools/mathtext/loadKatex";
import { CheatSheet } from "@/tools/mathtext/CheatSheet";

const tidyErr = (e: unknown): string =>
  e instanceof Error
    ? e.message.replace(/^KaTeX parse error:\s*/, "")
    : "That maths couldn't be read.";

/** caret = where the cursor lands inside the inserted snippet. */
const SNIPPETS = [
  { label: "½", title: "Fraction", snippet: "\\frac{}{}", caret: 6 },
  { label: "×", title: "Times", snippet: "\\times ", caret: 7 },
  { label: "÷", title: "Divide", snippet: "\\div ", caret: 5 },
  { label: "√", title: "Square root", snippet: "\\sqrt{}", caret: 6 },
  { label: "xⁿ", title: "Power", snippet: "^{}", caret: 2 },
  { label: "π", title: "Pi", snippet: "\\pi ", caret: 4 },
];

export function MathTextDialog({
  initial,
  onSubmit,
  onCancel,
}: ToolDialogProps<MathTextParams>) {
  const editing = initial != null;

  const [latex, setLatex] = useState(initial ? initial.latex : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Live preview, debounced a beat so it doesn't churn on every keystroke.
  // throwOnError:false paints broken commands in red inside the preview; the
  // strict parse alongside it feeds the .err line with the actual message.
  useEffect(() => {
    const t = setTimeout(() => {
      void loadKatex().then(({ default: katex }) => {
        const el = previewRef.current;
        if (!el) return;
        const src = latex.trim();
        if (!src) {
          el.innerHTML = "";
          setErr("");
          return;
        }
        katex.render("\\displaystyle " + src, el, {
          throwOnError: false,
          output: "html",
          strict: "ignore",
        });
        try {
          katex.renderToString("\\displaystyle " + src, {
            output: "html",
            strict: "ignore",
          });
          setErr("");
        } catch (e) {
          setErr(tidyErr(e));
        }
      });
    }, 150);
    return () => clearTimeout(t);
  }, [latex]);

  /** Insert at the cursor; `caretAt` = cursor offset within the inserted text. */
  function insertText(text: string, caretAt: number = text.length): void {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? latex.length;
    const end = ta?.selectionEnd ?? latex.length;
    setLatex(latex.slice(0, start) + text + latex.slice(end));
    const caret = start + caretAt;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(caret, caret);
    });
  }

  async function submit(): Promise<void> {
    if (busy) return;
    const trimmed = latex.trim();
    if (!trimmed) {
      onCancel();
      return;
    }
    setBusy(true);
    try {
      const { validateLatex, measureMath } = await import(
        "@/tools/mathtext/svg"
      );
      const problem = await validateLatex(trimmed);
      if (problem) {
        setErr(problem);
        setBusy(false);
        return;
      }
      const { w, h } = await measureMath(trimmed);
      onSubmit({ latex: trimmed, natW: w, natH: h });
    } catch {
      setErr("Something went wrong drawing that maths — try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <h2>{editing ? "Edit maths" : "Maths notation"}</h2>
      <p className="hint">
        Proper fractions, powers and roots — written in LaTeX, e.g.{" "}
        <code>{"\\frac{3}{4}"}</code>. Stuck?{" "}
        <button
          type="button"
          className="linklike"
          onClick={() => setSheetOpen((o) => !o)}
        >
          Open the LaTeX cheat sheet
        </button>
      </p>

      <div style={{ display: "flex", gap: 6, margin: "0 0 8px" }}>
        {SNIPPETS.map((s) => (
          <button
            key={s.label}
            type="button"
            title={s.title}
            onClick={() => insertText(s.snippet, s.caret)}
            style={{
              background: "#F4F6F5",
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <textarea
        id="mtLatex"
        ref={taRef}
        rows={3}
        autoFocus
        placeholder={"\\frac{1}{2} + \\frac{1}{4}"}
        style={{
          width: "100%",
          fontFamily: "ui-monospace, Consolas, monospace",
          fontSize: "15px",
          border: "2px solid #E0E4E2",
          borderRadius: "10px",
          padding: "10px",
          resize: "vertical",
        }}
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
      />

      {/* Fixed-height preview well so the card doesn't jump while typing. */}
      <div
        style={{
          border: "1px solid #E0E4E2",
          borderRadius: 10,
          minHeight: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 10,
          margin: "10px 0 0",
          overflowX: "auto",
          fontSize: 26,
        }}
      >
        <div ref={previewRef} />
      </div>

      <p className="err" id="mtErr">
        {err}
      </p>
      <div className="card-actions">
        <button className="btn" id="mtCancel" onClick={onCancel} disabled={busy}>
          {editing ? "Cancel" : "Back"}
        </button>
        <button
          className="btn primary"
          id="mtAdd"
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy ? "Drawing…" : editing ? "Save" : "Add to board"}
        </button>
      </div>

      {sheetOpen && (
        <CheatSheet
          onPick={(l) => insertText(l)}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
