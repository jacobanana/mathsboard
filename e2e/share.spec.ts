// The share lifecycle for a single client: start sharing (token minting +
// websocket connect + URL rewrite), the share dialog's live view, and leaving
// the board back to a private solo draft.

import {
  test,
  expect,
  boardState,
  collabState,
  drawStroke,
  openApp,
  startSharing,
  waitForConnected,
  waitForStrokeCount,
} from "./helpers";

test("start sharing connects and puts the board id in the URL", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  const link = await startSharing(page, "Hana");
  expect(link).toMatch(/\?board=[A-Za-z0-9_-]{6,}/);
  expect(page.url()).toContain("board=");

  await waitForConnected(page);
  const collab = await collabState(page);
  expect(collab.mode).toBe("shared");
  expect(collab.synced).toBe(true);
  expect(collab.self?.name).toBe("Hana");

  // The toolbar share button flips to the live participant counter.
  await expect(page.locator("#shareBtn .label")).toHaveText("1 here");

  // Reopening the dialog shows the same link and the connection status.
  await page.locator("#shareBtn").click();
  await expect(page.locator(".share-linkrow input")).toHaveValue(link);
  await expect(page.locator(".share-status")).toContainText("Live");
  await expect(page.locator(".share-person")).toHaveText("Hana (you)");
});

test("sharing seeds the session with the current board content", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);
  await drawStroke(page, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(page, 1);
  const before = await boardState(page);

  await startSharing(page, "Hana");
  await waitForConnected(page);

  const after = await boardState(page);
  expect(after.strokes.map((s) => s.id)).toEqual(before.strokes.map((s) => s.id));
});

test("leaving keeps the content as a private local draft", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);
  await drawStroke(page, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(page, 1);

  await startSharing(page, "Hana");
  await waitForConnected(page);

  await page.locator("#shareBtn").click();
  await page.getByRole("button", { name: "Leave board" }).click();

  const collab = await collabState(page);
  expect(collab.mode).toBe("solo");
  expect(page.url()).not.toContain("board=");
  // The drawing survives the disconnect as the local draft.
  await waitForStrokeCount(page, 1);
  await expect(page.locator("#shareBtn .label")).toHaveText("Share");
});
