import { expect, test } from "@playwright/test";

import { ROOT, openSourceDrawer, waitForStudioReady } from "./support/helpers";

test("annotation color swatches update live, reset, and support keyboard activation", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(`${ROOT}/tests/compat/v1/kitchen-sink.dgm`);
  await waitForStudioReady(page);

  const annotation = page.locator('[data-entity-kind="annotation"][data-entity-id="note_text"]');
  await annotation.click();
  const background = page.getByRole("button", { name: "Background: Pale blue" });
  await expect(background).toHaveAttribute("aria-pressed", "false");
  await background.focus();
  await page.keyboard.press("Space");
  await expect(background).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".diagram-svg #annotation-note_text rect")).toHaveAttribute("fill", "#e8f3ff");

  const textColor = page.getByRole("button", { name: "Text color: Purple" });
  await textColor.focus();
  await page.keyboard.press("Space");
  await expect(textColor).toHaveAttribute("aria-pressed", "true");
  const renderedText = page.locator(".diagram-svg #annotation-note_text text");
  await expect(renderedText).toHaveCSS("fill", "rgb(91, 59, 145)");
  await expect(annotation).toHaveCount(1);

  await textColor.scrollIntoViewIfNeeded();
  const sourceDrawer = await openSourceDrawer(page);
  const sourceEditor = sourceDrawer.locator(".cm-content");
  await expect(sourceEditor).toContainText('background "#e8f3ff"');
  await expect(sourceEditor).toContainText('color "#5b3b91"');

  const resetBackground = page.getByRole("button", { name: "Background: Style default" });
  const resetColor = page.getByRole("button", { name: "Text color: Style default" });
  await resetBackground.focus();
  await page.keyboard.press("Space");
  await resetColor.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".diagram-svg #annotation-note_text rect")).toHaveCount(0);
  await expect(sourceEditor).not.toContainText('background "#e8f3ff"');
  await expect(sourceEditor).not.toContainText('color "#5b3b91"');
});
