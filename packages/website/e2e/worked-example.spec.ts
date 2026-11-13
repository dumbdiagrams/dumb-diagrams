import { expect, test, type Locator } from "@playwright/test";

test("the notes walkthrough is readable and exposes the reviewed artifacts", async ({ page }, testInfo) => {
  await page.goto("/docs/engineering-drawing-extraction/");
  await expect(page.getByRole("heading", { level: 1, name: "Example: From notes to a diagram" })).toBeVisible();
  const viewer = page.locator(".diagram-viewer");
  const image = viewer.locator(":scope > .diagram-viewport img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1701);
  await expect(page.getByRole("link", { name: "Download SVG ↓", exact: true })).toHaveAttribute("download", "");
  await checkExampleFiles(page.locator('.worked-example'));
  await page.locator('.worked-panel:not([hidden])').screenshot({ path: testInfo.outputPath("notes-prompt-desktop.png") });
  await image.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("notes-example-desktop.png") });

  await checkViewer(viewer, "Engineering drawing extraction");
  const promptText = page.locator('.worked-prompt');
  expect(await promptText.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  const opened = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Open Engineering drawing extraction full size" }).click();
  const fullSize = await opened;
  await fullSize.waitForLoadState();
  await expect(fullSize.locator("svg")).toBeVisible();
  await expect(fullSize.locator("svg")).toContainText("Extract data steps");
  await fullSize.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await image.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await checkViewer(viewer, "Engineering drawing extraction");
  expect(await promptText.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.locator('.worked-panel:not([hidden])').screenshot({ path: testInfo.outputPath("notes-prompt-mobile.png") });
  await page.screenshot({ path: testInfo.outputPath("notes-example-mobile.png") });
  await page.getByRole("link", { name: "Auto-save and live file updates", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Auto-save and live file updates", exact: true })).toBeInViewport();
});

async function checkExampleFiles(example: Locator) {
  const promptTab = example.getByRole("tab", { name: "Prompt", exact: true });
  const prompt = example.getByRole("tabpanel");
  await expect(prompt).toHaveCount(1);
  await expect(prompt).toContainText("Add a separate Notes section");
  const text = prompt.locator("pre");
  await expect(text).toHaveCSS("white-space", "pre-wrap");
  const contrast = await text.evaluate(element => {
    const style = getComputedStyle(element);
    const luminance = (color: string) => {
      const rgb = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await example.page().evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value: string) => { document.documentElement.dataset.copiedExample = value; } },
  }));
  await prompt.getByRole("button", { name: "Copy Engineering drawing extraction Prompt", exact: true }).click();
  const generatedPrompt = await example.page().request.get("/worked-examples/engineering-drawing-extraction/prompt.txt");
  expect(generatedPrompt.ok()).toBe(true);
  expect(await example.page().evaluate(() => document.documentElement.dataset.copiedExample)).toBe((await generatedPrompt.text()).trimEnd());
  await expect(prompt.getByRole("link", { name: "Download Prompt ↓", exact: true })).toHaveCount(0);
  const copyButton = prompt.getByRole("button", { name: "Copy Engineering drawing extraction Prompt", exact: true });
  await expect(copyButton.locator("svg")).toBeVisible();

  await promptTab.focus();
  await promptTab.press("ArrowRight");
  await expect(example.getByRole("tab", { name: ".dgm source", exact: true })).toBeFocused();
  await expect(example.getByRole("tabpanel")).toContainText("diagram engineering-drawing-extraction");
  await expect(example.getByRole("link", { name: "Download .dgm source ↓", exact: true })).toHaveAttribute("download", "");
  await example.getByRole("tab", { name: ".dgm source", exact: true }).press("End");
  await expect(example.getByRole("tabpanel")).toContainText('"components"');
  await expect(example.getByRole("link", { name: "Download Requirements ↓", exact: true })).toHaveAttribute("download", "");
  await example.getByRole("tab", { name: "Requirements", exact: true }).press("Home");
  await expect(promptTab).toHaveAttribute("aria-selected", "true");
}

async function checkViewer(viewer: Locator, title: string) {
  const viewport = viewer.locator(":scope > .diagram-viewport");
  const image = viewport.locator("img");
  const imageWidth = () => image.evaluate(element => element.getBoundingClientRect().width);
  const originalWidth = await imageWidth();
  const zoomIn = viewer.getByRole("button", { name: `Zoom in ${title}`, exact: true });
  const zoomOut = viewer.getByRole("button", { name: `Zoom out ${title}`, exact: true });
  const reset = viewer.getByRole("button", { name: `Fit ${title} to preview`, exact: true });
  await zoomIn.click();
  await expect(reset).toHaveText("110%");
  await expect.poll(imageWidth).toBeGreaterThan(originalWidth);
  expect(await viewport.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await zoomOut.click();
  await expect(reset).toHaveText("100%");
  await zoomOut.click();
  await expect(reset).toHaveText("90%");
  await expect.poll(imageWidth).toBeLessThan(originalWidth);
  await reset.click();
  await expect(reset).toHaveText("100%");
  await expect.poll(imageWidth).toBeCloseTo(originalWidth, 0);

  const expand = viewer.getByRole("button", { name: "Expand diagram", exact: true });
  await expand.click();
  const dialog = viewer.getByRole("dialog", { name: `${title} expanded diagram`, exact: true });
  await expect(dialog).toBeVisible();
  const expandedImage = dialog.locator("img");
  const expandedWidth = await expandedImage.evaluate(element => element.getBoundingClientRect().width);
  await dialog.getByRole("button", { name: `Zoom in expanded ${title}`, exact: true }).click();
  await expect.poll(() => expandedImage.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(expandedWidth);
  const fits = await dialog.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
  });
  expect(fits).toBe(true);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expand.click();
  await viewer.page().keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(expand).toBeFocused();
}

test("the landing page uses the same working viewer", async ({ page }) => {
  await page.goto("/");
  const viewer = page.locator(".example-panel:not([hidden]) .diagram-viewer");
  await checkViewer(viewer, "AWS static website delivery");
});

test("the AWS cross-account walkthrough uses the reviewed prompt and diagram card", async ({ page }, testInfo) => {
  await page.goto("/docs/aws-cross-account-data-transfer/");
  const example = page.locator(".worked-example");
  await expect(example).toHaveCount(1);
  await expect(example.locator(".diagram-viewer")).toHaveCount(1);
  const viewer = example.locator(".diagram-viewer");
  const image = viewer.locator(":scope > .diagram-viewport img");
  await expect(image).toHaveAttribute("src", /\/diagrams\/aws-data-transfer-hub-preview\.svg$/);
  await expect(viewer.getByRole("link", { name: "Open Cross-account data transfer full size", exact: true })).toBeVisible();
  await expect(viewer.getByRole("link", { name: "Download SVG ↓", exact: true })).toHaveAttribute("href", /\/diagrams\/aws-data-transfer-hub\.svg$/);
  await example.screenshot({ path: testInfo.outputPath("cross-account-card-desktop.png") });

  const promptTab = example.getByRole("tab", { name: "Prompt", exact: true });
  const promptPanel = example.getByRole("tabpanel");
  const canonicalPrompt = await page.request.get("/diagrams/aws-data-transfer-hub-prompt.txt");
  expect(canonicalPrompt.ok()).toBe(true);
  const prompt = (await canonicalPrompt.text()).trimEnd();
  await expect(promptPanel.locator("pre")).toHaveText(prompt);
  await expect(promptPanel.getByRole("button", { name: "Copy Cross-account data transfer Prompt", exact: true }).locator("svg")).toBeVisible();
  await expect(promptPanel.getByRole("link", { name: "Download Prompt ↓", exact: true })).toHaveCount(0);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (value: string) => { document.documentElement.dataset.copiedExample = value; } },
  }));
  await promptPanel.getByRole("button", { name: "Copy Cross-account data transfer Prompt", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.copiedExample)).toBe(prompt);

  await promptTab.focus();
  await promptTab.press("ArrowRight");
  const sourceTab = example.getByRole("tab", { name: ".dgm source", exact: true });
  await expect(sourceTab).toBeFocused();
  await expect(example.getByRole("tabpanel")).toContainText("diagram aws-data-transfer-hub");
  await expect(example.getByRole("link", { name: "Download .dgm source ↓", exact: true })).toHaveAttribute("href", /\/diagrams\/aws-data-transfer-hub\.dgm$/);
  await sourceTab.press("ArrowRight");
  await expect(example.getByRole("tabpanel")).toContainText('"components"');
  await expect(example.getByRole("link", { name: "Download Requirements ↓", exact: true })).toHaveAttribute("href", /\/diagrams\/aws-data-transfer-hub\.requirements\.json$/);
  await example.getByRole("tab", { name: "Requirements", exact: true }).press("Home");
  await expect(promptTab).toHaveAttribute("aria-selected", "true");

  await checkViewer(viewer, "Cross-account data transfer");
  const opened = page.waitForEvent("popup");
  await viewer.getByRole("link", { name: "Open Cross-account data transfer full size", exact: true }).click();
  const fullSize = await opened;
  await fullSize.waitForLoadState();
  await expect(fullSize.locator("svg")).toBeVisible();
  await fullSize.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await example.screenshot({ path: testInfo.outputPath("cross-account-card-mobile.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await checkViewer(viewer, "Cross-account data transfer");
});
