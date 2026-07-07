// The Flash cards widget end-to-end: a card flips to reveal the right/wrong
// side, a deck ends in a summary of every question, and the whole session (the
// current card, the flip, the typed answers) syncs to a collaborator — the same
// shared-state model the worksheet uses (see widgets.spec.ts).

import { test, expect, openApp, shareAndJoin } from "./helpers";
import type { Page } from "@playwright/test";

/** Insert the default Flash cards deck (Times table · Easy) via the gallery. */
async function insertFlashcards(page: Page): Promise<void> {
  await page.locator("#insertBtn").click();
  await page.locator('.tile[data-d="flashcards"]').click();
  await page.getByRole("button", { name: "Add to board" }).click();
  await page.locator(".iflash").waitFor();
}

/** The answer to the "a op b" shown on the current front face. */
function answerFor(qText: string): number {
  const [a, op, b] = qText.split(/\s+/);
  const A = Number(a);
  const B = Number(b);
  if (op === "×") return A * B;
  if (op === "÷") return A / B;
  if (op === "+") return A + B;
  return A - B; // − (U+2212)
}

/** Type an answer for the current card (right or deliberately wrong) and flip. */
async function answerCurrent(page: Page, right: boolean): Promise<number> {
  const q = await page.locator(".if-q").innerText();
  const ans = answerFor(q);
  await page.locator(".if-input").fill(String(right ? ans : ans + 1));
  await page.locator(".if-check").click();
  return ans;
}

test("flipping reveals the correct or wrong side with the worked answer", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);
  await insertFlashcards(page);

  // Card 1 answered correctly → green ✓ side showing "a op b = ans".
  const ans1 = await answerCurrent(page, true);
  await expect(page.locator(".if-flip.flipped.ok")).toBeVisible();
  await expect(page.locator(".if-badge")).toHaveText("✓");
  await expect(page.locator(".if-truth")).toContainText(String(ans1));

  // Next card answered wrong → red ✗ side (we still advance either way).
  await page.locator(".if-next").click();
  await answerCurrent(page, false);
  await expect(page.locator(".if-flip.flipped.no")).toBeVisible();
  await expect(page.locator(".if-badge")).toHaveText("✗");
});

test("a deck ends in a summary of every question", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);
  await insertFlashcards(page);

  // Shrink to a 4-card deck so the run is quick; editing restarts the session.
  await page.locator("#selectBtn").click();
  await page.locator(".iflash .if-head").dblclick();
  await page.locator("#fcCount").fill("4");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".if-front").waitFor();

  for (let i = 0; i < 4; i++) {
    await answerCurrent(page, true);
    await page.locator(".if-next").click();
  }

  await expect(page.locator(".if-summary")).toBeVisible();
  await expect(page.locator(".if-score-big")).toContainText("4");
  await expect(page.locator(".if-srow")).toHaveCount(4);
  await expect(page.locator(".if-srow.ok")).toHaveCount(4);
});

test("the current card, the flip and answers sync to a collaborator", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await insertFlashcards(host);
  await guest.locator(".iflash").waitFor();

  // Host answers and flips; the guest independently derives the same ✓ side.
  await answerCurrent(host, true);
  await expect(host.locator(".if-flip.flipped.ok")).toBeVisible();
  await expect(guest.locator(".if-flip.flipped.ok")).toBeVisible();

  // Host advances; both move on to card 2.
  await host.locator(".if-next").click();
  for (const p of [host, guest]) {
    await expect(p.locator(".if-progress")).toHaveText("2 / 10");
  }
});
