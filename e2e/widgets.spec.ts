// Interactive widgets (the quiz/worksheet) in a shared session: every
// collaborator — not just whoever placed the widget — can select, move, edit
// and delete it, and the typed answers / marks sync live and land in the
// shared document state.

import { test, expect, openApp, shareAndJoin } from "./helpers";
import type { Page } from "@playwright/test";

/** Insert the default worksheet (7 × table) through the Insert gallery. */
async function insertWorksheet(page: Page): Promise<void> {
  await page.locator("#insertBtn").click();
  await page.locator('.tile[data-d="worksheet"]').click();
  await page.getByRole("button", { name: "Add to board" }).click();
}

async function waitForObjectCount(page: Page, n: number): Promise<void> {
  await page.waitForFunction(
    (want) => window.__mathsboard?.board().objects.length === want,
    n,
  );
}

/** The first stored answer field ("ans:<qid>") on the first object, if any. */
function firstStoredAnswer(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const o = window.__mathsboard!.board().objects[0] as unknown as Record<
      string,
      unknown
    >;
    const key = Object.keys(o).find((k) => k.startsWith("ans:"));
    return key ? (o[key] as string) : null;
  });
}

test("a guest can select a host's widget by clicking it and delete it", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await insertWorksheet(host);
  await waitForObjectCount(guest, 1);

  // Select mode + click on the card (a question label, not a control), then
  // the Delete key: the deletion syncing everywhere proves the click selected
  // (selection itself is local-only, so there's nothing remote to assert on).
  await guest.locator("#selectBtn").click();
  await guest.locator(".iworksheet .iw-q").first().click();
  await guest.keyboard.press("Delete");
  await waitForObjectCount(guest, 0);
  await waitForObjectCount(host, 0);
});

test("a guest can reconfigure a host's widget by double-clicking it", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await insertWorksheet(host); // defaults: 7 × table
  await waitForObjectCount(guest, 1);

  await guest.locator("#selectBtn").click();
  await guest.locator(".iworksheet .iw-q").first().dblclick();
  await guest.locator("#wsK").fill("9");
  await guest.locator("#wsAdd").click(); // "Save"

  // Both clients now hold 9 × table questions.
  for (const page of [host, guest]) {
    await page.waitForFunction(() => {
      const o = window.__mathsboard?.board().objects[0] as
        | { questions?: { b: number }[] }
        | undefined;
      return !!o?.questions && o.questions.every((q) => q.b === 9);
    });
    await expect(page.locator(".iworksheet .iw-title")).toHaveText("9 × table");
  }
});

test("typed answers sync live, and Check marks them for everyone", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await insertWorksheet(host); // 1×7, 2×7, ... 12×7
  await waitForObjectCount(guest, 1);

  // Guest answers Q1 correctly and Q2 wrongly; the host watches it live.
  await guest.locator(".iworksheet .iw-in").nth(0).fill("7");
  await guest.locator(".iworksheet .iw-in").nth(1).fill("99");
  await expect(host.locator(".iworksheet .iw-in").nth(0)).toHaveValue("7");
  await expect(host.locator(".iworksheet .iw-in").nth(1)).toHaveValue("99");

  // The values are document state, not just DOM.
  expect(await firstStoredAnswer(host)).not.toBeNull();

  // HOST checks — marks and the score appear on both sides.
  await host.locator(".iworksheet .iw-btn.check").click();
  for (const page of [host, guest]) {
    await expect(page.locator(".iworksheet .iw-mark").nth(0)).toHaveText("✓");
    await expect(page.locator(".iworksheet .iw-mark").nth(1)).toHaveText(
      "✗ 14",
    );
    await expect(page.locator(".iworksheet .iw-score")).toHaveText(
      "1 / 12 correct",
    );
  }
});

test("New questions clears everyone's answers and marks", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await insertWorksheet(host);
  await waitForObjectCount(guest, 1);

  await guest.locator(".iworksheet .iw-in").nth(0).fill("7");
  await guest.locator(".iworksheet .iw-btn.check").click();
  await expect(host.locator(".iworksheet .iw-score")).toHaveText(
    "1 / 12 correct",
  );

  await host.locator('.iworksheet .iw-btn[title="New questions"]').click();
  for (const page of [host, guest]) {
    await expect(page.locator(".iworksheet .iw-in").nth(0)).toHaveValue("");
    await expect(page.locator(".iworksheet .iw-mark").nth(0)).toHaveText("");
    await expect(page.locator(".iworksheet .iw-score")).toHaveText("");
  }
  // The stale per-question fields were pruned from the document.
  expect(await firstStoredAnswer(host)).toBeNull();
});

test("undo never reverts typed answers", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);

  await insertWorksheet(page);
  await page.locator(".iworksheet .iw-in").nth(0).fill("7");

  // Leave the input (its own key handling swallows shortcuts while focused;
  // canvas clicks preventDefault and so never steal focus from it).
  await page.locator(".iworksheet .iw-in").nth(0).blur();

  // The last undoable edit is the widget insertion, NOT the typing: one undo
  // removes the widget (answer included), not the answer alone.
  await page.keyboard.press("Control+z");
  await waitForObjectCount(page, 0);
});
