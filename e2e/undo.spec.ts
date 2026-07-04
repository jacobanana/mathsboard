// Undo semantics in a shared session: the Y.UndoManager tracks only LOCAL
// transactions, so undoing must revert YOUR latest edit and never a
// collaborator's - even when theirs arrived after yours.

import {
  test,
  expect,
  drawStroke,
  openApp,
  shareAndJoin,
  strokeIds,
  waitForStrokeCount,
} from "./helpers";

test("undo reverts your own stroke, never a collaborator's", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  // Host draws first, then the guest draws on top.
  await drawStroke(host, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(guest, 1);
  const [hostStroke] = await strokeIds(host);

  await drawStroke(guest, { x: 220, y: 320 }, { x: 360, y: 380 });
  await waitForStrokeCount(host, 2);
  const guestStroke = (await strokeIds(guest)).find((id) => id !== hostStroke)!;

  // The host's undo removes the HOST stroke (their own latest edit), not the
  // guest's more recent one - on both clients.
  await host.keyboard.press("Control+z");
  await waitForStrokeCount(host, 1);
  await waitForStrokeCount(guest, 1);
  expect(await strokeIds(host)).toEqual([guestStroke]);
  expect(await strokeIds(guest)).toEqual([guestStroke]);

  // Redo brings it back for everyone.
  await host.keyboard.press("Control+Shift+z");
  await waitForStrokeCount(host, 2);
  await waitForStrokeCount(guest, 2);
});
