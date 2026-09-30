import { expect, test } from "@playwright/test";
import { MOD, waitForStudioReady } from "./support/helpers";

test("a modal owns keyboard input without changing the diagram behind it", async ({ page }) => {
  await page.goto("/");
  await waitForStudioReady(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "modal-keyboard.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from('diagram modal-keyboard { grammar aws cloud-agnostic.actor client "Client" }'),
  });
  await waitForStudioReady(page);
  const resource = page.locator('[data-entity-kind="resource"][data-entity-id="client"]');
  await resource.click();
  const before = await resource.boundingBox();
  const tabCount = await page.getByRole("tab").count();
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "DumbDiagrams Studio help" });
  const close = modal.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  for (const shortcut of ["Delete", "Backspace", `${MOD}+x`, `${MOD}+z`, `${MOD}+g`, `${MOD}+n`, `${MOD}+w`, "ArrowRight"]) {
    await close.press(shortcut);
    await expect(modal).toBeVisible();
    await expect(resource).toHaveCount(1);
    await expect(page.getByRole("tab")).toHaveCount(tabCount);
    expect(await resource.boundingBox()).toEqual(before);
  }
  await close.press("Tab");
  await expect(modal.getByRole("button", { name: "Browse examples", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await page.getByRole("tabpanel", { name: "Diagram canvas" }).focus();
  await page.keyboard.press("Delete");
  await expect(resource).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(resource).toHaveCount(1);
});
