import { expect, test } from "@playwright/test";

import { ASYNC_DOCS, waitForStudioReady } from "./support/helpers";

test("saves and closes a dirty tab from the unsaved changes dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Diagram name" });
  await title.fill("Saved and closed");
  await title.press("Enter");

  await page.locator(".workspace-tab.is-active .workspace-tab-close").click();
  const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Save and close", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/saved-and-closed\.dgm$/i);
  await expect(page.getByRole("tab")).toHaveCount(1);
});

test("restores a closed diagram from the recycle bin", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");

  await page.locator(".workspace-tab.is-active .workspace-tab-close").click();
  await expect(page.getByRole("tab")).toHaveCount(1);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: /Recycle bin/ }).click();
  const recycle = page.getByRole("dialog", { name: "Recycle bin" });
  await expect(recycle).toContainText("Async Docs");
  await recycle.getByRole("button", { name: "Restore", exact: true }).click();

  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");
  await expect(page.locator("#group-use1")).toHaveCount(1);
});

test("starts from a blank workspace when persisted state is corrupt", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dumb-diagrams:workspace-pending", "{not-json");
    localStorage.setItem("dumb-diagrams:workspace", "{also-not-json");
  });
  await page.goto("/");
  await waitForStudioReady(page);
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Untitled Diagram");
});
