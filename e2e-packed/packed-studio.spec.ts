import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { ASYNC_DOCS, openSourceDrawer, waitForStudioReady } from "../e2e/support/helpers";

test("runs the packed CLI and opens the generic local Studio", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".local-studio-status")).toHaveCount(0);
  await expect(page.locator(".file-name")).toHaveText(".dgm");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Open .dgm", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Save As…", exact: true })).toBeVisible();
});

test("runs a packed Studio import, source edit, render, and SVG download journey", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="apiA"]')).toHaveCount(1);
  await expect(page.locator(".diagram-svg")).toContainText("Document API");

  const editedSource = readFileSync(ASYNC_DOCS, "utf8")
    .replace("  flow lr\n", '  flow lr\n  title "Packed Async Docs"\n')
    .replaceAll("Document API", "Packed Document API");
  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(editedSource);
  await editor.blur();

  await expect(page.locator(".title-input")).toHaveValue("Packed Async Docs");
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="apiA"]')).toHaveCount(1);
  await expect(page.locator(".diagram-svg")).toContainText("Packed Document API");
  await drawer.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "More export formats", exact: true }).click();
  await page.getByRole("menu", { name: "Export as", exact: true })
    .locator(".export-format-option").filter({ hasText: "SVG" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Export SVG", exact: true });
  const downloadPromise = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/packed-async-docs\.svg$/i);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const svg = await readFile(downloadPath!, "utf8");
  expect(svg).toContain("<svg");
  expect(svg).toContain("Packed Document API");
});
