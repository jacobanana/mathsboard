// CanvasTool (canvas + dialog) — the "Problem card" / word-problem note.
//
// Ported from maths-whiteboard.html:
//   size:   line 219  (objSize case 'note' -> noteSize(p.text))
//   draw:   line 289  (drawNote)
//   dialog: lines 571-576 (noteDialog) -> ./Dialog.tsx
//
// draw() renders in world space (camera transform already applied). Literal hex
// from the prototype stays literal; css('--x') tokens map to theme tokens.

import { defineCanvasTool } from "@/tools/registry";
import {
  roundRect,
  wrapText,
  noteSize,
  fillPanel,
  CARD_PAD,
  CARD_RADIUS,
} from "@/canvas/drawHelpers";
import { NoteDialog } from "@/tools/note/Dialog";

/** The problem card's warm paper — its word-problem identity, distinct from the
 *  white maths panels but sharing the same card shape / border / lift. */
const NOTE_PAPER = "#FFFDF6";

export interface NoteParams {
  text: string;
}

export default defineCanvasTool<NoteParams>({
  kind: "canvas",
  type: "note",
  name: "Problem card",
  blurb: "type the question",
  category: "word",

  defaults: () => ({ text: "" }),

  size: (p) => noteSize(p.text),

  draw: ({ ctx, theme, font }, o) => {
    const padX = 18;
    const padY = 18;
    const noteFont = "500 17px " + font;
    const lh = 24;
    const maxW = o.w - padX * 2 - 10;
    const lines = wrapText(ctx, o.text || "", maxW, noteFont);
    ctx.save();
    // Same card shape / border / soft lift as the maths panels, on warm paper.
    fillPanel(ctx, o, NOTE_PAPER);
    // Accent spine down the left edge, clipped to the card's rounded corners.
    const cx = o.x - CARD_PAD,
      cy = o.y - CARD_PAD,
      cw = o.w + CARD_PAD * 2,
      ch = o.h + CARD_PAD * 2;
    ctx.save();
    roundRect(ctx, cx, cy, cw, ch, CARD_RADIUS);
    ctx.clip();
    ctx.fillStyle = theme.accent;
    ctx.fillRect(cx, cy, 8, ch);
    ctx.restore();
    ctx.fillStyle = theme.muted;
    ctx.font = "700 11px " + font;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("WORD PROBLEM", o.x + padX, o.y + padY - 2);
    ctx.fillStyle = theme.ink;
    ctx.font = noteFont;
    lines.forEach((ln, i) =>
      ctx.fillText(ln, o.x + padX, o.y + padY + 22 + i * lh),
    );
    ctx.restore();
  },

  Dialog: NoteDialog,
});
