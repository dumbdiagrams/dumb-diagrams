import { expect, test } from "@playwright/test";

test("quality presets reveal the runtime-generated winner", async ({ page }, testInfo) => {
  await page.goto("/docs/quality-and-scoring/");
  const presets = [
    ["Hard findings first", "Candidate B wins because hard findings"],
    ["Counts before weights", "Candidate A wins with fewer soft findings"],
    ["Penalty breaks the tie", "Candidate B wins on the lower penalty"],
  ] as const;

  for (const [label, verdict] of presets) {
    await page.getByRole("tab", { name: new RegExp(label) }).click();
    await expect(page.getByRole("tabpanel")).toContainText(verdict);
    expect(await page.getByRole("tabpanel").evaluate(panel => panel.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
    await page.waitForTimeout(450);
    await page.locator(".quality-explainer").screenshot({ path: testInfo.outputPath(`${label.toLowerCase().replaceAll(" ", "-")}.png`) });
  }

  const selected = page.getByRole("tab", { name: /Penalty breaks the tie/ });
  await selected.press("Home");
  await expect(page.getByRole("tab", { name: /Hard findings first/ })).toHaveAttribute("aria-selected", "true");
});

test("routing candidates remain keyboard-operable", async ({ page }) => {
  await page.goto("/docs/routing/");
  await page.getByRole("tab", { name: /Rejected/ }).focus();
  await page.getByRole("tab", { name: /Rejected/ }).press("ArrowRight");
  await expect(page.getByRole("tabpanel")).toContainText("Costly");
  expect(await page.getByRole("tabpanel").evaluate(panel => panel.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
  await expect(page.getByRole("tabpanel")).toContainText("300,160");
  await expect(page.locator(".cost-ledger")).toContainText("1,120");
});

test("mobile and no-JavaScript fallbacks preserve the teaching content", async ({ browser, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/docs/quality-and-scoring/");
  await expect(page.locator(".quality-explainer")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("tab", { name: /Counts before weights/ }).click();
  expect(await page.getByRole("tabpanel").evaluate(panel => panel.getAnimations({ subtree: true }).length)).toBe(0);

  await page.setViewportSize({ width: 720, height: 900 });
  await page.evaluate(() => document.documentElement.style.zoom = "2");
  await expect(page.getByRole("heading", { name: "The first different column decides" })).toBeVisible();

  const noJs = await browser.newContext({ baseURL: page.url(), javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
  const fallback = await noJs.newPage();
  await fallback.goto("/docs/quality-and-scoring/");
  await expect(fallback.locator(".quality-controls")).toBeHidden();
  await expect(fallback.locator("[data-explainer-panel]")).toHaveCount(3);
  for (const panel of await fallback.locator("[data-explainer-panel]").all()) await expect(panel).toBeVisible();

  await fallback.emulateMedia({ media: "print", reducedMotion: "reduce" });
  await expect(fallback.locator(".quality-controls")).toBeHidden();
  for (const panel of await fallback.locator("[data-explainer-panel]").all()) await expect(panel).toBeVisible();
  await noJs.close();
});
