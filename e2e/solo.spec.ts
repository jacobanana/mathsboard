// Baseline smoke: the app must work fully offline/solo (no share button
// pressed, no backend involvement). This anchors the collaboration suite -
// if drawing or undo is broken locally, every sync test fails for the wrong
// reason.

import {
  test,
  expect,
  boardState,
  collabState,
  drawStroke,
  openApp,
  waitForStrokeCount,
} from "./helpers";

test("loads solo and draws a stroke", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);

  const collab = await collabState(page);
  expect(collab.mode).toBe("solo");
  expect(collab.status).toBe("offline");

  await drawStroke(page, { x: 200, y: 200 }, { x: 340, y: 280 });
  await waitForStrokeCount(page, 1);
  const board = await boardState(page);
  expect(board.strokes[0].points.length).toBeGreaterThan(1);
});

test("undo and redo work locally", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);

  await drawStroke(page, { x: 200, y: 200 }, { x: 340, y: 280 });
  await waitForStrokeCount(page, 1);

  await page.keyboard.press("Control+z");
  await waitForStrokeCount(page, 0);

  await page.keyboard.press("Control+Shift+z");
  await waitForStrokeCount(page, 1);
});
