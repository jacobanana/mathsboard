// The KaTeX -> SVG -> Image raster pipeline (roadmap B1).
//
// KaTeX outputs HTML+CSS, not paths, so "render to canvas" means: lay the HTML
// out in a hidden DOM node (page CSS), measure it, then wrap the serialized
// XHTML in an <svg><foreignObject> whose <style> carries the ENTIRE KaTeX
// stylesheet with every woff2 font inlined as a data URI — an SVG image is a
// standalone document that cannot reach page CSS or fetch external fonts.
// Loaded via a blob URL, the result is same-origin with no external
// references, so drawing it NEVER taints the canvas (PNG export stays safe).
//
// This module is heavy (KaTeX engine + ~340 KB of base64 font data built on
// first use) and is only ever loaded lazily: render.ts and the in-place maths
// editor reach it through dynamic import, keeping it out of the eager bundle.

import katexCss from "katex/dist/katex.min.css?raw";
import { theme } from "@/styles/theme";
// The shared layout font size (matches the free-text tool's default). Lives on
// the eager tool module so the in-place editor can read it without pulling in
// this heavy raster module.
import { MATH_BASE_PX as BASE_PX } from "@/tools/mathtext";
/** Padding around the layout box, absorbing italic/radical ink overhang. */
const PAD = 4;
/** Rasterize at 2x so notation stays crisp when resized or zoomed up. */
const SUPERSAMPLE = 2;

// --- fonts ------------------------------------------------------------------
// Enumerate the shipped woff2 files via glob so the list tracks the installed
// KaTeX version. Family/weight/style are encoded in the filename convention
// (KaTeX_Main-BoldItalic.woff2 -> family KaTeX_Main, 700, italic).

const FONT_MODULES = import.meta.glob("/node_modules/katex/dist/fonts/*.woff2", {
  query: "?url",
  import: "default",
}) as Record<string, () => Promise<string>>;

interface FontRef {
  family: string;
  weight: number;
  style: string;
  load: () => Promise<string>;
}

const FONTS: FontRef[] = Object.entries(FONT_MODULES).map(([path, load]) => {
  const base = path.split("/").pop()!.replace(/\.woff2$/, "");
  const [family, variant = ""] = base.split("-");
  return {
    family,
    weight: variant.includes("Bold") ? 700 : 400,
    style: variant.includes("Italic") ? "italic" : "normal",
    load,
  };
});

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000; // String.fromCharCode argument-count limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * The self-contained stylesheet embedded in every math SVG: one data-URI
 * @font-face per shipped font, plus katex.min.css with its own @font-face
 * blocks stripped (their relative url(fonts/...) would resolve against the
 * blob URL and load nothing). Built once per session, then reused.
 */
let cssPromise: Promise<string> | null = null;
function embeddedCss(): Promise<string> {
  cssPromise ??= (async () => {
    const faces = await Promise.all(
      FONTS.map(async (f) => {
        try {
          const url = await f.load();
          const buf = await (await fetch(url)).arrayBuffer();
          return (
            `@font-face{font-family:${f.family};font-style:${f.style};` +
            `font-weight:${f.weight};src:url(data:font/woff2;base64,` +
            `${toBase64(buf)}) format("woff2")}`
          );
        } catch {
          return ""; // that face falls back to a system font; still readable
        }
      }),
    );
    return faces.join("") + katexCss.replace(/@font-face\{[^{}]*\}/g, "");
  })();
  return cssPromise;
}

/**
 * Make sure the PAGE's KaTeX fonts (katex.min.css, imported by the tool
 * module) are loaded before measuring, otherwise widths come from a fallback
 * font and the box is wrong. Loads are cached by the browser after the first
 * formula.
 */
async function ensurePageFonts(): Promise<void> {
  const fonts = document.fonts;
  if (!fonts?.load) return;
  await Promise.all(
    FONTS.map((f) =>
      fonts
        .load(`${f.style} ${f.weight} ${BASE_PX}px ${f.family}`)
        .catch(() => []),
    ),
  );
}

// --- layout -----------------------------------------------------------------

interface Layout {
  /** XMLSerializer output — guaranteed well-formed for the XML-parsed SVG. */
  xhtml: string;
  /** Layout box including PAD, in px at BASE_PX. This is the natural size. */
  w: number;
  h: number;
}

/**
 * Render the LaTeX with KaTeX and measure it in a hidden on-page node.
 * `\displaystyle` + inline mode gives display-style layout (stacked
 * fractions, big operators) in a shrink-to-fit box, unlike displayMode's
 * full-width centered block. inline-flex blockifies the .katex child so the
 * box hugs it exactly — no baseline line-box slack to mis-measure.
 */
async function layoutMath(latex: string, color: string): Promise<Layout> {
  const katex = (await import("katex")).default;
  const html = katex.renderToString("\\displaystyle " + latex, {
    throwOnError: false, // errors render as red text rather than throwing
    output: "html", // skip the hidden MathML twin: smaller, XML-safe
    strict: "ignore",
  });
  await ensurePageFonts();
  const box = document.createElement("div");
  box.setAttribute(
    "style",
    `display:inline-flex;font-size:${BASE_PX}px;color:${color};`,
  );
  box.innerHTML = html;
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;";
  host.appendChild(box);
  document.body.appendChild(host);
  try {
    const r = box.getBoundingClientRect();
    return {
      xhtml: new XMLSerializer().serializeToString(box),
      w: Math.max(8, Math.ceil(r.width) + PAD * 2),
      h: Math.max(8, Math.ceil(r.height) + PAD * 2),
    };
  } finally {
    host.remove();
  }
}

// --- public API ---------------------------------------------------------------

/**
 * The natural size the notation will occupy on the board. The in-place maths
 * editor stores this as natW/natH at commit so the tool's size() stays
 * synchronous — the same trick as the image tool's intrinsic dimensions.
 * Colour never changes the metrics, so it isn't a parameter here.
 */
export async function measureMath(latex: string): Promise<{ w: number; h: number }> {
  const { w, h } = await layoutMath(latex, theme.ink);
  return { w, h };
}

/** LaTeX -> decoded HTMLImageElement, ready for ctx.drawImage. */
export async function renderMathToImage(
  latex: string,
  color: string,
): Promise<HTMLImageElement> {
  const [{ xhtml, w, h }, css] = await Promise.all([
    layoutMath(latex, color),
    embeddedCss(),
  ]);
  // CDATA keeps the stylesheet opaque to the XML parser; the comment markers
  // keep the CDATA delimiters opaque to the CSS parser.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w * SUPERSAMPLE}" ` +
    `height="${h * SUPERSAMPLE}" viewBox="0 0 ${w} ${h}">` +
    `<style>/*<![CDATA[*/${css}/*]]>*/</style>` +
    `<foreignObject width="${w}" height="${h}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="padding:${PAD}px">` +
    xhtml +
    `</div></foreignObject></svg>`;
  // data: URI, NOT a blob URL: Chromium taints the canvas when an SVG image
  // containing foreignObject is loaded from blob:, which would break the whole
  // board's PNG export (toDataURL throws). The same SVG as a data URI is
  // treated as clean — this is the html-to-image/dom-to-image approach.
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("SVG rasterisation failed"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  // Force the decode before first drawImage — some engines (Safari) paint
  // blank if the embedded fonts haven't finished applying yet.
  await img.decode().catch(() => undefined);
  return img;
}
