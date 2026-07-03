// Image tool: places an uploaded picture on the board.
//
// The shape stores ONLY { url, natW, natH } - the binary lives in S3 (uploaded
// through /api/upload; see src/collab/upload.ts), keeping big blobs out of the
// CRDT document. natW/natH are the intrinsic pixel dimensions, used as the
// natural size so the standard uniform-resize machinery applies.

import { defineCanvasTool } from "@/tools/registry";
import { getImageEl, imageState } from "@/tools/image/cache";
import { ImageDialog } from "@/tools/image/Dialog";

export interface ImageParams {
  /** Same-origin asset URL (e.g. /api/img/<key>) - never a data: blob. */
  url: string;
  /** Intrinsic bitmap size in px. */
  natW: number;
  natH: number;
}

/** Cap the initial on-board size; the user can resize afterwards. */
const MAX_W = 480;
const MAX_H = 380;

export const imageTool = defineCanvasTool<ImageParams>({
  kind: "canvas",
  type: "image",
  name: "Picture",
  blurb: "photo · diagram · scan",
  category: "media",

  defaults: () => ({ url: "", natW: 4, natH: 3 }),

  size: (p) => {
    const s = Math.min(1, MAX_W / (p.natW || 1), MAX_H / (p.natH || 1));
    return {
      w: Math.max(24, Math.round(p.natW * s)),
      h: Math.max(24, Math.round(p.natH * s)),
    };
  },

  draw: ({ ctx, theme, font }, o) => {
    const img = getImageEl(o.url);
    if (img) {
      ctx.drawImage(img, o.x, o.y, o.w, o.h);
      return;
    }
    // Placeholder while loading / when the asset is unreachable.
    const failed = imageState(o.url) === "error";
    ctx.save();
    ctx.fillStyle = "#F4F6F5";
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(o.x, o.y, o.w, o.h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.font = "600 15px " + font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      failed ? "Picture unavailable" : "Loading picture…",
      o.x + o.w / 2,
      o.y + o.h / 2,
      o.w - 16,
    );
    ctx.restore();
  },

  Dialog: ImageDialog,
});

export default imageTool;
