import { expect, test, type Locator, type Page } from "@playwright/test";

test("landing prompts copy their full text and keep source downloads", async ({ page }) => {
  await installClipboard(page);
  await page.goto("/");

  const panels = page.locator(".example-panel");
  await expect(panels).toHaveCount(3);
  await expect(panels.locator('a[download][href*="prompt"]')).toHaveCount(0);
  await expect(panels.locator('a[download][href*=".dgm"]')).toHaveCount(3);
  await expect(panels.locator('a[download][href*="requirements.json"]')).toHaveCount(3);

  const prompt = page.locator(".example-panel:not([hidden]) .prompt-pane");
  await copyAndCheck(page, prompt);
});

test("reviewed example prompts copy their full text without prompt downloads", async ({ page }) => {
  await installClipboard(page);
  await page.goto("/docs/examples/");

  const cards = page.locator(".reviewed-card");
  await expect(cards.first()).toBeVisible();
  await expect(cards.locator('a[download][href*="prompt"]')).toHaveCount(0);
  const card = cards.first();
  if (await card.getAttribute("open") === null) {
    await card.locator("summary").click();
  }
  const prompt = card.locator('[role="tabpanel"][id$="-panel-prompt"]:visible');
  await expect(prompt).toBeVisible();
  await copyAndCheck(page, prompt);
  const variants = await card.locator(".reviewed-variant").count();
  await expect(card.locator('a[download][href$=".dgm"]')).toHaveCount(variants);
  await expect(card.locator('a[download][href$=".json"]')).toHaveCount(variants);
});

test("worked example prompt copies the generated asset text and keeps other downloads", async ({ page }) => {
  await installClipboard(page);
  await page.goto("/docs/engineering-drawing-extraction/");

  const example = page.locator(".worked-example");
  await expect(example.locator('a[download][href*="prompt"]')).toHaveCount(0);
  const prompt = example.locator(".worked-panel:not([hidden])");
  await copyAndCheck(page, prompt);
  await expect(example.locator('a[download][href$="diagram.dgm"]')).toHaveCount(1);
  await expect(example.locator('a[download][href$="diagram.requirements.json"]')).toHaveCount(1);
});

async function installClipboard(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          document.documentElement.dataset.copiedPrompt = value;
        },
      },
    });
  });
}

async function copyAndCheck(page: Page, panel: Locator) {
  const button = panel.locator("button.clipboard-copy[data-copy-target]");
  const targetId = await button.getAttribute("data-copy-target");
  expect(targetId).toBeTruthy();
  const target = page.locator(`[id="${targetId}"]`);
  const expected = await target.textContent();
  const accessibleName = await button.getAttribute("aria-label");
  const icon = button.locator("svg");
  const label = button.locator("[data-copy-label]");

  expect(expected).toBeTruthy();
  await expect(icon).toBeVisible();
  await expect(button).toHaveAttribute("aria-label", accessibleName!);
  await button.click();
  await expect.poll(() => page.locator("html").getAttribute("data-copied-prompt")).toBe(expected);
  await expect(label).toHaveText("Copied");
  await expect(icon).toBeVisible();
  await expect(button).toHaveAttribute("aria-label", accessibleName!);
  await expect(label).toHaveText("Copy", { timeout: 5_000 });
}
