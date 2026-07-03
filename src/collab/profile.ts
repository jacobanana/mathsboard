// The user's collaboration profile: a display name (asked for once, kept in
// localStorage - no auth system) and a colour assigned per session.

const NAME_KEY = "mathsboard:userName";

export function getStoredName(): string | null {
  try {
    const n = localStorage.getItem(NAME_KEY);
    return n && n.trim() ? n : null;
  } catch {
    return null;
  }
}

export function setStoredName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    /* private mode etc. - the session still works, the name just won't stick */
  }
}

/** Distinct, name-tag friendly colours; picked by Yjs clientID per session. */
const PALETTE = [
  "#E4572E",
  "#2E86AB",
  "#7B2D8B",
  "#1B998B",
  "#C4457A",
  "#5C7F1D",
  "#B37718",
  "#4A4E9E",
];

export function colorForClient(clientId: number): string {
  return PALETTE[clientId % PALETTE.length];
}
