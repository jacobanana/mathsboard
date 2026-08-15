#!/usr/bin/env node
/**
 * Photograph screens of the running board.
 *
 *   node screenshot.mjs --path / --width phone --width desktop
 *   node screenshot.mjs --insert worksheet --draw 300,240,700,420 --width desktop
 *   node screenshot.mjs --peers 1 --shoot-peers --name presence
 *
 * The board draws to a <canvas>, so an empty one photographs as an empty one:
 * the options that put content on it (--insert, --draw, --tool) are usually the
 * difference between a screenshot that shows the change and one that shows the
 * furniture around it.
 *
 * Options
 *   --path <p>        app path to capture; repeat for several (default /).
 *                     The language board is a second page of the same build,
 *                     at /language/
 *   --width <w>       phone (390) | tablet (768) | desktop (1440) | a number;
 *                     repeat for several (default desktop)
 *   --out <dir>       output directory (default .dev/screenshots)
 *   --name <label>    filename prefix, instead of one derived from the path
 *   --tool <id>       select a dock tool first: draw, text, erase, select, …
 *                     (the dock button id without "Btn")
 *   --insert <type>   insert a tool from the Insert gallery by its registry
 *                     type (worksheet, timer, dice, numberline, flashcards, …)
 *                     and accept its dialog; repeat for several
 *   --draw x1,y1,x2,y2  drag a pen stroke on the stage, in px from the stage's
 *                     top-left; repeat for several
 *   --key <combo>     press a keyboard shortcut (Control+d, ?, Escape);
 *                     repeat for several. Half this app's surface is keyboard
 *   --click <sel>     click this selector before shooting; repeat for several.
 *                     What the shot is OF may be behind the burger (#menuBtn)
 *                     or a dialog — a closed menu photographs as a button
 *   --fill <sel>=<v>  type a value into this selector; repeat for several.
 *                     Split on the last `=`, so an attribute selector keeps
 *                     its own
 *   --wait <sel>      wait for this selector before shooting
 *   --delay <ms>      extra settle time before shooting (default 400)
 *   --welcome         keep the welcome modal (it is dismissed by default)
 *   --peers <n>       share the board and bring n more clients in, so presence,
 *                     peer cursors and the "n here" chip are real
 *   --shoot-peers     also capture each guest's own view of the shared board
 *   --full-page       capture the whole scrollable page, not just the viewport
 *   --base <url>      app origin (default: .dev/base_url, else :5173)
 *
 * Every file written is printed, one per line, so the caller can attach them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const WIDTHS = { phone: 390, tablet: 768, desktop: 1440 };
const HEIGHTS = { 390: 844, 768: 1024 };
const DEFAULT_HEIGHT = 900;
const PEER_NAMES = ['Gus', 'Iris', 'Otto', 'Vera'];

/** Where scripts/start_app.sh said it put the app, or the local-stack default. */
function defaultBase() {
  const file = path.join(REPO_ROOT, '.dev/base_url');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  return 'http://127.0.0.1:5173';
}

function parseArgs(argv) {
  const opts = {
    paths: [], widths: [], clicks: [], fills: [], keys: [], draws: [], inserts: [],
    delay: 400, peers: 0,
  };
  const single = {
    '--out': 'out', '--name': 'name', '--wait': 'wait', '--delay': 'delay',
    '--base': 'base', '--tool': 'tool', '--peers': 'peers',
  };
  const repeated = {
    '--path': 'paths', '--width': 'widths', '--click': 'clicks', '--fill': 'fills',
    '--key': 'keys', '--draw': 'draws', '--insert': 'inserts',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (repeated[arg]) opts[repeated[arg]].push(argv[++i]);
    else if (single[arg]) opts[single[arg]] = argv[++i];
    else if (arg === '--full-page') opts.fullPage = true;
    else if (arg === '--welcome') opts.welcome = true;
    else if (arg === '--shoot-peers') opts.shootPeers = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  if (opts.paths.length === 0) opts.paths.push('/');
  if (opts.widths.length === 0) opts.widths.push('desktop');
  opts.base = (opts.base ?? defaultBase()).replace(/\/$/, '');
  opts.out = opts.out ?? path.join(REPO_ROOT, '.dev/screenshots');
  opts.delay = Number(opts.delay);
  opts.peers = Number(opts.peers);
  return opts;
}

function resolveWidth(value) {
  const width = WIDTHS[value] ?? Number(value);
  if (!Number.isFinite(width)) throw new Error(`unknown width: ${value}`);
  return width;
}

/** `/language/` -> `language`; `/` -> `board`. */
function slugify(appPath) {
  const slug = appPath.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'board';
}

/**
 * Launch, falling back to any chromium on the box.
 *
 * A sandboxed container often ships a browser that is not the build this
 * Playwright pins and cannot download the pinned one — the same problem
 * scripts/e2e.sh solves for the test run, solved here for the same reason: a
 * screenshot that cannot be taken is the one piece of evidence nobody can
 * work around.
 */
async function launch() {
  const named = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  if (named) return chromium.launch({ executablePath: named });
  try {
    return await chromium.launch();
  } catch (error) {
    const candidates = [
      path.join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers', 'chromium'),
      '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    ];
    const found = candidates.find((c) => existsSync(c));
    if (!found) throw error;
    console.error(`using ${found} (the pinned build is not installed)`);
    return chromium.launch({ executablePath: found });
  }
}

async function newClient(browser, opts, width) {
  const isPhone = width <= 480;
  const context = await browser.newContext({
    viewport: { width, height: HEIGHTS[width] ?? DEFAULT_HEIGHT },
    deviceScaleFactor: 2,
    // A phone-width desktop browser still reports a mouse, and this app's
    // touch affordances key off that.
    ...(isPhone ? { hasTouch: true, isMobile: true } : {}),
  });
  return { context, page: await context.newPage() };
}

/**
 * Load the app and get past the welcome modal, the way a person does.
 *
 * The two boards front the page with DIFFERENT launchers, and they disagree on
 * exactly the button this used to reach for: the maths welcome always offers
 * Continue, while the language one only shows it when there is a draft to
 * resume — and a screenshot run is a fresh browser profile, so there never is.
 * Escape is the affordance both share (the welcome is a launcher, not a gate:
 * closing it any way resumes the draft loading behind it).
 *
 * Either way the wait is for a REAL board rather than for a timeout: the store
 * starts on a "pending" placeholder, and a screenshot taken over that is an
 * empty board with nothing to do with the change under test.
 */
async function openApp(page, opts, appPath) {
  await page.goto(`${opts.base}${appPath}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#toolbar').waitFor({ timeout: 30_000 });
  if (opts.welcome) return;
  const resume = page.locator('#welcomeContinue');
  if (await resume.isVisible().catch(() => false)) await resume.click();
  else await page.keyboard.press('Escape');
  await page.locator('#scrim').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__mathsboard?.board().id !== 'pending');
}

/** Drag a pen stroke across the stage: "x1,y1,x2,y2" in stage-relative px. */
async function drawStroke(page, spec) {
  const [x1, y1, x2, y2] = spec.split(',').map(Number);
  if ([x1, y1, x2, y2].some((n) => !Number.isFinite(n))) {
    throw new Error(`--draw wants x1,y1,x2,y2 — got "${spec}"`);
  }
  await page.locator('#drawBtn').click();
  const stage = await page.locator('#stage').boundingBox();
  if (!stage) throw new Error('#stage is not visible');
  await page.mouse.move(stage.x + x1, stage.y + y1);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(stage.x + x1 + ((x2 - x1) * i) / 8, stage.y + y1 + ((y2 - y1) * i) / 8);
  }
  await page.mouse.up();
}

/** Place a tool from the Insert gallery, accepting whatever dialog it opens. */
async function insertTool(page, type) {
  await page.locator('#insertBtn').click();
  const tile = page.locator(`.tile[data-d="${type}"]`);
  if ((await tile.count()) === 0) {
    const available = await page.locator('.tile[data-d]').evaluateAll((tiles) =>
      tiles.map((t) => t.getAttribute('data-d')),
    );
    throw new Error(`no tool "${type}" in the gallery. Available: ${available.join(', ')}`);
  }
  await tile.click();
  // Tools with settings open a dialog; tools without go straight to the board.
  const add = page.getByRole('button', { name: 'Add to board' });
  if (await add.isVisible().catch(() => false)) await add.click();
}

/** Everything that puts the page into the state worth photographing. */
async function stage(page, opts) {
  if (opts.tool) await page.locator(`#${opts.tool}Btn`).click();
  for (const type of opts.inserts) await insertTool(page, type);
  for (const spec of opts.draws) await drawStroke(page, spec);
  for (const key of opts.keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  for (const fill of opts.fills) {
    // Split on the LAST `=`: an attribute selector carries one of its own, and
    // `input[placeholder="Your name"]=Ada` has to mean what it looks like.
    const split = fill.lastIndexOf('=');
    await page.locator(fill.slice(0, split)).first().fill(fill.slice(split + 1), { timeout: 15_000 });
    await page.waitForTimeout(200);
  }
  // Clicks come last: they are what opens the menu or dialog the shot is of,
  // and inserting or drawing under an open dialog would close it.
  for (const selector of opts.clicks) {
    await page.locator(selector).first().click({ timeout: 15_000 });
    await page.waitForTimeout(250);
  }
  if (opts.wait) await page.locator(opts.wait).first().waitFor({ timeout: 15_000 });
  if (opts.delay) await page.waitForTimeout(opts.delay);
}

/**
 * Share the board and bring guests in, each in its own context — separate
 * storage, exactly like other people's browsers. Their cursors are parked over
 * the stage so presence photographs as presence rather than as an empty board
 * with a bigger counter.
 */
async function bringPeersIn(browser, opts, host, width) {
  await host.locator('#shareBtn').click();
  await host.getByPlaceholder('Your name').fill('Hana');
  await host.getByRole('button', { name: 'Start sharing', exact: true }).click();
  const linkInput = host.locator('.share-linkrow input');
  await linkInput.waitFor({ timeout: 30_000 });
  const link = await linkInput.inputValue();
  await host.getByRole('button', { name: 'Done' }).click();

  const guests = [];
  for (let i = 0; i < opts.peers; i++) {
    const { context, page } = await newClient(browser, opts, width);
    await page.goto(link);
    await page.locator('#card input').fill(PEER_NAMES[i % PEER_NAMES.length]);
    await page.locator('#card').getByRole('button', { name: 'Join' }).click();
    await page.waitForFunction(() => {
      const c = window.__mathsboard?.collab();
      return c?.mode === 'shared' && c.synced;
    }, undefined, { timeout: 30_000 });
    const box = await page.locator('#stage').boundingBox();
    if (box) await page.mouse.move(box.x + 380 + i * 140, box.y + 300 + i * 90);
    guests.push({ context, page });
  }
  await host.waitForFunction(
    (n) => window.__mathsboard?.collab().peers.length === n,
    opts.peers,
    { timeout: 30_000 },
  );
  // Cursor positions ride the awareness channel, which is throttled.
  await host.waitForTimeout(600);
  return guests;
}

async function shoot(page, opts, file) {
  await page.screenshot({ path: file, fullPage: Boolean(opts.fullPage) });
  console.log(file);
}

async function capture(browser, opts, appPath, widthName) {
  const width = resolveWidth(widthName);
  const { context, page } = await newClient(browser, opts, width);
  const guests = [];
  try {
    await openApp(page, opts, appPath);
    if (opts.peers > 0) guests.push(...(await bringPeersIn(browser, opts, page, width)));
    await stage(page, opts);

    const label = opts.name ?? slugify(appPath);
    await mkdir(opts.out, { recursive: true });
    await shoot(page, opts, path.resolve(opts.out, `${label}-${width}.png`));
    if (opts.shootPeers) {
      for (const [i, guest] of guests.entries()) {
        await shoot(guest.page, opts, path.resolve(opts.out, `${label}-peer${i + 1}-${width}.png`));
      }
    }
  } finally {
    await Promise.all(guests.map((g) => g.context.close()));
    await context.close();
  }
}

const opts = parseArgs(process.argv.slice(2));
const browser = await launch();
try {
  for (const appPath of opts.paths) {
    for (const width of opts.widths) await capture(browser, opts, appPath, width);
  }
} finally {
  await browser.close();
}
