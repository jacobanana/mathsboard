// Type-in answer boxes for canvas tools that declare an `inputs` capability
// (registry.ts). A canvas tool stays a canvas tool — drawn on #template, so it
// keeps resize, z-order and draw-over — and this layer floats a small HTML
// <input> over each field it declares, positioned by projecting the field's
// NATURAL-space box through the same transform the scene uses (object origin →
// worldToScreen, then scaled by the box-resize scale × camera scale). So the
// boxes track the object through pan, zoom and resize.
//
// STATE: the typed value lives on the object as "ans:<key>", written under
// INPUT_ORIGIN via updateWidgetState — synced to collaborators, persisted, and
// invisible to undo (exactly the worksheet's answer model). `correct` (if the
// tool supplies it) drives live green/red marking, and a revealed object shows
// the correct value in any box left blank.
//
// DRAW-ON-TOP: the layer sits BELOW #ink (which is now a pointer-events:none
// overlay), so pen strokes paint over the inputs. Inputs are only interactive
// in select mode; every drawing tool adds `.locked`, dropping the inputs to
// pointer-events:none so a stroke passes straight through to the canvas.
//
// DENSITY: a 12×12 grid is 144 inputs, so objects whose projected box is fully
// off-screen render no inputs at all (viewport cull) — pan a grid away and its
// DOM cost goes to zero.

import { useBoardStore } from "@/board/store";
import { worldToScreen } from "@/board/geometry";
import { getTool } from "@/tools/registry";

interface InputOverlayLayerProps {
  /** #stage element, for culling inputs of off-screen objects. */
  container: HTMLElement | null;
}

export function InputOverlayLayer({
  container,
}: InputOverlayLayerProps): JSX.Element {
  const objects = useBoardStore((s) => s.board.objects);
  const camera = useBoardStore((s) => s.camera);
  const tool = useBoardStore((s) => s.tool);
  const editingId = useBoardStore((s) => s.editingId);
  const updateWidgetState = useBoardStore((s) => s.updateWidgetState);

  // Typeable only with the select tool; every drawing tool draws through.
  const interactive = tool === "select";
  const rect = container?.getBoundingClientRect();
  const W = rect?.width ?? Infinity;
  const H = rect?.height ?? Infinity;

  return (
    <div className={"inputlayer" + (interactive ? "" : " locked")}>
      {objects.flatMap((o) => {
        if (o.id === editingId) return [];
        const t = getTool(o.type);
        if (!t || t.kind !== "canvas" || !t.inputs) return [];
        const nat = t.size(o as never);
        const box = nat.w > 0 ? o.w / nat.w : 1; // box-resize scale (aspect locked)
        const px = box * camera.scale; // one natural unit → screen px
        const s = worldToScreen(camera, o.x, o.y);
        // Skip objects entirely outside the stage (their inputs would be off-screen).
        if (
          s.x > W ||
          s.y > H ||
          s.x + o.w * camera.scale < 0 ||
          s.y + o.h * camera.scale < 0
        )
          return [];
        const rec = o as unknown as Record<string, unknown>;
        return t.inputs.fields(o as never).map((f) => {
          const typed = (rec["ans:" + f.key] as string) ?? "";
          const revealed = !!o.revealed;
          // Marking (and the correct answer in blank boxes) only appears once
          // the "show answers" toggle is on — until then it's plain entry.
          const revealBlank = revealed && typed.trim() === "" && f.correct != null;
          const marked =
            revealed && f.correct != null && typed.trim() !== ""
              ? Number(typed) === f.correct
                ? "ok"
                : "no"
              : "";
          const cls =
            "iofield" +
            (f.variant === "cell" ? " cell" : "") +
            (revealBlank ? " revealed" : marked ? " " + marked : "");
          return (
            <input
              key={o.id + ":" + f.key}
              className={cls}
              inputMode="numeric"
              autoComplete="off"
              readOnly={revealBlank}
              value={revealBlank ? String(f.correct) : typed}
              style={{
                left: s.x + f.x * px,
                top: s.y + f.y * px,
                width: f.w * px,
                height: f.h * px,
                // Fit by height, but cap by width so many-digit answers in a
                // square grid cell don't overflow.
                fontSize: Math.max(8, Math.min(f.h * 0.55, f.w * 0.42) * px),
              }}
              // Keep typing local: don't let keys reach the board shortcut
              // handler (e.g. "e" = eraser) or the press bubble to the canvas.
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) =>
                updateWidgetState(o.id, { ["ans:" + f.key]: e.target.value })
              }
            />
          );
        });
      })}
    </div>
  );
}
