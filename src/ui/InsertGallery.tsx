// The Insert gallery. Ported from the prototype (insertGallery, lines 357-387)
// but fully data-driven: it reads the tool registry instead of hard-coding
// tiles, so any newly registered tool appears automatically.
//
// Layout mirrors the prototype: a 2-col .gallery with a full-width .gsub
// heading per category (in CATEGORY_ORDER), then a .tile per tool
// (listByCategory already filters inGallery !== false AND content-gated tools
// whose `available()` is false right now — e.g. "le or la?" only shows on a
// board whose language has gendered nouns). Empty categories are skipped.
// Clicking a tile delegates to the host via onPick(type); the host (App) opens
// that tool's Dialog in CREATE mode (or, for a gallery tool with no Dialog,
// places it with defaults).

import { useSyncExternalStore } from "react";
import {
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  getGalleryVersion,
  listByCategory,
  subscribeGallery,
} from "@/tools/registry";

interface InsertGalleryProps {
  /** Called with the chosen tool's `type`. Host opens its Dialog / places it. */
  onPick: (type: string) => void;
}

export function InsertGallery({ onPick }: InsertGalleryProps): JSX.Element {
  // Re-render when a content gate might have flipped (pair / content change), so
  // content-gated tiles appear or disappear live without reopening the gallery.
  useSyncExternalStore(subscribeGallery, getGalleryVersion, getGalleryVersion);

  return (
    <>
      <h2>Insert a tool</h2>
      <p className="hint">
        Drop one on the board — add as many as you like. Double-click a widget
        later to change its settings.
      </p>
      <div className="gallery">
        {CATEGORY_ORDER.map((category) => {
          const tools = listByCategory(category);
          if (tools.length === 0) return null;
          return (
            <div key={category} style={{ display: "contents" }}>
              <div className="gsub">{CATEGORY_LABELS[category]}</div>
              {tools.map((tool) => (
                <button
                  key={tool.type}
                  className="tile"
                  data-d={tool.type}
                  onClick={() => onPick(tool.type)}
                >
                  <b>{tool.name}</b>
                  <span>{tool.blurb}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
