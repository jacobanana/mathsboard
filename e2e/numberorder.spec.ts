// The Number order widget end-to-end: a "tap one" round marks the biggest right
// and a wrong tap wrong, a "put in order" round builds a numbered chain that can
// be corrected by re-tapping, a session ends in a summary of every round, and
// the whole game (the current round, the tapped chain) syncs to a collaborator —
// the same shared-state model the flash cards and worksheet use.

import { test, expect, openApp, shareAndJoin } from "./helpers";
import type { Page } from "@playwright/test";

/** Insert a Number order game via the gallery, configured through the dialog. */
async function insertNumberOrder(
  page: Page,
  opts: { task?: string; target?: string; size?: string; count?: string; rounds?: string } = {},
): Promise<void> {
  await page.locator("#insertBtn").click();
  await page.locator('.tile[data-d="numberorder"]').click();
  if (opts.task) await page.getByRole("button", { name: opts.task, exact: true }).click();
  if (opts.target) await page.getByRole("button", { name: opts.target, exact: true }).click();
  if (opts.size) await page.getByRole("button", { name: opts.size, exact: true }).click();
  if (opts.count) await page.locator("#noCount").fill(opts.count);
  if (opts.rounds) await page.locator("#noRounds").fill(opts.rounds);
  await page.getByRole("button", { name: "Add to board" }).click();
  await page.locator(".iorder").waitFor();
}

/** The current round's tile values, in display order. */
async function tileValues(page: Page): Promise<number[]> {
  return (await page.locator(".io-tile .io-num").allInnerTexts()).map(Number);
}

test("tapping the biggest is marked right and a wrong tap wrong", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);
  await insertNumberOrder(page, { task: "Tap one", target: "Biggest" });

  await expect(page.locator(".io-prompt")).toHaveText("Tap the biggest");

  // Round 1: tap the biggest → correct.
  const v1 = await tileValues(page);
  await page.locator(".io-tile").nth(v1.indexOf(Math.max(...v1))).click();
  await expect(page.locator(".io-result.ok")).toBeVisible();
  await expect(page.locator(".io-tile.io-right .io-badge")).toHaveText("✓");

  // Round 2: tap the smallest → wrong, with a Try again offered.
  await page.locator(".io-next").click();
  const v2 = await tileValues(page);
  await page.locator(".io-tile").nth(v2.indexOf(Math.min(...v2))).click();
  await expect(page.locator(".io-result.no")).toBeVisible();
  await expect(page.locator(".io-retry")).toBeVisible();
});

test("a sort round builds a numbered chain, corrects on a re-tap, and locks when full", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);
  await insertNumberOrder(page, { task: "Put in order", target: "Smallest first", count: "4" });

  await expect(page.locator(".io-prompt")).toHaveText("Tap smallest → biggest");

  const v = await tileValues(page);
  const asc = v.map((_, i) => i).sort((a, b) => v[a] - v[b]); // correct index order

  // Tap the first two correctly; each takes a rising badge.
  await page.locator(".io-tile").nth(asc[0]).click();
  await page.locator(".io-tile").nth(asc[1]).click();
  await expect(page.locator(".io-tile.sel")).toHaveCount(2);

  // Tap a wrong tile, then tap it AGAIN to take it back out (the correction).
  await page.locator(".io-tile").nth(asc[3]).click();
  await expect(page.locator(".io-tile.sel")).toHaveCount(3);
  await page.locator(".io-tile").nth(asc[3]).click();
  await expect(page.locator(".io-tile.sel")).toHaveCount(2);

  // Complete correctly → every tile turns green and it locks.
  await page.locator(".io-tile").nth(asc[2]).click();
  await page.locator(".io-tile").nth(asc[3]).click();
  await expect(page.locator(".io-result.ok")).toBeVisible();
  await expect(page.locator(".io-tile.io-right")).toHaveCount(4);
});

test("a session ends in a summary of every round", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);
  await insertNumberOrder(page, { task: "Tap one", target: "Biggest", rounds: "4" });

  for (let i = 0; i < 4; i++) {
    const v = await tileValues(page);
    await page.locator(".io-tile").nth(v.indexOf(Math.max(...v))).click();
    await page.locator(".io-next").click();
  }

  await expect(page.locator(".io-summary")).toBeVisible();
  await expect(page.locator(".io-score-big")).toContainText("4");
  await expect(page.locator(".io-srow")).toHaveCount(4);
  await expect(page.locator(".io-srow.ok")).toHaveCount(4);
});

test("the current round and the tapped chain sync to a collaborator", async ({ newClient }) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await insertNumberOrder(host, { task: "Tap one", target: "Biggest" });
  await guest.locator(".iorder").waitFor();

  // Host taps the biggest; the guest independently derives the same green tile.
  const v = await tileValues(host);
  await host.locator(".io-tile").nth(v.indexOf(Math.max(...v))).click();
  await expect(host.locator(".io-result.ok")).toBeVisible();
  await expect(guest.locator(".io-tile.io-right")).toBeVisible();

  // Host advances; both move on to round 2.
  await host.locator(".io-next").click();
  for (const p of [host, guest]) {
    await expect(p.locator(".io-progress")).toHaveText("2 / 8");
  }
});
