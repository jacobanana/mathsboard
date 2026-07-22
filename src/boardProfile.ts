// THE BOARD PROFILE — everything that differs between board flavours, in ONE
// place. The whole board (canvas, collaboration, persistence, most tools) is
// shared; a profile only says how THIS flavour is dressed and equipped:
//
//   • appName / insertNoun — chrome wording.
//   • defaultBackground    — the paper a NEW board starts on.
//   • dockTools            — which interaction tools the bottom dock shows, in
//                            order. This ALSO drives their keyboard shortcuts
//                            (ui/shortcuts.ts reads it), so a tool that isn't in
//                            the dock isn't reachable by key either.
//
// Adding a future board type = add a `Subject` (src/subject.ts) and one entry to
// PROFILES here; the dock, shortcuts, chrome and default paper all follow. No
// per-tool `if (isLanguage)` scattered through the UI.

import type { Background, ToolName } from "@/board/types";
import { SUBJECT, type Subject } from "@/subject";

export interface BoardProfile {
  subject: Subject;
  /** App name (browser tab + welcome screen). */
  appName: string;
  /** Noun for the Insert button ("maths widget" / "language activity"). */
  insertNoun: string;
  /** Paper a freshly-created board starts on. */
  defaultBackground: Background;
  /** The dock's interaction tools, in display order. Also gates their keys. */
  dockTools: ToolName[];
}

const MATHS: BoardProfile = {
  subject: "maths",
  appName: "Maths Board",
  insertNoun: "maths widget",
  defaultBackground: "squared",
  dockTools: ["pan", "select", "pen", "eraser", "text", "math"],
};

const LANGUAGE: BoardProfile = {
  subject: "language",
  appName: "Language Board",
  insertNoun: "language activity",
  // Lined paper suits writing words and sentences; squares suit maths.
  defaultBackground: "lined",
  // No maths-notation tool — a language board has nothing to typeset.
  dockTools: ["pan", "select", "pen", "eraser", "text"],
};

const PROFILES: Record<Subject, BoardProfile> = {
  maths: MATHS,
  language: LANGUAGE,
};

/** The active profile for this page. */
export const PROFILE: BoardProfile = PROFILES[SUBJECT];
