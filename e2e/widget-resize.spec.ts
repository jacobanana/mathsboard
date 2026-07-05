// A resizable widget (the die) shows DOM resize handles when selected and
// resizes when a handle is dragged — the WidgetHandleLayer path, the widget
// analogue of the canvas resize handles. The box stays aspect-locked.

import { test, expect, openApp } from "./helpers";
import type { Page } from "@playwright/test";

/** Insert the default die through the Insert gallery. */
async function insertDie(page: Page): Promise<void> {
  await page.locator("#insertBtn").click();
  await page.locator('.tile[data-d="dice"]').click();
  await page.getByRole("button", { name: "Add to board" }).click();
}

/** The first object's box (the die), read from the document. */
function dieBox(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => {
    const o = window.__mathsboard!.board().objects[0] as unknown as {
      w: number;
      h: number;
    };
    return { w: o.w, h: o.h };
  });
}

test("a selected die shows resize handles and resizes when dragged", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  await insertDie(page);
  await page.waitForFunction(
    () => window.__mathsboard?.board().objects.length === 1,
  );

  // Select the die (press-to-select is mirrored by the WidgetLayer).
  await page.locator("#selectBtn").click();
  await page.locator(".idice").click();

  // Eight handles float over the selected widget.
  await expect(page.locator(".whandle")).toHaveCount(8);

  const before = await dieBox(page);

  // Drag the SE handle (RESIZE_HANDLES order: nw n ne e se s sw w -> index 4).
  const se = page.locator(".whandle").nth(4);
  const hb = await se.boundingBox();
  if (!hb) throw new Error("SE handle not visible");
  const cx = hb.x + hb.width / 2;
  const cy = hb.y + hb.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 140, cy + 140, { steps: 10 });
  await page.mouse.up();

  const after = await dieBox(page);
  expect(after.w).toBeGreaterThan(before.w + 40);
  expect(after.h).toBeGreaterThan(before.h + 40);
  // Aspect ratio preserved through the resize.
  expect(after.w / after.h).toBeCloseTo(before.w / before.h, 2);

  // One resize drag == one undo step: undo restores the original box.
  await page.keyboard.press("Control+z");
  await page.waitForFunction((w0) => {
    const o = window.__mathsboard!.board().objects[0] as unknown as {
      w: number;
    };
    return Math.abs(o.w - w0) < 0.5;
  }, before.w);

  // Deselecting (a click on empty canvas) removes the handles.
  await page.mouse.click(cx + 300, cy + 300);
  await expect(page.locator(".whandle")).toHaveCount(0);
});
