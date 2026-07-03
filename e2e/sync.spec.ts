// Document synchronisation between two real clients (separate browser
// contexts) through the full stack: Caddy -> /api/token -> Y-Sweet websocket.

import {
  test,
  expect,
  drawStroke,
  joinBoard,
  openApp,
  shareAndJoin,
  startSharing,
  strokeIds,
  waitForStrokeCount,
} from "./helpers";

test("a joiner receives the content that existed before they arrived", async ({
  newClient,
}) => {
  const host = await newClient();
  await openApp(host);
  await drawStroke(host, { x: 200, y: 200 }, { x: 340, y: 260 });
  await drawStroke(host, { x: 220, y: 320 }, { x: 360, y: 380 });
  await waitForStrokeCount(host, 2);

  const link = await startSharing(host, "Hana");
  const guest = await newClient();
  await joinBoard(guest, link, "Gus");

  await waitForStrokeCount(guest, 2);
  expect((await strokeIds(guest)).sort()).toEqual((await strokeIds(host)).sort());
});

test("strokes sync live in both directions", async ({ newClient }) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await drawStroke(host, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(guest, 1);

  await drawStroke(guest, { x: 220, y: 320 }, { x: 360, y: 380 });
  await waitForStrokeCount(host, 2);

  expect((await strokeIds(host)).sort()).toEqual((await strokeIds(guest)).sort());
});

test("deleting a selection on one client removes it everywhere", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await drawStroke(host, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(guest, 1);

  // The guest selects everything and deletes it.
  await guest.keyboard.press("Control+a");
  await guest.keyboard.press("Delete");

  await waitForStrokeCount(guest, 0);
  await waitForStrokeCount(host, 0);
});

test("concurrent edits merge - both strokes survive", async ({ newClient }) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  // Draw on both clients at the same time; the CRDT must keep both.
  await Promise.all([
    drawStroke(host, { x: 200, y: 200 }, { x: 340, y: 260 }),
    drawStroke(guest, { x: 220, y: 320 }, { x: 360, y: 380 }),
  ]);

  await waitForStrokeCount(host, 2);
  await waitForStrokeCount(guest, 2);
  expect((await strokeIds(host)).sort()).toEqual((await strokeIds(guest)).sort());
});
