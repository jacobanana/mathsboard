// The image tool: inserting a picture through the toolbar button (file dialog)
// and by dragging a file onto the board. Both paths upload through the real
// backend (/api/upload -> S3/MinIO in the compose stack) and place an `image`
// object carrying the returned same-origin URL — so these tests exercise the
// full validate -> probe -> upload -> place pipeline, not just the UI.
//
// SOLO tests: uploading doesn't need a shared session, so a single client is
// enough. The image tool + toolbar button + drop handling only exist in the
// collaborative build (COLLAB_ENABLED), which is what the compose stack builds.

import { test, expect, openApp } from "./helpers";
import type { Page } from "@playwright/test";

// A real, valid 1×1 red PNG (generated with correct CRCs). Small enough to
// inline; valid enough that both the server's type check and the client's
// `new Image()` size-probe accept it.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

/** The single image object on the board, or null (read raw so `url` is visible
 *  — helpers' BoardSnapshot only types the geometric fields). */
function imageObject(
  page: Page,
): Promise<{ type: string; url: string; x: number; y: number } | null> {
  return page.evaluate(() => {
    const objs = window.__mathsboard!.board().objects as unknown as {
      type: string;
      url: string;
      x: number;
      y: number;
    }[];
    return objs.find((o) => o.type === "image") ?? null;
  });
}

/** Wait until exactly one `image` object has landed on the board. */
async function waitForOneImage(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const objs = window.__mathsboard?.board().objects ?? [];
    return objs.length === 1 && objs[0].type === "image";
  });
}

test("the toolbar picture button uploads a chosen file and places it", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  // The dedicated toolbar button opens the image tool's dialog in CREATE mode.
  await page.locator("#imageBtn").click();
  await page.setInputFiles('input[type="file"]', {
    name: "dot.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_B64, "base64"),
  });
  // The preview appears once the file has been read + probed for its size.
  await expect(page.locator("img.img-preview")).toBeVisible();
  await page.getByRole("button", { name: "Add to board" }).click();

  await waitForOneImage(page);
  const img = await imageObject(page);
  // The placed shape carries the same-origin URL the upload endpoint returned.
  expect(img?.url).toMatch(/^\/api\/img\//);
});

test("dropping an image file on the board uploads and places it at the drop point", async ({
  newClient,
}) => {
  const page = await newClient();
  await openApp(page);

  const stage = page.locator("#stage");
  const box = await stage.boundingBox();
  if (!box) throw new Error("#stage is not visible");

  // Build a DataTransfer holding the PNG File inside the page, then dispatch the
  // native drag events at it (the documented Playwright DnD-with-files pattern).
  const dataTransfer = await page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "dot.png", { type: "image/png" }));
    return dt;
  }, PNG_B64);

  // Dragover shows the drop hint; drop (at a point well off-centre) triggers
  // the upload + placement.
  await stage.dispatchEvent("dragover", { dataTransfer });
  await expect(page.locator(".drop-overlay")).toBeVisible();
  await stage.dispatchEvent("drop", {
    dataTransfer,
    clientX: box.x + 300,
    clientY: box.y + 200,
  });

  // The hint clears and exactly one uploaded image lands on the board.
  await expect(page.locator(".drop-overlay")).toBeHidden();
  await waitForOneImage(page);
  const img = await imageObject(page);
  expect(img?.url).toMatch(/^\/api\/img\//);
});
