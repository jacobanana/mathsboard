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

// The remaining toolbar icons were unicode glyphs (↖ ✋ ↶ ☰ …) that render
// wildly differently per platform — Android turns ✋ into a colour emoji.
// Proper stroked SVGs keep every button in the same visual family.

export function SelectIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M4 3.5 11 21l2.5-7.5L21 11z" />
    </svg>
  );
}

export function HandIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M18 11V6a2 2 0 0 0-4 0v5" />
      <path d="M14 10V4a2 2 0 0 0-4 0v2" />
      <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

export function UndoIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

export function RedoIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  );
}

export function PlusIcon(): JSX.Element {
  return (
    <svg {...svgProps} strokeWidth={2.5}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

export function MenuIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function JoinIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

export function ShareIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function PaperIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  );
}

export function BoardsIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

export function SaveIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function KeyboardIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h0.01" />
      <path d="M10 9h0.01" />
      <path d="M14 9h0.01" />
      <path d="M18 9h0.01" />
      <path d="M7 15h10" />
    </svg>
  );
}

/** A plain glyph icon (unicode) wrapped so callers stay declarative. */
export function Glyph({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}

// Unicode glyphs kept as named constants so we avoid stray characters in JSX.
// Only the float-delete cross remains — every toolbar/menu icon is an SVG now.
export const GLYPH = {
  delete: "🗙",
} as const;
