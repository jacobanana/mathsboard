// The welcome screen fronts every plain load: Continue resumes the working
// draft, New board starts fresh, and Open a saved board routes to the Boards
// manager. (Join-from-welcome is covered in joincode.spec.ts; share links
// bypassing the welcome screen is covered implicitly by share/sync specs.)

import {
  test,
  expect,
  drawStroke,
  openApp,
  waitForStrokeCount,
} from "./helpers";
import type { Page } from "@playwright/test";

/** Reload to a fresh welcome screen, letting the debounced draft save land. */
async function reloadToWelcome(page: Page): Promise<void> {
  await page.waitForTimeout(600); // draft autosave debounce is 400ms
  await page.goto("/");
  await expect(page.locator("#welcomeContinue")).toBeVisible();
}

test("Continue resumes the working draft", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);
  await drawStroke(page, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(page, 1);

  await reloadToWelcome(page);
  await expect(page.locator("#welcomeContinue")).toContainText("Continue");
  await page.locator("#welcomeContinue").click();
  await waitForStrokeCount(page, 1);
});

test("New board starts blank", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);
  await drawStroke(page, { x: 200, y: 200 }, { x: 340, y: 260 });
  await waitForStrokeCount(page, 1);

  await reloadToWelcome(page);
  await page.locator("#welcomeNew").click();
  await waitForStrokeCount(page, 0);
});

test("Open a saved board routes to the Boards manager", async ({
  newClient,
}) => {
  const page = await newClient();
  await page.goto("/");
  await page.locator("#welcomeBoards").click();
  await expect(
    page.getByRole("heading", { name: /Boards/ }),
  ).toBeVisible();
});
