// The hourglass timer in a shared session: start / pause / reset sync to every
// collaborator, a finished countdown shows the board-wide "Time's up!" alert on
// everyone's screen (then auto-clears), the widget resizes aspect-locked, and
// the run state is undo-invisible (undo removes the widget, not the run).

import { test, expect, openApp, shareAndJoin } from "./helpers";
import type { Page } from "@playwright/test";

/** Insert a timer through the Insert gallery with a given duration / mode. */
async function insertTimer(
  page: Page,
  { h = 0, m = 0, s = 5, mode = "countdown" as "countdown" | "stopwatch" } = {},
): Promise<void> {
  await page.locator("#insertBtn").click();
  await page.locator('.tile[data-d="timer"]').click();
  if (mode === "stopwatch") {
    // A stopwatch always starts from 0 — the dialog shows no duration field.
    await page.getByRole("button", { name: "Stopwatch" }).click();
  } else {
    await page.locator("#tmH").fill(String(h));
    await page.locator("#tmM").fill(String(m));
    await page.locator("#tmS").fill(String(s));
  }
  await page.getByRole("button", { name: "Add to board" }).click();
}

async function waitForObjectCount(page: Page, n: number): Promise<void> {
  await page.waitForFunction(
    (want) => window.__mathsboard?.board().objects.length === want,
    n,
  );
}

/** The first object's box (the timer), read from the document. */
function timerBox(page: Page): Promise<{ w: number; h: number }> {
  return page.evaluate(() => {
    const o = window.__mathsboard!.board().objects[0] as unknown as {
      w: number;
      h: number;
    };
    return { w: o.w, h: o.h };
  });
}

test("start / pause / reset sync to every collaborator", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await insertTimer(host, { m: 0, s: 30 });
  await waitForObjectCount(guest, 1);

  // Start on the host — both clients see it running (the run state syncs).
  await host.locator(".itimer-btn.primary").click();
  for (const page of [host, guest]) {
    await page.waitForFunction(() => {
      const o = window.__mathsboard?.board().objects[0] as unknown as {
        running?: boolean;
      };
      return o?.running === true;
    });
  }
  // The guest's toggle now reads "Pause" (derived from the shared run state).
  await expect(guest.locator(".itimer-btn.primary")).toHaveText("Pause");

  // Reset on the GUEST — both clients clear the run and bump flipSeq.
  await guest.getByRole("button", { name: "Reset" }).click();
  for (const page of [host, guest]) {
    await page.waitForFunction(() => {
      const o = window.__mathsboard?.board().objects[0] as unknown as {
        running?: boolean;
        anchorMs?: number;
        flipSeq?: number;
      };
      return !o?.running && o?.anchorMs === undefined && (o?.flipSeq ?? 0) >= 1;
    });
  }
});

test("a finished countdown shows a board-wide Time's up! to everyone, then clears", async ({
  newClient,
}) => {
  const host = await newClient();
  const guest = await newClient();
  await openApp(host);
  await shareAndJoin(host, guest);

  await insertTimer(host, { m: 0, s: 2 }); // a 2-second countdown
  await waitForObjectCount(guest, 1);

  await host.locator(".itimer-btn.primary").click();

  // Both clients raise the banner when the countdown reaches zero.
  for (const page of [host, guest]) {
    await expect(page.locator(".timer-banner")).toBeVisible({ timeout: 6000 });
    await expect(page.locator(".timer-banner")).toHaveText(/Time.s up!/);
  }
  // ...and it auto-clears a few seconds later, on both.
  for (const page of [host, guest]) {
    await expect(page.locator(".timer-banner")).toHaveCount(0, { timeout: 8000 });
  }
});

test("a selected timer resizes, aspect-locked", async ({ newClient }) => {
  const page = await newClient();
  await openApp(page);

  await insertTimer(page, { m: 5, s: 0 });
  await waitForObjectCount(page, 1);

  // Select the timer by clicking a non-control part of the card (the readout).
  await page.locator("#selectBtn").click();
  await page.locator(".itimer-readout").click();
  await expect(page.locator(".whandle")).toHaveCount(8);

  const before = await timerBox(page);

  // Drag the SE handle (RESIZE_HANDLES order: nw n ne e se s sw w -> index 4).
  const se = page.locator(".whandle").nth(4);
  const hb = await se.boundingBox();
  if (!hb) throw new Error("SE handle not visible");
  const cx = hb.x + hb.width / 2;
  const cy = hb.y + hb.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy + 120, { steps: 10 });
  await page.mouse.up();

  const after = await timerBox(page);
  expect(after.w).toBeGreaterThan(before.w + 30);
  expect(after.h).toBeGreaterThan(before.h + 30);
  expect(after.w / after.h).toBeCloseTo(before.w / before.h, 2);
});

test("undo removes the timer, not its (undo-invisible) run state", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  await insertTimer(page, { m: 1, s: 0 });
  await page.locator(".itimer-btn.primary").click(); // start (INPUT_ORIGIN)
  await page.waitForFunction(() => {
    const o = window.__mathsboard?.board().objects[0] as unknown as {
      running?: boolean;
    };
    return o?.running === true;
  });

  // The last undoable edit is the insertion, not the start: one undo removes
  // the whole widget.
  await page.keyboard.press("Control+z");
  await waitForObjectCount(page, 0);
});

test("editing a running timer's settings always resets it", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  await insertTimer(page, { m: 0, s: 30 });
  await page.locator(".itimer-btn.primary").click(); // start
  await page.waitForFunction(
    () => window.__mathsboard!.board().objects[0].running === true,
  );

  // Edit the duration -> the run resets (anchor cleared, flipSeq bumped) and the
  // readout shows the new full duration.
  await page.locator(".itimer-readout").dblclick();
  await page.locator("#tmS").fill("45");
  await page.locator("#tmAdd").click();

  await page.waitForFunction(() => {
    const o = window.__mathsboard!.board().objects[0] as unknown as {
      running?: boolean;
      anchorMs?: number;
      flipSeq?: number;
      durationMs?: number;
    };
    return (
      !o.running &&
      o.anchorMs === undefined &&
      (o.flipSeq ?? 0) >= 1 &&
      o.durationMs === 45000
    );
  });
  await expect(page.locator(".itimer-readout")).toHaveText("00:45");
});
