import { expect, test } from "@playwright/test";

import { ASYNC_DOCS, waitForStudioReady } from "./support/helpers";

test("workspace tabs expose roving keyboard navigation and named close controls", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);

  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.first()).toHaveAttribute("tabindex", "-1");
  await expect(tabs.last()).toHaveAttribute("tabindex", "0");

  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(tabs.last()).toBeFocused();
  await expect(page.locator(".workspace-tab-close")).toHaveCount(2);
  for (const closeButton of await page.locator(".workspace-tab-close").all()) {
    await expect(closeButton).toHaveAttribute("aria-label", /Close /);
  }
  await expect(tabs.last()).toHaveAttribute("aria-controls", "diagram-canvas");
  await expect(page.getByRole("tabpanel", { name: "Diagram canvas" })).toBeVisible();
});

test("canvas item navigator supports keyboard selection, deletion, and canvas focus", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);

  await page.getByRole("button", { name: "Canvas items", exact: true }).click();
  const navigator = page.getByRole("dialog", { name: "Canvas items" });
  const options = navigator.getByRole("listbox", { name: "Editable canvas items" }).getByRole("option");
  await expect(options).not.toHaveCount(0);
  await options.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(navigator.getByRole("option", { selected: true })).toHaveCount(1);

  const countBeforeDelete = await options.count();
  await page.keyboard.press("Delete");
  await expect(page.locator(".toast")).toContainText("Deleted selection");
  await expect(options).toHaveCount(countBeforeDelete - 1);

  await navigator.getByRole("button", { name: "Focus canvas", exact: true }).click();
  await expect(page.getByTestId("canvas-stage")).toBeFocused();
});

test("source copy reports clipboard permission failures", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => { throw new DOMException("denied", "NotAllowedError"); },
        readText: async () => { throw new DOMException("denied", "NotAllowedError"); },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await page.getByRole("dialog", { name: "Source", exact: true })
    .getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("Could not copy source");
});
