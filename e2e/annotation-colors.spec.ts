import { expect, test } from "@playwright/test";

import { ROOT, openSourceDrawer, waitForStudioReady } from "./support/helpers";

test("annotation color themes update live, reset, and support keyboard activation", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(`${ROOT}/tests/compat/v1/kitchen-sink.dgm`);
  await waitForStudioReady(page);

  const annotation = page.locator('[data-entity-kind="annotation"][data-entity-id="note_text"]');
  await annotation.click();
  const sky = page.getByRole("button", { name: "Colour theme: Sky" });
  await expect(sky).toHaveAttribute("aria-pressed", "false");
  await sky.focus();
  await page.keyboard.press("Space");
  await expect(sky).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".diagram-svg #annotation-note_text rect")).toHaveAttribute("fill", "#e0eef8");

  const renderedText = page.locator(".diagram-svg #annotation-note_text text");
  await expect(renderedText).toHaveCSS("fill", "rgb(22, 57, 100)");
  await expect(annotation).toHaveCount(1);

  await sky.scrollIntoViewIfNeeded();
  const sourceDrawer = await openSourceDrawer(page);
  const sourceEditor = sourceDrawer.locator(".cm-content");
  await expect(sourceEditor).toContainText('background "#e0eef8"');
  await expect(sourceEditor).toContainText('color "#163964"');

  const reset = page.getByRole("button", { name: "Colour theme: Style default" });
  await reset.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".diagram-svg #annotation-note_text rect")).toHaveCount(0);
  await expect(sourceEditor).not.toContainText('background "#e0eef8"');
  await expect(sourceEditor).not.toContainText('color "#163964"');
});
