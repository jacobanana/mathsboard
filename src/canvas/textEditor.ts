// THE IN-PLACE TEXT EDITOR (T6 in docs/canvas-app-architecture.md).
//
// The open/autosize/commit flow for the free-text <textarea> overlay, ported
// verbatim from BoardCanvas (openEditor / autoSize / commitEditor). The host
// keeps the <textarea> element in its JSX and wires its events to this; the
// text interaction controller opens it, and the host guards (pointerdown /
// wheel while editing) commit it.

import { textSizeOf } from "@/canvas/drawHelpers";
import { FONT } from "@/canvas/drawHelpers";
import { scaleOf, sizedBox } from "@/board/sizing";
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
}

export interface TextEditor extends InPlaceEditorHandle {
  /** Re-fit the textarea to its content (wired to the textarea's onInput). */
  autoSize(): void;
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

  const autoSize = (): void => {
    const ta = textarea();
    if (!ta) return;
    ta.style.width = "10px";
    ta.style.height = "10px";
    ta.style.width = ta.scrollWidth + 6 + "px";
    ta.style.height = ta.scrollHeight + "px";
  };

  const open = (obj: AnyBoardObject, isNew: boolean): void => {
    const ta = textarea();
    if (!ta) return;
    const { camera, setEditingId } = store.getState();
    // Recover the uniform resize scale (stored box vs. natural text box) so the
    // textarea renders at the same size as the committed text on the canvas.
    const s = scaleOf(obj);
    editor = { objId: obj.id, isNew, scale: s };
    setEditingId(obj.id); // hides obj from the scene's draw pass
    render();
    const sx = obj.x * camera.scale + camera.x;
    const sy = obj.y * camera.scale + camera.y;
    const fontPx = (obj.size as number) * s * camera.scale;
    ta.style.display = "block";
    ta.style.font = "500 " + fontPx + "px " + FONT;
    // The `font` shorthand resets line-height to `normal`; pin it to 1.3 so the
    // editor's line spacing matches the canvas render (drawText uses size*1.3).
    ta.style.lineHeight = "1.3";
    ta.style.color = obj.color as string;
    // Place the textarea so its glyphs land exactly where the committed text
    // renders. The canvas draws with textBaseline "top" flush at (obj.x, obj.y)
    // — no leading, no inset. The textarea instead pushes its first line down by
    // its 1px top border plus the line-box leading and font-ascent gap the
    // browser reserves above the first line (measured at ~0.265 of the font
    // size for our UI font). Horizontally it insets text by 1px border + 2px
    // padding. Compensate both so text doesn't shift when you start/stop
    // editing.
    ta.style.left = sx - 3 + "px";
    ta.style.top = sy - 1 - 0.265 * fontPx + "px";
    ta.value = (obj.text as string) || "";
    autoSize();
    setTimeout(() => {
      ta.focus();
      ta.select();
    }, 0);
  };

  const commit = (): void => {
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
    // Keep any resize scale across the edit; the box is the new natural size
    // at that same scale (board/sizing.ts is the one authority for this).
    const box =
      sizedBox("text", { text, size }, ed.scale ?? 1) ?? textSizeOf(text, size);
    st.updateObject(obj.id, { text, w: box.w, h: box.h });
    render();
  };

  return {
    open,
    commit,
    autoSize,
    isOpen: () => editor != null,
  };
}
