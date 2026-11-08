import { expect, test } from "@playwright/test";

test("local website links Studio to the loopback hosted editor", async ({ page }) => {
  await page.goto("/");
  const studioLink = page.locator("[data-studio-link]").first();
  await expect(studioLink).toHaveAttribute("href", "http://127.0.0.1:49323/");
  const popup = page.waitForEvent("popup");
  await studioLink.click();
  const studio = await popup;
  await expect(studio).toHaveURL("http://127.0.0.1:49323/");
  await expect(studio.getByRole("dialog", { name: "Studio runs locally" })).toBeVisible();
});
