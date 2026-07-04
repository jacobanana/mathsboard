// THE IN-PLACE MATHS EDITOR — the maths twin of canvas/textEditor.ts.
//
// The "math" dock tool creates and edits maths-notation objects DIRECTLY on
// the board, like free text — no modal. The overlay is a MathLive
// <math-field> with the on-screen maths keyboard shown by default (so nobody
// needs to know LaTeX), plus a small VISUAL / LATEX toggle that swaps the
// field for a raw-LaTeX <textarea>. Both modes read and write the SAME stored
// object format the old dialog produced: { latex, natW, natH } — boards saved
// before this editor existed load unchanged, and vice versa.
//
// MathLive is heavy (~0.5 MB gz + fonts), so it is ONLY ever loaded lazily:
// prewarmMathEditor() kicks the download the moment the maths tool is picked
// (BoardCanvas watches the tool), and open() awaits it, showing a hint in the
// overlay on a cold start. The KaTeX measure pipeline (tools/mathtext/svg.ts)
// is prewarmed alongside so commit isn't the first thing to pay for it.
//
// COMMIT is split in two on purpose. The host guards (pointerdown / wheel)
// call commit() synchronously and the next interaction must not see a
// half-open editor — so commit hides the overlay, clears editingId and
// resolves the final LaTeX immediately. But the natural size (natW/natH)
// comes from the async KaTeX measure, so a detached task measures and then
// writes params + box through ONE updateObject (one undo step). In the beat
// between the two, the object paints its own "Drawing maths…" placeholder.

import { scaleOf, sizedBox } from "@/board/sizing";
import { MATH_BASE_PX } from "@/tools/mathtext";
import { theme } from "@/styles/theme";
import { track, trackBoardActivated } from "@/analytics";
import type { useBoardStore } from "@/board/store";
import type { AnyBoardObject } from "@/board/types";
import type { InPlaceEditorHandle } from "@/canvas/interactions/types";
import type { MathfieldElement } from "mathlive";

type MathliveModule = typeof import("mathlive");
let mathlive: Promise<MathliveModule> | null = null;

function loadMathlive(): Promise<MathliveModule> {
  mathlive ??= Promise.all([
    import("mathlive"),
    // The @font-face sheet for MathLive's maths fonts; Vite bundles the woff2s
    // it references. Without it the field lays out in fallback fonts.
    import("mathlive/fonts.css"),
  ]).then(([m]) => {
    // Both statics must be set before the first <math-field> initialises:
    // fonts come from the stylesheet above (no runtime fetch), sounds are off.
    m.MathfieldElement.fontsDirectory = null;
    m.MathfieldElement.soundsDirectory = null;
    return m;
  });
  return mathlive;
}

/** Start downloading MathLive + the KaTeX measure pipeline in the background.
 *  Called when the maths tool is picked so the first tap opens instantly. */
export function prewarmMathEditor(): void {
  void loadMathlive();
  void import("@/tools/mathtext/svg");
}

/** The active in-place maths edit. The object's uniform resize scale is NOT
 *  captured here: commit reads it fresh (scaleOf) so a size-option change
 *  made mid-edit survives into the committed box. */
interface Session {
  objId: string;
  isNew: boolean;
  initialLatex: string;
  mode: "visual" | "latex";
  /** MathLive finished loading and the field holds the object's LaTeX. Until
   *  then a commit is a no-op cancel — nothing could have been typed yet. */
  ready: boolean;
}

export function createMathEditor(opts: {
  /** The #mathEditor overlay div (owned by BoardCanvas's JSX). */
  host(): HTMLDivElement | null;
  store: typeof useBoardStore;
  /** Synchronous scene redraw, same contract as the text editor's. */
  render(): void;
}): InPlaceEditorHandle {
  const { host, store, render } = opts;

  let session: Session | null = null;

  // The plain-DOM chrome (textarea + toggle) is built once and re-parented on
  // every open. The <math-field> is created FRESH per open instead: MathLive
  // tears the element down asynchronously on disconnect, so a reused field
  // that is re-connected right after a commit can lose the value set on it.
  let mf: MathfieldElement | null = null;
  let ta: HTMLTextAreaElement | null = null;
  let toggle: HTMLDivElement | null = null;
  let loadingHint: HTMLSpanElement | null = null;

  const autoSizeTa = (): void => {
    if (!ta) return;
    ta.style.width = "10px";
    ta.style.height = "10px";
    ta.style.width = Math.max(240, ta.scrollWidth + 6) + "px";
    ta.style.height = ta.scrollHeight + "px";
  };

  /** Swap between the MathLive field and the raw-LaTeX textarea, carrying the
   *  current value across. The maths keyboard only lives in visual mode. */
  const setMode = (mode: "visual" | "latex"): void => {
    const h = host();
    if (!session || !mf || !ta || !h) return;
    if (session.mode !== mode) {
      if (mode === "latex") ta.value = mf.getValue("latex");
      else mf.setValue(ta.value);
      session.mode = mode;
    }
    h.dataset.mode = mode; // CSS shows one editor, hides the other
    toggle?.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    // Focus is DEFERRED (like the text editor's open): hiding the previously
    // focused input makes the browser bounce focus to <body> after this
    // handler returns, which would silently swallow a synchronous .focus().
    // Each callback is session-guarded so a commit landing inside the timeout
    // can't refocus a dead overlay or resurrect the maths keyboard.
    const sess = session;
    if (mode === "visual") {
      const f = mf;
      setTimeout(() => {
        if (session !== sess) return;
        f.focus();
        window.mathVirtualKeyboard?.show();
      }, 0);
    } else {
      window.mathVirtualKeyboard?.hide();
      autoSizeTa();
      const f = ta;
      setTimeout(() => {
        if (session !== sess) return;
        f.focus();
        f.setSelectionRange(f.value.length, f.value.length);
      }, 0);
    }
  };

  const buildChrome = (): void => {
    if (ta) return;
    ta = document.createElement("textarea");
    ta.id = "mathLatexInput";
    ta.spellcheck = false;
    ta.placeholder = "\\frac{1}{2} + \\frac{1}{4}";
    ta.addEventListener("input", autoSizeTa);

    toggle = document.createElement("div");
    toggle.id = "mathModeToggle";
    for (const [mode, label, title] of [
      ["visual", "Keyboard", "Edit with the maths keyboard"],
      ["latex", "LaTeX", "Edit the raw LaTeX"],
    ] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.mode = mode;
      b.textContent = label;
      b.title = title;
      // pointerdown would steal focus from the field before click runs (and
      // flicker the maths keyboard); keep focus where it is.
      b.addEventListener("pointerdown", (e) => e.preventDefault());
      b.addEventListener("click", () => setMode(mode));
      toggle!.appendChild(b);
    }
  };

  const open = (obj: AnyBoardObject, isNew: boolean): void => {
    if (session) commit(); // defensive; host guards commit before re-entry
    const h = host();
    if (!h) return;
    const st = store.getState();
    const { camera } = st;

    // natW -> the drawn font size: draw() paints the natW-wide layout into the
    // object's (possibly resized) box, so the on-screen glyph size is
    // BASE * w/natW * zoom. Matching it keeps open/commit visually seamless.
    const natW = (obj.natW as number) || 0;
    const drawScale = natW > 0 ? obj.w / natW : 1;
    const sx = obj.x * camera.scale + camera.x;
    const sy = obj.y * camera.scale + camera.y;

    const mySession: Session = {
      objId: obj.id,
      isNew,
      initialLatex: ((obj.latex as string) ?? "").trim(),
      mode: "visual",
      ready: false,
    };
    session = mySession;
    st.setEditingId(obj.id); // hides the object from the scene's draw pass
    render();

    h.style.left = sx + "px";
    h.style.top = sy + "px";
    h.style.fontSize = Math.max(12, MATH_BASE_PX * drawScale * camera.scale) + "px";
    // The field's glyphs inherit currentColor, so the overlay previews the
    // object's colour (legacy objects predate the field — ink).
    h.style.color = (obj.color as string) || theme.ink;
    // The mode toggle floats above the field; flip it below when the object
    // sits too close to the top of the stage to fit it.
    h.classList.toggle("flip", sy < 64);
    h.classList.add("open");
    delete h.dataset.mode;
    loadingHint ??= Object.assign(document.createElement("span"), {
      className: "math-loading",
      textContent: "Loading maths keyboard…",
    });
    h.replaceChildren(loadingHint); // visible only on a cold start

    void loadMathlive().then((M) => {
      // Commit/reopen may have won the race while MathLive downloaded.
      if (session !== mySession) return;
      buildChrome();
      mf = new M.MathfieldElement();
      mf.id = "mathField";
      // The keyboard is OURS to show/hide (shown on open, hidden on commit) —
      // "auto" would only show it for touch devices.
      mf.mathVirtualKeyboardPolicy = "manual";
      host()?.replaceChildren(toggle!, mf, ta!);
      // Both of these need a MOUNTED field (menuItems even throws before):
      // no right-click menu — the toggle strip is the only chrome.
      mf.menuItems = [];
      mf.value = mySession.initialLatex;
      mySession.ready = true;
      setMode("visual");
    });
  };

  const commit = (): void => {
    const s = session;
    if (!s) return;
    session = null;
    // Read the value BEFORE tearing the overlay down: disconnecting a
    // MathfieldElement (replaceChildren below) disposes its engine and drops
    // its value. Not ready = MathLive never finished loading, so nothing was
    // typed — fall back to the LaTeX the edit started from.
    const latex = !s.ready
      ? s.initialLatex
      : (s.mode === "latex"
          ? ta!.value
          : // placeholders are MathLive's empty-slot markers (unknown to
            // KaTeX); this format strips them to plain {} groups.
            mf!.getValue("latex-without-placeholders")
        ).trim();
    const h = host();
    const st = store.getState();
    h?.classList.remove("open");
    h?.replaceChildren();
    mf = null; // disposed with the teardown; every open creates a fresh field
    window.mathVirtualKeyboard?.hide();
    if (st.editingId === s.objId) st.setEditingId(null);

    const obj = st.board.objects.find((o) => o.id === s.objId);
    if (!obj) {
      render();
      return;
    }
    if (!latex) {
      st.removeObject(s.objId);
      render();
      return;
    }
    render();
    if (latex === s.initialLatex && !s.isNew) return; // untouched — no write

    // The object's CURRENT uniform resize scale (vs the CAPPED natural size —
    // sizedBox measures against the same cap, or big formulas would shrink on
    // every edit). Read now, not at open, so a size-option change made while
    // the editor was up carries into the new box.
    const scale = scaleOf(obj);

    // Detached: measure the new layout, then write params + box in one step.
    void (async () => {
      const cur = store.getState;
      try {
        const { measureMath } = await import("@/tools/mathtext/svg");
        const { w, h: mh } = await measureMath(latex);
        if (!cur().board.objects.some((o) => o.id === s.objId)) return; // undone
        const params = { latex, natW: w, natH: mh };
        const box = sizedBox("mathtext", params, scale) ?? { w, h: mh };
        cur().updateObject(s.objId, { ...params, w: box.w, h: box.h });
      } catch {
        // Measurement failed (KaTeX unreachable?) — keep the typed LaTeX at
        // the old box rather than losing the work; draw() shows a placeholder.
        if (cur().board.objects.some((o) => o.id === s.objId))
          cur().updateObject(s.objId, { latex });
      }
      if (s.isNew) {
        track("tool_action", { tool: "mathtext", action: "created" });
        trackBoardActivated(cur().board.id);
      } else {
        track("tool_action", { tool: "mathtext", action: "edited" });
      }
    })();
  };

  return {
    open,
    commit,
    isOpen: () => session != null,
  };
}
