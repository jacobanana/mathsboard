// THE SINGLE SIZING AUTHORITY (T3 in docs/canvas-app-architecture.md).
//
// Every "how big is this object" question routes through here, so the
// scale-preserving box maths exists exactly once. The invariant it encodes:
// an object's stored box (w/h) is its tool's NATURAL size for its params,
// uniformly scaled by whatever resize the user applied. Editing params must
// re-derive the box from the NEW natural size at the SAME scale, or the
// widget snaps back to 1x.

import { getTool } from "@/tools/registry";
import type { CanvasTool, WidgetTool } from "@/tools/registry";
import type { AnyBoardObject } from "@/board/types";

/** A tool's own params — everything on an object except the geometric base. */
export type Params = Record<string, unknown>;

export interface Size {
  w: number;
  h: number;
}

/**
 * The intrinsic (unscaled) size of a `type` object with `params`: a canvas
 * tool computes it from the params, a widget tool has one fixed size. Null for
 * an unregistered type (e.g. the image tool in a non-collab build).
 */
export function naturalSize(type: string, params: Params): Size | null {
  const tool = getTool(type);
  if (!tool) return null;
  return tool.kind === "canvas"
    ? (tool as CanvasTool).size(params)
    : (tool as WidgetTool).defaultSize;
}

/** Strip the geometric base fields, leaving only a tool's own params. */
export function paramsOf(obj: AnyBoardObject): Params {
  const { id, type, x, y, w, h, ...params } = obj;
  void id;
  void type;
  void x;
  void y;
  void w;
  void h;
  return params;
}

/**
 * The uniform resize scale currently applied to an object: its stored box vs.
 * the natural size for its CURRENT params. 1 when the tool is unknown or has
 * no width (nothing to derive a ratio from).
 */
export function scaleOf(obj: AnyBoardObject): number {
  const nat = naturalSize(obj.type, paramsOf(obj));
  return nat && nat.w > 0 ? obj.w / nat.w : 1;
}

/** The stored box for `params` at a given uniform scale. */
export function sizedBox(type: string, params: Params, scale: number): Size | null {
  const nat = naturalSize(type, params);
  return nat ? { w: nat.w * scale, h: nat.h * scale } : null;
}
