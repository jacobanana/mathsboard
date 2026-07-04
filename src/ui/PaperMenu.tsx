// The Paper popover (#paperMenu): Squares / Lines / Blank. Ported from the
// prototype (markup line 123, wiring lines 342-345).
//
// The host (App) owns open/close state and the anchor element (the burger's
// Paper item re-anchors it to the burger button). Positioning + dismissal
// (outside press / Escape) come from the shared <Popover>; this only supplies
// the options and marks the current background active.

import { useBoardStore } from "@/board/store";
import { Popover } from "@/ui/Popover";
import type { Background } from "@/board/types";

const OPTIONS: [Background, string][] = [
  ["squared", "Squares"],
  ["lined", "Lines"],
  ["blank", "Blank"],
];

interface PaperMenuProps {
  anchor: HTMLElement | null;
  onClose: () => void;
}

export function PaperMenu({ anchor, onClose }: PaperMenuProps): JSX.Element | null {
  const background = useBoardStore((s) => s.board.background);
  const setBackground = useBoardStore((s) => s.setBackground);

  // Right-align: the burger anchor sits at the far right of the toolbar.
  return (
    <Popover anchor={anchor} onClose={onClose} align="right" id="paperMenu" className="open">
      {OPTIONS.map(([bg, label]) => (
        <button
          key={bg}
          className={background === bg ? "active" : ""}
          onClick={() => {
            setBackground(bg);
            onClose();
          }}
        >
          {label}
        </button>
      ))}
    </Popover>
  );
}
