// Presence (awareness protocol): who's-here lists, live remote cursors and
// remote selection outlines. All of it is ephemeral - it must appear while a
// peer is active and vanish when they leave.

import {
  test,
  expect,
  drawStroke,
  openApp,
  shareAndJoin,
  waitForStrokeCount,
} from "./helpers";

test("both participants see each other in the toolbar and share dialog", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await expect(host.locator("#shareBtn .label")).toHaveText("2 here");
  await expect(guest.locator("#shareBtn .label")).toHaveText("2 here");

  await host.locator("#shareBtn").click();
  await expect(host.locator(".subhead")).toHaveText("Here now (2)");
  await expect(host.locator(".share-person")).toHaveText(["Hana (you)", "Gus"]);
});

test("a peer's cursor appears with their name and hides when they leave the stage", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  const stage = await guest.locator("#stage").boundingBox();
  if (!stage) throw new Error("#stage is not visible");
  await guest.mouse.move(stage.x + 300, stage.y + 220);
  await guest.mouse.move(stage.x + 320, stage.y + 240);

  await expect(host.locator(".remote-cursor .rc-name")).toHaveText("Gus");

  // Leaving the stage publishes a null cursor - the tag disappears.
  await guest.mouse.move(stage.x + 320, stage.y - 30);
  await expect(host.locator(".remote-cursor")).toHaveCount(0);
});

test("a peer's selection shows as a coloured outline", async ({ newClient }) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await drawStroke(host, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(guest, 1);

  await guest.keyboard.press("Control+a");
  await expect(host.locator(".remote-sel")).toHaveCount(1);

  await guest.keyboard.press("Escape");
  await expect(host.locator(".remote-sel")).toHaveCount(0);
});

test("a departing peer disappears from the counter", async ({ newClient }) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await expect(host.locator("#shareBtn .label")).toHaveText("2 here");
  await guest.context().close();
  await expect(host.locator("#shareBtn .label")).toHaveText("1 here", {
    timeout: 30_000,
  });
});
