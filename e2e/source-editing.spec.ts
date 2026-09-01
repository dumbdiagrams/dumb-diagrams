import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { ASYNC_DOCS, entityBox, openSourceDrawer, waitForStudioReady } from "./support/helpers";

async function replaceSource(page: Page, source: string) {
  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(source);
  await editor.blur();
  return drawer;
}

test("keeps the last valid canvas and blocks save until source is repaired", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);
  await expect(page.locator("#group-use1")).toHaveCount(1);

  await replaceSource(page, "diagram broken { grammar aws");
  await expect(page.getByRole("alert")).toContainText("last valid diagram");
  await expect(page.locator("#group-use1")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name: "Source", exact: true }).locator(".issues")).toBeVisible();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Save", exact: true })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Save As…", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  const drawer = page.getByRole("dialog", { name: "Source", exact: true });
  await drawer.getByRole("button", { name: "Format", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Cannot format invalid source");

  await replaceSource(page, readFileSync(ASYNC_DOCS, "utf8"));
  await waitForStudioReady(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("#group-use1")).toHaveCount(1);
});

test("valid source edits sync to the canvas and survive reload", async ({ page }) => {
  await page.goto("/");
  await replaceSource(page, `diagram persisted-edit {
  grammar aws
  aws.aws-lambda handler "Handler" {}
}
`);
  await waitForStudioReady(page);
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="handler"]')).toHaveCount(1);

  await page.reload();
  await waitForStudioReady(page);
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="handler"]')).toHaveCount(1);
});

test("undo restores a canvas edit after repairing invalid source", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);

  const apiBefore = await entityBox(page, "resource", "apiA");
  const api = page.locator('[data-entity-kind="resource"][data-entity-id="apiA"]');
  const apiCenter = { x: apiBefore.x + apiBefore.width / 2, y: apiBefore.y + apiBefore.height / 2 };
  await page.mouse.move(apiCenter.x, apiCenter.y);
  await page.mouse.down();
  await page.mouse.move(apiCenter.x + 96, apiCenter.y + 48);
  await page.mouse.up();
  const apiMoved = await entityBox(page, "resource", "apiA");
  expect(Math.abs(apiMoved.x - apiBefore.x)).toBeGreaterThan(20);

  await replaceSource(page, "diagram broken { grammar aws");
  await expect(page.getByRole("alert")).toBeVisible();
  await replaceSource(page, readFileSync(ASYNC_DOCS, "utf8"));
  await waitForStudioReady(page);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const apiAfterUndo = await entityBox(page, "resource", "apiA");
  expect(Math.abs(apiAfterUndo.x - apiBefore.x)).toBeLessThan(12);
});
