// The interaction-controller registry (T1) — same shape as tools/registry.ts.

import type { ToolName } from "@/board/types";
import type { InteractionController } from "@/canvas/interactions/types";

const REGISTRY = new Map<ToolName, InteractionController>();

/** Register a controller by its `tool`. Throws on duplicate. */
export function registerInteraction(c: InteractionController): void {
  if (REGISTRY.has(c.tool)) {
    throw new Error(`Interaction for tool "${c.tool}" is already registered.`);
  }
  REGISTRY.set(c.tool, c);
}

export function getInteraction(
  tool: ToolName,
): InteractionController | undefined {
  return REGISTRY.get(tool);
}

export function listInteractions(): InteractionController[] {
  return [...REGISTRY.values()];
}
