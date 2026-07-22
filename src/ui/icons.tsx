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

/** Text-alignment glyphs (left / centre / right) for the text options. */
export function AlignLeftIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="18" y2="18" />
    </svg>
  );
}

export function AlignCenterIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="7" y1="12" x2="17" y2="12" />
      <line x1="5" y1="18" x2="19" y2="18" />
    </svg>
  );
}

export function AlignRightIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="6" y1="18" x2="20" y2="18" />
    </svg>
  );
}

/** A highlighter / marker — the draw tool's translucent-ink mode. */
export function HighlighterIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </svg>
  );
}

/** A square root — the maths-notation dock tool. */
export function MathIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M3 13h3l2.5 6.5L13 4h8" />
    </svg>
  );
}

/** A shining point — the laser pointer. Filled centre dot with radiating
 *  beams, so it reads as "point / emit" rather than a plain target. */
export function LaserIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
      <path d="M12 3v2.4" />
      <path d="M12 18.6V21" />
      <path d="M3 12h2.4" />
      <path d="M18.6 12H21" />
      <path d="m5.6 5.6 1.7 1.7" />
      <path d="m16.7 16.7 1.7 1.7" />
      <path d="m18.4 5.6-1.7 1.7" />
      <path d="m7.3 16.7-1.7 1.7" />
    </svg>
  );
}

/** A dashed marquee box — the laser's "frame an area to zoom everyone" toggle. */
export function FrameIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 3.5" />
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

/** An "i" in a circle — the About & credits menu item. */
export function AboutIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function ContentIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M14 4v5h5" />
      <path d="M12 18v-6" />
      <path d="M9 15h6" />
    </svg>
  );
}

export function EyeIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.1 9.1 0 0 0 5.39-1.61" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

// --- draw-mode + arrange icons (shape tool, roadmap A2/A5) ------------------

/** Freehand mode: a loose scribble. */
export function ScribbleIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M3 17c2.5-6 4.5-8.5 6-7.5s-1.5 8 .5 8.5 4-9.5 6-8.5-.5 8 1.5 8.5 3-3 4-5" />
    </svg>
  );
}

export function LineIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1="5" y1="19" x2="19" y2="5" />
    </svg>
  );
}

export function ArrowIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <line x1="5" y1="19" x2="19" y2="5" />
      <polyline points="11 5 19 5 19 13" />
    </svg>
  );
}

export function RectIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  );
}

export function EllipseIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
    </svg>
  );
}

export function TriangleIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M12 4.5 20.5 19h-17Z" />
    </svg>
  );
}

/** A hexagon standing in for "any regular polygon". */
export function PolygonIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9Z" />
    </svg>
  );
}

/** An irregular polygon with corner dots — the point-by-point polygon. */
export function FreePolyIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M5 9 12 4l8 4-2 9-9 4Z" />
      <circle cx="5" cy="9" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="4" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20" cy="8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="21" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A square — the rectangle mode's aspect lock. */
export function SquareIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </svg>
  );
}

/** A circle — the ellipse mode's aspect lock. */
export function CircleIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="7.5" />
    </svg>
  );
}

/** Rotate anticlockwise by a step. */
export function RotateLeftIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

/** Rotate clockwise by a step. */
export function RotateRightIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  );
}

/** A Bézier curve with its two control handles. */
export function CurveIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M4 19C7 6 17 18 20 5" />
      <circle cx="4" cy="19" r="1.4" />
      <circle cx="20" cy="5" r="1.4" />
    </svg>
  );
}

/** Two rays and an arc — the angle tool. */
export function AngleIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M4 19h16" />
      <path d="M4 19 15 6" />
      <path d="M11 19a7.5 7.5 0 0 0-2.5-5.5" />
    </svg>
  );
}

/** A magnet — the grid-snapping toggle. */
export function SnapIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15" />
      <path d="m5 8 4 4" />
      <path d="m12 15 4 4" />
    </svg>
  );
}

export function BringToFrontIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <rect x="8" y="8" width="8" height="8" rx="2" />
      <path d="M4 10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2" />
      <path d="M14 20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2" />
    </svg>
  );
}

export function SendToBackIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <rect x="14" y="14" width="8" height="8" rx="2" />
      <rect x="2" y="2" width="8" height="8" rx="2" />
      <path d="M7 14v1a2 2 0 0 0 2 2h1" />
      <path d="M14 7h1a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function GroupIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect x="7" y="7" width="6" height="6" rx="1" />
      <rect x="12" y="12" width="5" height="5" rx="1" />
    </svg>
  );
}

export function UngroupIcon(): JSX.Element {
  return (
    <svg {...svgProps}>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
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
