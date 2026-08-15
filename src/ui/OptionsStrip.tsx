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

import { useLayoutEffect, type ComponentType } from "react";
import { useBoardStore } from "@/board/store";
import { toolUiFor } from "@/ui/toolSpecs";

/** Publish the pill's live height as --options-lift on the root element.
 *  On phones the pill is docked bottom-LEFT on the same row as the zoom
 *  cluster (bottom-right); a wide pill (the draw tool's two rows) would sit
 *  on top of the cluster and make it unclickable, so the phone media query
 *  raises #zoomCluster by this amount. Zero whenever no pill is shown. */
function useOptionsLift(Options: ComponentType | undefined): void {
  useLayoutEffect(() => {
    if (!Options) return;
    const root = document.documentElement;
    const el = document.getElementById("options");
    if (!el) return;
    const set = () =>
      root.style.setProperty("--options-lift", `${el.offsetHeight + 8}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--options-lift");
    };
  }, [Options]);
}

export function OptionsStrip(): JSX.Element | null {
  const tool = useBoardStore((s) => s.tool);
  const Options = toolUiFor(tool)?.Options;
  useOptionsLift(Options);
  return Options ? <Options /> : null;
}
