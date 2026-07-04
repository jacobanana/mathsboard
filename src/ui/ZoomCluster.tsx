// The zoom cluster (#zoomCluster): − / 100% / +. Ported from the prototype
// (markup line 120, zoomAt + handlers lines 330-332).
//
// Zooming goes through the shared viewport controller (canvas/viewport.ts) —
// the same zoomAt the canvas wheel/pinch uses — about the stage centre; the
// middle button (showing the current %) resets to 100%.
//
// The stage size is supplied by the host via getStageSize() so this component
// stays decoupled from the canvas/DOM.

import { useBoardStore } from "@/board/store";
import { zoomAt } from "@/canvas/viewport";

interface ZoomClusterProps {
  /** Current stage (canvas) size in CSS px, for centring the zoom. */
  getStageSize: () => { w: number; h: number };
}

export function ZoomCluster({ getStageSize }: ZoomClusterProps): JSX.Element {
  const camera = useBoardStore((s) => s.camera);

  function zoomAtCentre(factor: number): void {
    const { w, h } = getStageSize();
    zoomAt(factor, w / 2, h / 2);
  }

  return (
    <div id="zoomCluster">
      <button id="zoomOut" title="Zoom out" onClick={() => zoomAtCentre(1 / 1.2)}>
        −
      </button>
      <button
        id="zoomReset"
        title="Reset to 100%"
        onClick={() => zoomAtCentre(1 / camera.scale)}
      >
        {Math.round(camera.scale * 100) + "%"}
      </button>
      <button id="zoomIn" title="Zoom in" onClick={() => zoomAtCentre(1.2)}>
        +
      </button>
    </div>
  );
}
