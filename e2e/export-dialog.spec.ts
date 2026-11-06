import { expect, test, type Page } from "@playwright/test";

async function openExport(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "More export formats", exact: true }).click();
  await page.getByRole("menu", { name: "Export as", exact: true })
    .locator(".export-format-option").filter({ hasText: "PNG" }).click();
  return page.getByRole("dialog", { name: "Export PNG" });
}

test("collapsed export studio fits common laptop heights without body scrolling", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1728, height: 960 }]) {
    await page.setViewportSize(viewport);
    const dialog = await openExport(page);
    const body = dialog.locator(".modal-body");
    await expect(dialog).toBeVisible();
    await expect.poll(() => body.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
    await expect(dialog).toBeInViewport();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("export studio keeps scrolling available when constrained", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 480 });
  const dialog = await openExport(page);
  const body = dialog.locator(".modal-body");
  await expect(body).toHaveCSS("overflow-y", "auto");
  await dialog.getByText("Advanced", { exact: true }).click();
  const exportButton = dialog.getByRole("button", { name: "Export PNG", exact: true });
  await exportButton.scrollIntoViewIfNeeded();
  await expect(exportButton).toBeInViewport();
});

test("expanded advanced options restore laptop-height scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const dialog = await openExport(page);
  const body = dialog.locator(".modal-body");
  await dialog.getByText("Advanced", { exact: true }).click();
  await expect(body).toHaveCSS("overflow-y", "auto");
  await expect.poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
});

test("oversized DPI-scaled raster exports fail visibly without closing the dialog", async ({ page }) => {
  const dialog = await openExport(page);
  await dialog.getByText("Advanced", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Size" }).selectOption("custom");
  await dialog.getByRole("spinbutton", { name: "Width px", exact: true }).fill("8192");
  await dialog.getByRole("spinbutton", { name: "Height px", exact: true }).fill("8192");
  await dialog.getByRole("combobox", { name: "DPI" }).selectOption("300");

  await dialog.getByRole("button", { name: "Export PNG", exact: true }).click();

  await expect(page.locator(".toast")).toContainText("Raster export dimensions exceed");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Export PNG", exact: true })).toBeEnabled();
});
