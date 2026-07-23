// One-off generator for the PWA / home-screen icons of both boards.
//
// There is no SVG rasteriser in this repo's toolchain (no ImageMagick / rsvg /
// sharp), but the e2e stack ships a headless Chromium via Playwright — so we
// render each icon's SVG in a real browser and screenshot it at the exact pixel
// size. Run with `node scripts/make-pwa-icons.mjs`; it (re)writes the PNGs in
// public/icons and the favicon SVGs. Re-run only when the icon art changes.
//
// The glyphs are drawn as vector primitives (lines / circles), NOT text, so the
// output does not depend on which fonts happen to be installed on the machine
// doing the render.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/", import.meta.url));

// ---- art -------------------------------------------------------------------

/** A rounded stroke line. */
const line = (x1, y1, x2, y2, w) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${w}" stroke-linecap="round"/>`;
const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

/** One arithmetic operator centred at (cx,cy); s = half-extent, w = stroke. */
function op(kind, cx, cy, s, w) {
  const g = `stroke="#fff" fill="#fff" stroke-linecap="round"`;
  const t = s * 0.82; // times/divide read better a touch smaller than +/-
  switch (kind) {
    case "+":
      return `<g ${g}>${line(cx - s, cy, cx + s, cy, w)}${line(cx, cy - s, cx, cy + s, w)}</g>`;
    case "-":
      return `<g ${g}>${line(cx - s, cy, cx + s, cy, w)}</g>`;
    case "x":
      return `<g ${g}>${line(cx - t, cy - t, cx + t, cy + t, w)}${line(cx - t, cy + t, cx + t, cy - t, w)}</g>`;
    case "/":
      return `<g ${g}>${line(cx - s, cy, cx + s, cy, w)}${dot(cx, cy - s * 0.72, w * 0.62)}${dot(cx, cy + s * 0.72, w * 0.62)}</g>`;
  }
}

/** Faint guide lines that echo the board's paper (squared vs lined). */
function paper(kind) {
  const p = [];
  const st = `stroke="#fff" stroke-opacity="0.14" stroke-width="3"`;
  if (kind === "squared") {
    for (let v = 64; v < 512; v += 64) {
      p.push(`<line x1="${v}" y1="0" x2="${v}" y2="512" ${st}/>`);
      p.push(`<line x1="0" y1="${v}" x2="512" y2="${v}" ${st}/>`);
    }
  } else {
    for (let v = 96; v < 512; v += 72) {
      p.push(`<line x1="0" y1="${v}" x2="512" y2="${v}" ${st}/>`);
    }
  }
  return p.join("");
}

const MATHS = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#8B7BF9"/><stop offset="1" stop-color="#4F46E5"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  ${paper("squared")}
  ${op("+", 194, 194, 46, 28)}
  ${op("x", 318, 194, 46, 28)}
  ${op("-", 194, 318, 46, 28)}
  ${op("/", 318, 318, 46, 28)}
</svg>`;

// Two overlapping speech bubbles carrying letters from different scripts (文 +
// A) — the international "language / translation" mark, saying conversation
// across languages far more directly than a lone letter would. The trick that
// keeps the overlap crisp: after the back bubble, paint a slightly-enlarged copy
// of the FRONT bubble's body with the SAME background gradient, carving a clean
// gap wherever the two bubbles meet (and invisible everywhere else). Glyphs are
// rendered as text — the render Chromium has full multi-script coverage, and the
// output is a baked PNG, so this doesn't depend on the end user's fonts.
const INK = "#EA580C"; // deep orange, legible on the amber paper
/** A rounded speech bubble: rounded-rect body + a small triangular tail. */
const bubble = (x, y, w, h, tail) =>
  `<g fill="#fff"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="40"/><path d="${tail}"/></g>`;
const glyph = (ch, x, y, size, weight) =>
  `<text x="${x}" y="${y}" font-family="'Noto Sans','DejaVu Sans',sans-serif" font-size="${size}" font-weight="${weight}" fill="${INK}" text-anchor="middle" dominant-baseline="central">${ch}</text>`;
const LANGUAGE = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FBBF24"/><stop offset="1" stop-color="#F97316"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <g stroke="#fff" stroke-opacity="0.13" stroke-width="3">
    <line x1="0" y1="120" x2="512" y2="120"/><line x1="0" y1="196" x2="512" y2="196"/>
    <line x1="0" y1="316" x2="512" y2="316"/><line x1="0" y1="392" x2="512" y2="392"/>
  </g>
  ${bubble(72, 92, 238, 150, "M104 236 L150 236 L104 286 Z")}
  ${glyph("文", 191, 170, 118, 700)}
  <rect x="193" y="219" width="256" height="168" rx="49" fill="url(#g)"/>
  ${bubble(202, 228, 238, 150, "M408 372 L362 372 L408 422 Z")}
  ${glyph("A", 321, 304, 128, 800)}
</svg>`;

// ---- render ----------------------------------------------------------------

const jobs = [
  { svg: MATHS, prefix: "maths" },
  { svg: LANGUAGE, prefix: "lang" },
];
// One design per board, emitted at every size the manifests + iOS ask for.
// The art keeps its subject well inside the maskable safe zone, so a single
// file serves both the "any" and "maskable" purposes.
const sizes = [192, 512, 180];

// Uses Playwright's managed Chromium by default. Set PW_CHROMIUM to an explicit
// binary when the environment pins a Chromium that Playwright didn't download
// (e.g. a preinstalled `/opt/pw-browsers/...` build).
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
});
try {
  for (const { svg, prefix } of jobs) {
    // Save the source SVG too — it doubles as the crisp browser-tab favicon.
    writeFileSync(new URL(`icons/${prefix}.svg`, `file://${root}`), svg.trim());
    for (const size of sizes) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      const scaled = svg.replace(
        'width="512" height="512"',
        `width="${size}" height="${size}"`,
      );
      await page.setContent(
        `<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}</style>${scaled}`,
      );
      const el = await page.$("svg");
      const buf = await el.screenshot({ omitBackground: false });
      writeFileSync(new URL(`icons/${prefix}-${size}.png`, `file://${root}`), buf);
      await page.close();
      console.log(`wrote icons/${prefix}-${size}.png`);
    }
  }
} finally {
  await browser.close();
}
