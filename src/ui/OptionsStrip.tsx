// The contextual options pill (#options), a floating layer just above the
// bottom tool dock — now a pure HOST: the active tool's Options component
// (declared in its ToolUiSpec, ui/toolSpecs.tsx) renders its own pill island;
// tools without one simply have no pill. Because the pill is its own
// fixed-position layer, its appearance never displaces the dock or any other
// button — the dock stays static while the options animate in and out.
//
// EDIT MODE. Restyling an existing object is done by EDITING IT WITH ITS OWN
// TOOL: double-clicking an object switches to the tool its registry entry
// names (editWith) and keeps it selected. Every pill control binds to the
// STYLING SERVICE (board/styling.ts) — it displays the edit target's own
// value and writes through applyStyle, the same pipeline as the keyboard
// shortcuts — so what the pill shows is always what it changes.

import { useBoardStore } from "@/board/store";
import { toolUiFor } from "@/ui/toolSpecs";

export function OptionsStrip(): JSX.Element | null {
  const tool = useBoardStore((s) => s.tool);
  const Options = toolUiFor(tool)?.Options;
  return Options ? <Options /> : null;
}
