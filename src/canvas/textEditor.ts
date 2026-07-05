// THE IN-PLACE TEXT EDITOR (T6 in docs/canvas-app-architecture.md).
//
// The open/autosize/commit flow for the free-text <textarea> overlay. The host
// keeps the <textarea> element in its JSX and wires its events to this; the text
// interaction controller opens it, and the host guards (pointerdown / wheel
// while editing) commit it.
//
// STAYS OPEN WHILE RESTYLING. Changing the text's own options (size / colour /
// alignment) must NOT end the edit — the editor subscribes to the store and
// re-applies the live textarea's styling whenever the object being edited
// changes, so the change shows immediately without losing focus. The options
// pill keeps focus on the textarea (its buttons cancel the blur; the size slider
// re-focuses via focusActiveTextEdit); only leaving the whole edit zone commits.

import { textSizeOf } from "@/canvas/drawHelpers";
import { FONT } from "@/canvas/drawHelpers";
import { scaleOf, sizedBox } from "@/board/sizing";
import { track, trackBoardActivated } from "@/analytics";
import type { useBoardStore } from "@/board/store";
import type { AnyBoardObject } from "@/board/types";
import type { InPlaceEditorHandle } from "@/canvas/interactions/types";

/** The active in-place text edit: which object, its pre-edit snapshot flag, and
 *  the uniform scale a resize applied to it (so the textarea matches the
 *  on-canvas font size and the scale survives the edit). */
interface Editor {
  objId: string;
  isNew: boolean;
  scale: number;
  /** Fixed wrap width (natural px) for a text BOX; null = auto-size the width. */
  boxW: number | null;
  /** The text the edit started from, so commit can tell created / edited /
   *  untouched apart (the same policy as the maths editor). */
  initialText: string;
}

export interface TextEditor extends InPlaceEditorHandle {
  /** Re-fit the textarea to its content (wired to the textarea's onInput). */
  autoSize(): void;
  /** Return focus to the open textarea (used after a size-slider drag, which
   *  the browser gives focus to). No-op when not editing. */
  focus(): void;
}

/** The one live text editor, so UI outside the canvas host (the options pill's
 *  size slider) can hand focus back to the textarea after operating a control
 *  that the browser focuses. There is a single BoardCanvas / textarea. */
let active: TextEditor | null = null;

/** Return focus to the in-place text editor, if one is open. */
export function focusActiveTextEdit(): void {
  active?.focus();
}

export function createTextEditor(opts: {
  textarea(): HTMLTextAreaElement | null;
  store: typeof useBoardStore;
  /** SYNCHRONOUS scene redraw. Open/commit repaint in the same tick so the
   *  hidden/re-shown text never double-exposes for a frame. */
  render(): void;
}): TextEditor {
  const { textarea, store, render } = opts;
  let editor: Editor | null = null;
  let unsubscribe: (() => void) | null = null;
  let lastSig = "";

  const autoSize = (): void => {
    const ta = textarea();
    if (!ta) return;
    // A text BOX keeps the width its drag set (wrap width fixed by applyStyle);
    // only the height tracks the content. Auto text grows in both directions.
    if (editor?.boxW == null) {
      ta.style.width = "10px";
      ta.style.width = ta.scrollWidth + 6 + "px";
    }
    ta.style.height = "10px";
    ta.style.height = ta.scrollHeight + "px";
  };

  /** Position + style the textarea to match how `obj` renders on the canvas.
   *  Also refreshes the edit's live scale/boxW (a size change resets the scale),
   *  so commit derives the box from the current values. Does NOT touch focus,
   *  the caret or the value — safe to re-run live while the user is typing. */
  const applyStyle = (ta: HTMLTextAreaElement, obj: AnyBoardObject): void => {
    const { camera } = store.getState();
    const s = scaleOf(obj);
    const boxW = (obj.boxW as number | undefined) ?? null;
    if (editor) {
      editor.scale = s;
      editor.boxW = boxW;
    }
    const fontPx = (obj.size as number) * s * camera.scale;
    ta.style.font = "500 " + fontPx + "px " + FONT;
    // The `font` shorthand resets line-height to `normal`; pin it to 1.3 so the
    // editor's line spacing matches the canvas render (drawText uses size*1.3).
    ta.style.lineHeight = "1.3";
    ta.style.color = obj.color as string;
    ta.style.textAlign = (((obj.align as string) ?? "left") as CanvasTextAlign);
    // A box wraps at a fixed screen width (+6 for the 1px border + 2px padding
    // each side, so the wrap column matches the canvas); auto text does not wrap.
    if (boxW != null) {
      ta.style.whiteSpace = "pre-wrap";
      ta.style.width = boxW * s * camera.scale + 6 + "px";
    } else {
      ta.style.whiteSpace = "pre";
    }
    // Place the textarea so its glyphs land exactly where the committed text
    // renders. The canvas draws with textBaseline "top" flush at (obj.x, obj.y)
    // — no leading, no inset. The textarea instead pushes its first line down by
    // its 1px top border plus the line-box leading and font-ascent gap the
    // browser reserves above the first line (measured at ~0.265 of the font size
    // for our UI font). Horizontally it insets text by 1px border + 2px padding.
    // Compensate both so text doesn't shift when you start/stop editing.
    const sx = obj.x * camera.scale + camera.x;
    const sy = obj.y * camera.scale + camera.y;
    ta.style.left = sx - 3 + "px";
    ta.style.top = sy - 1 - 0.265 * fontPx + "px";
  };

  /** Signature of everything applyStyle depends on, to skip redundant re-styles. */
  const sigOf = (obj: AnyBoardObject): string => {
    const c = store.getState().camera;
    return [
      obj.size,
      obj.color,
      obj.align,
      obj.boxW,
      obj.x,
      obj.y,
      c.scale,
      c.x,
      c.y,
    ].join("|");
  };

  /** Re-apply the live textarea's styling from the object being edited (called
   *  when the options pill changes size / colour / alignment mid-edit). */
  const restyle = (): void => {
    const ta = textarea();
    if (!editor || !ta) return;
    const obj = store.getState().board.objects.find((o) => o.id === editor!.objId);
    if (!obj) return;
    const sig = sigOf(obj);
    if (sig === lastSig) return;
    lastSig = sig;
    applyStyle(ta, obj);
    autoSize();
  };

  const open = (obj: AnyBoardObject, isNew: boolean): void => {
    const ta = textarea();
    if (!ta) return;
    unsubscribe?.(); // defensive: never stack subscriptions
    const { setEditingId } = store.getState();
    const s = scaleOf(obj);
    const boxW = (obj.boxW as number | undefined) ?? null;
    editor = {
      objId: obj.id,
      isNew,
      scale: s,
      boxW,
      initialText: (obj.text as string) || "",
    };
    setEditingId(obj.id); // hides obj from the scene's draw pass
    render();
    ta.style.display = "block";
    applyStyle(ta, obj);
    lastSig = sigOf(obj);
    ta.value = (obj.text as string) || "";
    autoSize();
    // Keep the textarea in sync while the options pill restyles the object.
    unsubscribe = store.subscribe(() => restyle());
    setTimeout(() => {
      ta.focus();
      ta.select();
    }, 0);
  };

  const commit = (): void => {
    unsubscribe?.();
    unsubscribe = null;
    const ed = editor;
    const ta = textarea();
    if (!ed || !ta) return;
    editor = null;
    const st = store.getState();
    const obj = st.board.objects.find((o) => o.id === ed.objId);
    ta.style.display = "none";
    ta.blur();
    const text = ta.value.replace(/[ \t]+$/g, "");
    st.setEditingId(null);

    if (!obj) {
      render();
      return;
    }
    if (!text.trim()) {
      // Empty -> remove. For a brand-new object that was never committed, the
      // create snapshot was pushed by addObject; removeObject pushes its own.
      st.removeObject(obj.id);
      render();
      return;
    }
    const size = (obj.size as number) ?? 26;
    const boxW = obj.boxW as number | undefined;
    // Keep any resize scale across the edit; the box is the new natural size
    // at that same scale (board/sizing.ts is the one authority for this). boxW
    // keeps the text wrapping to the dragged width instead of hugging the text.
    const box =
      sizedBox("text", { text, size, boxW }, ed.scale ?? 1) ??
      textSizeOf(text, size, boxW);
    st.updateObject(obj.id, { text, w: box.w, h: box.h });
    // Analytics follow the maths editor's policy: a tool creation counts on
    // its first non-empty commit (abandoned empties stay invisible), an edit
    // only when the text actually changed.
    if (ed.isNew) {
      track("tool_action", { tool: "text", action: "created" });
      trackBoardActivated(st.board.id);
    } else if (text !== ed.initialText) {
      track("tool_action", { tool: "text", action: "edited" });
    }
    render();
  };

  const focus = (): void => {
    const ta = textarea();
    if (editor && ta) ta.focus();
  };

  const handle: TextEditor = {
    open,
    commit,
    autoSize,
    focus,
    isOpen: () => editor != null,
  };
  active = handle;
  return handle;
}
