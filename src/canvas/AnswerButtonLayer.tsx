// Systemic "show answer" overlay. Any tool registered with `answer: true`
// (registry.ts) gets a small reveal toggle floated at its object's top-left,
// with NO per-tool UI code — this layer is the single owner of that button.
//
// It replaces the old per-tool create-time "Fill in the answers" checkbox: the
// worked answer is now revealed live via store.toggleAnswer (which flips the
// object's `revealed` flag under INPUT_ORIGIN, so it syncs to collaborators and
// persists but stays out of the undo history). draw() reads `o.revealed` to
// show or hide the answer.
//
// Like WidgetLayer, the layer itself is pointer-events:none and each button
// re-enables pointer events for itself, so it never blocks canvas drawing
// except on the button's own footprint. The button is a fixed screen size (it
// is NOT scaled by the camera), positioned by projecting the object's top-left
// corner through worldToScreen — mirroring FloatButtons.

import { useBoardStore } from "@/board/store";
import { worldToScreen, clamp } from "@/board/geometry";
import { getTool } from "@/tools/registry";
import { EyeIcon, EyeOffIcon } from "@/ui/icons";

interface AnswerButtonLayerProps {
  /** The #stage element the layer sizes against (for edge clamping). */
  container: HTMLElement | null;
}

export function AnswerButtonLayer({
  container,
}: AnswerButtonLayerProps): JSX.Element | null {
  const objects = useBoardStore((s) => s.board.objects);
  const camera = useBoardStore((s) => s.camera);
  const editingId = useBoardStore((s) => s.editingId);
  const toggleAnswer = useBoardStore((s) => s.toggleAnswer);

  if (container == null) return null;
  const r = container.getBoundingClientRect();
  const W = r.width;
  const H = r.height;

  return (
    <div className="answer-layer">
      {objects.map((o) => {
        // Hidden while a text object is mid-edit (mirrors the scene draw pass);
        // only tools that opted into a revealable answer get a button.
        if (o.id === editingId) return null;
        if (!getTool(o.type)?.answer) return null;
        const s = worldToScreen(camera, o.x, o.y);
        const revealed = !!o.revealed;
        return (
          <button
            key={o.id}
            type="button"
            className={"answer-btn" + (revealed ? " on" : "")}
            title={revealed ? "Hide answer" : "Show answer"}
            aria-pressed={revealed}
            style={{
              left: clamp(s.x, 2, W - 36),
              top: clamp(s.y - 32, 2, H - 36),
            }}
            // Keep the press off the canvas so revealing never starts a stroke
            // / selection, whatever tool is active.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => toggleAnswer(o.id)}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        );
      })}
    </div>
  );
}
