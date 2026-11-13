import { expect, test } from "@playwright/test";

test("every workflow step is available while animations are still running", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Freeze animation frames so navigation cannot depend on either animation completing.
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};
  });
  await page.goto("/");

  const journey = page.locator("[data-hero-journey]");
  const stages = journey.getByRole("tab");
  const next = journey.locator("[data-next-step]");
  await expect(stages).toHaveCount(3);
  await expect(journey.locator("[data-terminal]")).not.toHaveAttribute("data-terminal-complete", "true");

  await stages.nth(2).click();
  await expect(stages.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(journey.locator("#journey-stage-studio")).toBeVisible();

  await stages.nth(1).click();
  await expect(journey.locator("#journey-stage-editor")).toBeVisible();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(journey.locator("#journey-stage-studio")).toBeVisible();

  await next.click();
  await expect(stages.nth(0)).toHaveAttribute("aria-selected", "true");
  await stages.nth(0).press("End");
  await expect(stages.nth(2)).toHaveAttribute("aria-selected", "true");
});
