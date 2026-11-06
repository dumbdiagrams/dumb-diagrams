import { expect, test } from "@playwright/test";

import { ASYNC_DOCS, waitForStudioReady } from "./support/helpers";

test("changes connector color with keyboard-only inspector controls", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);

  const badge = page.locator("[data-edge-badge-hit]").first();
  await badge.click();
  const inspector = page.getByRole("dialog", { name: "Connector", exact: true });
  await expect(inspector).toBeVisible();

  const teal = inspector.locator(".edge-color-options").getByRole("radio", { name: "Teal" });
  await teal.focus();
  await page.keyboard.press(" ");
  await expect(teal).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".diagram-svg #edge-e1 path[stroke]").first()).toHaveAttribute("stroke", "#0F766E");
});
