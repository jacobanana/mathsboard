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

// A bold accented "A" — the universal letter/alphabet mark, with a diacritic
// stroke to say "language / accents", on lined paper.
const A_APEX_X = 256,
  A_APEX_Y = 150,
  A_FOOT_Y = 378,
  A_HALF = 74,
  A_W = 30;
const LANGUAGE = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FBBF24"/><stop offset="1" stop-color="#F97316"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  ${paper("lined")}
  <g stroke="#fff" fill="#fff" stroke-linecap="round" stroke-linejoin="round">
    ${line(A_APEX_X, A_APEX_Y, A_APEX_X - A_HALF, A_FOOT_Y, A_W)}
    ${line(A_APEX_X, A_APEX_Y, A_APEX_X + A_HALF, A_FOOT_Y, A_W)}
    ${line(A_APEX_X - 42, 306, A_APEX_X + 42, 306, A_W)}
    ${line(A_APEX_X + 24, 120, A_APEX_X + 62, 96, A_W)}
  </g>
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
