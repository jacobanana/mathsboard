// Short join codes: sharing mints an 8-hex-char board id, the Share dialog
// shows it as a read-out-loud code, and a second client can join by typing the
// code (in any format) instead of opening the full link.

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

test("a client can join with the typed code instead of the link", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await drawStroke(host, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(host, 1);

  await startSharing(host, "Hana");
  await waitForConnected(host);
  const { boardId } = await collabState(host);
  if (!boardId) throw new Error("host has no board id");

  // Guest types the code as a human would: uppercase, dashed, from the Share
  // dialog of a plain (unshared) session.
  const humanCode =
    boardId.slice(0, 4).toUpperCase() + "-" + boardId.slice(4).toUpperCase();
  await openApp(guest);
  await guest.locator("#shareBtn").click();
  await guest.getByPlaceholder("Your name").fill("Gus");
  await guest.getByPlaceholder(/Code or link/).fill(humanCode);
  await guest.getByRole("button", { name: "Join", exact: true }).click();

  await guest.waitForFunction(() => {
    const c = window.__mathsboard?.collab();
    return c?.mode === "shared" && c.synced;
  });
  expect((await collabState(guest)).boardId).toBe(boardId);
  expect(guest.url()).toContain(`board=${boardId}`);

  // The host's drawing arrived; edits flow both ways from here.
  await waitForStrokeCount(guest, 1);
  await host.waitForFunction(
    () => window.__mathsboard?.collab().peers.length === 1,
  );
});

test("a nonsense code is rejected without leaving the board", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  await page.locator("#shareBtn").click();
  await page.getByPlaceholder("Your name").fill("Hana");
  await page.getByPlaceholder(/Code or link/).fill("not a code!");
  await page.getByRole("button", { name: "Join", exact: true }).click();

  await expect(page.locator(".err")).toContainText("doesn't look right");
  expect((await collabState(page)).mode).toBe("solo");
});
