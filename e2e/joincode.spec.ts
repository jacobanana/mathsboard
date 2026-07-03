// Short join codes: sharing mints an 8-hex-char board id and the Share dialog
// shows it as a read-out-loud code. Joining by typed code has two entry
// points: the welcome screen on load, and the toolbar Join button mid-session.

import {
  test,
  expect,
  collabState,
  drawStroke,
  openApp,
  startSharing,
  waitForConnected,
  waitForStrokeCount,
} from "./helpers";
import type { Page } from "@playwright/test";

/** Share the host's board and return the code a human would read out. */
async function shareAndGetCode(host: Page): Promise<string> {
  await startSharing(host, "Hana");
  await waitForConnected(host);
  const { boardId } = await collabState(host);
  if (!boardId) throw new Error("host has no board id");
  return (
    boardId.slice(0, 4).toUpperCase() + "-" + boardId.slice(4).toUpperCase()
  );
}

async function waitForJoined(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const c = window.__mathsboard?.collab();
    return c?.mode === "shared" && c.synced;
  });
}

test("sharing mints a short code and shows it in the dialog", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  const link = await startSharing(page, "Hana");
  await waitForConnected(page);

  const collab = await collabState(page);
  expect(collab.boardId).toMatch(/^[0-9a-f]{8}$/);
  expect(link).toContain(`board=${collab.boardId}`);

  // The dialog shows the formatted code next to the link.
  await page.locator("#shareBtn").click();
  await expect(page.locator(".share-code")).toHaveText(
    /^[0-9A-F]{4}-[0-9A-F]{4}$/,
  );
  await expect(page.locator(".share-linkrow input")).toHaveValue(link);
});

test("the welcome screen joins a board by typed code", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await drawStroke(host, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(host, 1);
  const code = await shareAndGetCode(host);

  // Guest lands on the welcome screen and joins straight from it, typing the
  // code the way a human would (uppercase, dashed).
  await guest.goto("/");
  await guest.getByPlaceholder("Your name").fill("Gus");
  await guest.getByPlaceholder(/Code or link/).fill(code);
  await guest.locator("#joinGo").click();

  await waitForJoined(guest);
  expect((await collabState(guest)).boardId).toBe(
    (await collabState(host)).boardId,
  );
  // The host's drawing arrived; edits flow both ways from here.
  await waitForStrokeCount(guest, 1);
  await host.waitForFunction(
    () => window.__mathsboard?.collab().peers.length === 1,
  );
});

test("the toolbar Join button joins mid-session and hides while shared", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await drawStroke(host, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(host, 1);
  const code = await shareAndGetCode(host);

  // Guest is already working on their own board when the code is read out.
  await openApp(guest);
  await drawStroke(guest, { x: 500, y: 400 }, { x: 560, y: 460 });
  await waitForStrokeCount(guest, 1);

  await guest.locator("#joinBtn").click();
  await guest.getByPlaceholder("Your name").fill("Gus");
  await guest.getByPlaceholder(/Code or link/).fill(code);
  await guest.locator("#joinGo").click();

  await waitForJoined(guest);
  // Now on the host's board (their stroke, not the guest's own doodle).
  await waitForStrokeCount(guest, 1);
  expect((await collabState(guest)).boardId).toBe(
    (await collabState(host)).boardId,
  );
  // While shared, Join disappears; the Share button carries the status.
  await expect(guest.locator("#joinBtn")).toHaveCount(0);
  await expect(guest.locator("#shareBtn .label")).toHaveText("2 here");
});

test("a nonsense code is rejected without leaving the board", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  await page.locator("#joinBtn").click();
  await page.getByPlaceholder("Your name").fill("Hana");
  await page.getByPlaceholder(/Code or link/).fill("not a code!");
  await page.locator("#joinGo").click();

  await expect(page.locator(".err")).toContainText("doesn't look right");
  expect((await collabState(page)).mode).toBe("solo");
});
