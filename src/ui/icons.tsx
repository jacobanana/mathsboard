// Toolbar icons. The draw / text / eraser glyphs are the inline SVGs from the
// prototype (maths-whiteboard.html lines 139-141); the rest are the simple
// unicode glyphs the prototype used directly in markup. Each renders inside a
// `<span class="ico">` so the existing .btn .ico styling applies.

import type { ReactNode } from "react";

const svgProps = {
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function DrawIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function TextIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

export function EraserIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </svg>
  );
}

export function ImageIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

/** A plain glyph icon (unicode) wrapped so callers stay declarative. */
export function Glyph({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}

// Unicode glyphs the prototype used inline. Re-exported as named constants so
// the toolbar reads cleanly and we avoid stray characters in JSX.
export const GLYPH = {
  select: "↖",
  pan: "✋",
  insert: "＋",
  paper: "▦",
  undo: "↶",
  redo: "↷",
  delete: "🗙",
  save: "⤓",
  boards: "🗂",
  share: "🔗",
  join: "⇥",
} as const;
