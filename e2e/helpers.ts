// Shared fixtures + helpers for the collaboration e2e suite.
//
// The tests drive the app strictly through the real UI (pointer + keyboard +
// buttons). Assertions on DOCUMENT content go through the read-only
// window.__mathsboard hook (src/testing/e2eHooks.ts) because the board itself
// renders to <canvas>; everything DOM-visible (modals, toolbar labels, remote
// cursors) is asserted on the DOM directly.
//
// Multi-client tests create one BrowserContext per participant - separate
// localStorage/IndexedDB, exactly like two different people's browsers.

import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";

// Mirror of src/testing/e2eHooks.ts (kept structural, not imported: the e2e
// folder is outside the app's tsconfig project).
interface BoardSnapshot {
  id: string;
  name: string;
  background: string;
  objects: { id: string; type: string; x: number; y: number }[];
  strokes: { id: string; points: { x: number; y: number }[] }[];
}
interface CollabSnapshot {
  mode: "solo" | "shared";
  boardId: string | null;
  status: string;
  synced: boolean;
  self: { name: string; color: string } | null;
  peers: {
    name: string;
    color: string;
    cursor: { x: number; y: number } | null;
  }[];
}
declare global {
  interface Window {
    __mathsboard?: {
      board(): BoardSnapshot;
      collab(): CollabSnapshot;
    };
  }
}

// --- fixtures ----------------------------------------------------------------

interface Fixtures {
  /** Open a fresh, isolated client (own context = own storage) on the app. */
  newClient: (options?: { url?: string }) => Promise<Page>;
}

export const test = base.extend<Fixtures>({
  newClient: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async ({ url } = {}) => {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      contexts.push(context);
      const page = await context.newPage();
      if (url !== undefined) await page.goto(url);
      return page;
    });
    await Promise.all(contexts.map((c) => c.close()));
  },
});

export { expect };

// --- state readers (via the window hook) --------------------------------------

export function boardState(page: Page): Promise<BoardSnapshot> {
  return page.evaluate(() => window.__mathsboard!.board());
}

export function collabState(page: Page): Promise<CollabSnapshot> {
  return page.evaluate(() => window.__mathsboard!.collab());
}

export function strokeIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    window.__mathsboard!.board().strokes.map((s) => s.id),
  );
}

/** Wait until the board holds exactly `n` strokes (local or synced-in). */
export async function waitForStrokeCount(page: Page, n: number): Promise<void> {
  await page.waitForFunction(
    (want) => window.__mathsboard?.board().strokes.length === want,
    n,
  );
}

/** Wait until the shared session reports `status: "connected"`. */
export async function waitForConnected(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__mathsboard?.collab().status === "connected",
  );
}

// --- app entry -----------------------------------------------------------------

/** Load the app at `/` and wait for the initial board to be in place. */
export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("#toolbar")).toBeVisible();
  // init() swaps out the synchronous "pending" placeholder document.
  await page.waitForFunction(
    () => window.__mathsboard?.board().id !== "pending",
  );
}

// --- drawing --------------------------------------------------------------------

/**
 * Draw one pen stroke by dragging on the stage. Coordinates are in px relative
 * to the stage's top-left. Selects the Draw tool first so the helper works
 * regardless of the tool a previous step left active.
 */
export async function drawStroke(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.locator("#drawBtn").click();
  const stage = await page.locator("#stage").boundingBox();
  if (!stage) throw new Error("#stage is not visible");
  await page.mouse.move(stage.x + from.x, stage.y + from.y);
  await page.mouse.down();
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      stage.x + from.x + ((to.x - from.x) * i) / steps,
      stage.y + from.y + ((to.y - from.y) * i) / steps,
    );
  }
  await page.mouse.up();
}

// --- collaboration flows ----------------------------------------------------------

/**
 * Click Share, start sharing under `name`, and return the share link. Leaves
 * the Share modal CLOSED.
 */
export async function startSharing(page: Page, name: string): Promise<string> {
  await page.locator("#shareBtn").click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByRole("button", { name: "Start sharing", exact: true }).click();
  // The modal switches to the shared view once the token endpoint answered.
  const linkInput = page.locator(".share-linkrow input");
  await expect(linkInput).toBeVisible();
  const link = await linkInput.inputValue();
  await page.getByRole("button", { name: "Done" }).click();
  return link;
}

/**
 * Open a share link in `page` (a fresh client), answer the name prompt, and
 * wait for the first server sync to land.
 */
export async function joinBoard(
  page: Page,
  link: string,
  name: string,
): Promise<void> {
  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: /Joining a shared board/ }),
  ).toBeVisible();
  await page.locator("#card input").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await page.waitForFunction(() => {
    const c = window.__mathsboard?.collab();
    return c?.mode === "shared" && c.synced;
  });
}

/**
 * The standard two-participant setup: `host` shares a fresh board, `guest`
 * joins it, and both have seen each other before any test steps run.
 */
export async function shareAndJoin(
  host: Page,
  guest: Page,
  { hostName = "Hana", guestName = "Gus" } = {},
): Promise<string> {
  const link = await startSharing(host, hostName);
  await joinBoard(guest, link, guestName);
  await host.waitForFunction(
    () => window.__mathsboard?.collab().peers.length === 1,
  );
  await guest.waitForFunction(
    () => window.__mathsboard?.collab().peers.length === 1,
  );
  return link;
}
