import { expect, test } from "@playwright/test";

test("reviewed examples keep diagrams, files, and model variants on the page", async ({ page }, testInfo) => {
  await page.goto("/docs/examples/");
  const card = page.locator(".reviewed-card").filter({ hasText: "AWS static website delivery" }).first();
  await expect(card).toBeVisible();
  const preview = card.locator("[data-diagram-preview]").first();
  await expect(preview.locator(".diagram-viewport img").first()).toBeVisible();
  await expect(preview.getByRole("link", { name: "Download original SVG" })).toHaveAttribute("download", "");
  await card.screenshot({ path: testInfo.outputPath("reviewed-examples-preview.png") });

  const zoomIn = preview.getByRole("button", { name: "Zoom in AWS static website delivery" });
  const zoom = preview.getByRole("button", { name: "Fit AWS static website delivery to preview" });
  const previewViewport = preview.locator(":scope > .diagram-viewport");
  const originalZoom = await previewViewport.evaluate(element => getComputedStyle(element).getPropertyValue("--diagram-zoom"));
  await zoomIn.click();
  await expect.poll(() => previewViewport.evaluate(element => getComputedStyle(element).getPropertyValue("--diagram-zoom"))).not.toBe(originalZoom);
  await zoom.click();
  await expect(zoom).toHaveText("100%");

  const dialog = preview.locator("dialog");
  await preview.getByRole("button", { name: "Expand diagram" }).click();
  await expect(dialog).toBeVisible();
  const expandedViewport = dialog.locator(".diagram-viewport");
  const expandedZoomIn = dialog.getByRole("button", { name: "Zoom in expanded AWS static website delivery" });
  const expandedZoomBefore = await expandedViewport.evaluate(element => getComputedStyle(element).getPropertyValue("--diagram-zoom"));
  await expandedZoomIn.click();
  await expect.poll(() => expandedViewport.evaluate(element => getComputedStyle(element).getPropertyValue("--diagram-zoom"))).not.toBe(expandedZoomBefore);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  const activeVariant = card.locator(".reviewed-variant").first();
  const sourceTab = activeVariant.getByRole("tab", { name: ".dgm source" });
  await sourceTab.focus();
  await sourceTab.press("ArrowRight");
  const requirementsTab = activeVariant.getByRole("tab", { name: "Requirements" });
  await expect(requirementsTab).toHaveAttribute("aria-selected", "true");
  await expect(activeVariant.getByRole("tabpanel")).toContainText('"version"');
  await expect(activeVariant.getByRole("button", { name: "Copy AWS static website delivery Requirements" })).toBeVisible();
  await expect(activeVariant.getByRole("tabpanel").getByRole("link", { name: "Download Requirements ↓" })).toHaveAttribute("download", "");

  const variants = card.locator(".reviewed-variant > label");
  if (await variants.count() > 1) {
    await variants.nth(1).click();
    await expect(card.locator(".reviewed-variant > input").nth(1)).toBeChecked();
    await expect(card.locator(".reviewed-variant").nth(1)).toContainText(".dgm source");
  }
});

test("reviewed example controls fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/docs/examples/");
  await expect(page.locator(".reviewed-preview").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
