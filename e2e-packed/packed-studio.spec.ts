import { expect, test } from "@playwright/test";

test("runs the packed CLI and opens the generic local Studio", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".local-studio-status")).toHaveCount(0);
  await expect(page.locator(".file-name")).toHaveText(".dgm");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Open .dgm", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Save As…", exact: true })).toBeVisible();
});
