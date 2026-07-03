// Selection keyboard shortcuts (solo): duplicate, copy/paste, and arrow-nudge.
// These drive the real window keydown handler in App.tsx; board content is
// asserted through the read-only window hook since strokes live on <canvas>.

import {
  test,
  expect,
  boardState,
  drawStroke,
  openApp,
  waitForStrokeCount,
} from "./helpers";

test("Ctrl+D duplicates the selection as one undo step", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  await drawStroke(page, { x: 200, y: 200 }, { x: 320, y: 260 });
  await waitForStrokeCount(page, 1);

  await page.keyboard.press("Control+a"); // select all + switch to select tool
  await page.keyboard.press("Control+d");
  await waitForStrokeCount(page, 2);

  // The whole duplicate collapses to a single undo step.
  await page.keyboard.press("Control+z");
  await waitForStrokeCount(page, 1);
});

test("Ctrl+C / Ctrl+V copy and paste, cascading on repeat", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  await drawStroke(page, { x: 200, y: 200 }, { x: 320, y: 260 });
  await waitForStrokeCount(page, 1);

  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await waitForStrokeCount(page, 2);
  await page.keyboard.press("Control+v");
  await waitForStrokeCount(page, 3);
});

test("arrow keys nudge the selection", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);

  await drawStroke(page, { x: 200, y: 200 }, { x: 320, y: 260 });
  await waitForStrokeCount(page, 1);
  await page.keyboard.press("Control+a");

  const minX = (b: Awaited<ReturnType<typeof boardState>>): number =>
    Math.min(...b.strokes[0].points.map((p) => p.x));
  const before = minX(await boardState(page));

  for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowRight");

  await expect
    .poll(async () => minX(await boardState(page)))
    .toBeGreaterThan(before);
});
