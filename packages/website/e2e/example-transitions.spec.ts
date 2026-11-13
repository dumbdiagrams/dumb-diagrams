import { expect, test } from "@playwright/test";

test("example changes keep the previous panel inert during the transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const tabs = page.locator(".example-tabs [role=tab]");
  const panels = page.locator(".example-panel");

  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(panels.nth(0)).toHaveAttribute("inert", "");
  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(panels.nth(0)).not.toHaveAttribute("data-exiting", "");
  await expect(panels.nth(1)).not.toHaveAttribute("data-exiting", "", { timeout: 2000 });
  await expect(panels.nth(2)).toBeVisible();
});

test("example changes are immediate with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".example-tabs [role=tab]").nth(1).click();
  await expect(page.locator(".example-panel[data-exiting]")).toHaveCount(0);
  await expect(page.locator(".example-panel").nth(1)).toBeVisible();
});
