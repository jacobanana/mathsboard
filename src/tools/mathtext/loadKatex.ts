// Shared lazy KaTeX loader. The Dialog and the cheat sheet both sit in the
// eager bundle (the registry imports every Dialog at startup), so a static
// katex import would drag the ~280 KB engine into it for users who never
// touch notation; this memoised dynamic import downloads it once, on first
// preview / cheat-sheet open.

let katexModule: Promise<typeof import("katex")> | null = null;

export const loadKatex = (): Promise<typeof import("katex")> =>
  (katexModule ??= import("katex"));
