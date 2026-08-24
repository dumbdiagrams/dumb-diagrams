import { join } from "node:path";

import { expect, test } from "@playwright/test";

const ROOT = join(import.meta.dirname, "..");

test("opens File actions and creates a fresh document tab", async ({ page }) => {
  await page.goto("/");

  const privacyFooter = page.locator(".privacy-footer");
  await expect(privacyFooter).toContainText("© 2026 DumbDiagrams");
  await expect(privacyFooter).toContainText("Your data stays on your device");

  await expect(page.locator(".studio-tabbar > *")).toHaveClass([
    /studio-tabbar-leading/,
    /workspace-tabs/,
    /studio-tabbar-actions/,
  ]);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "New diagram", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Duplicate tab", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Close tab", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Reopen closed tab", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "New diagram", exact: true }).click();

  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-active")).toContainText(/Untitled diagram/i);
});

test("keeps the final default tab open without a close action", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.locator(".workspace-tab-close")).toHaveCount(0);

  await page.locator(".workspace-tab").click({ button: "right" });
  const tabMenu = page.getByRole("menu", { name: "Tab context menu" });
  await expect(tabMenu).toBeVisible();
  await expect(tabMenu.getByRole("menuitem", { name: /Close tab/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+KeyW");
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.locator(".workspace-tab.is-closing")).toHaveCount(0);
});

test("duplicates and closes a diagram from its tab context menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const tabs = page.locator(".workspace-tab");
  await expect(tabs).toHaveCount(2);

  await tabs.nth(0).click({ button: "right" });
  const tabMenu = page.getByRole("menu", { name: "Tab context menu" });
  await expect(tabMenu).toBeVisible();
  await expect(tabMenu.getByRole("menuitem", { name: "Duplicate tab", exact: true })).toHaveCount(1);
  await expect(tabMenu.getByRole("menuitem", { name: /Close tab/ })).toHaveCount(1);
  await tabMenu.getByRole("menuitem", { name: "Duplicate tab", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(3);

  const activeTab = page.locator(".workspace-tab.is-active");
  await expect(activeTab).toHaveCount(1);
  await activeTab.click({ button: "right" });
  await page.getByRole("menu", { name: "Tab context menu" }).getByRole("menuitem", { name: /Close tab/ }).click();
  await expect(page.locator(".workspace-tab.is-closing")).toHaveCount(1);
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("frames a new diagram artboard with visible canvas surrounding it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();

  const card = page.locator(".diagram-svg svg");
  await expect(card).toBeVisible();
  const metrics = await page.locator(".canvas-stage").evaluate((stage) => {
    const stageRect = stage.getBoundingClientRect();
    const cardRect = stage.querySelector<HTMLElement>(".diagram-svg svg")?.getBoundingClientRect();
    if (!cardRect) throw new Error("Empty diagram artboard is missing");
    return {
      horizontalOffset: Math.abs(
        (cardRect.left + cardRect.width / 2) - (stageRect.left + stageRect.width / 2),
      ),
      verticalOffset: Math.abs(
        (cardRect.top + cardRect.height / 2) - (stageRect.top + stageRect.height / 2),
      ),
      leftMargin: cardRect.left - stageRect.left,
      rightMargin: stageRect.right - cardRect.right,
      topMargin: cardRect.top - stageRect.top,
      bottomMargin: stageRect.bottom - cardRect.bottom,
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
    };
  });

  expect(metrics.horizontalOffset).toBeLessThan(metrics.stageWidth * 0.08);
  expect(metrics.verticalOffset).toBeLessThan(metrics.stageHeight * 0.08);
  expect(metrics.leftMargin).toBeGreaterThan(48);
  expect(metrics.rightMargin).toBeGreaterThan(48);
  expect(metrics.topMargin).toBeGreaterThan(48);
  expect(metrics.bottomMargin).toBeGreaterThan(48);
});

test("caps open diagrams at ten while keeping Chrome-like tab widths", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  const sparseStripMetrics = await page.locator(".workspace-tab-scroll").evaluate((element) => {
    const tab = element.querySelector<HTMLElement>(".workspace-tab");
    if (!tab) throw new Error("Initial workspace tab is missing");
    return {
      tabWidth: tab.getBoundingClientRect().width,
    };
  });
  expect(sparseStripMetrics.tabWidth).toBeGreaterThanOrEqual(132);
  expect(sparseStripMetrics.tabWidth).toBeLessThanOrEqual(240);

  for (let index = 0; index < 9; index += 1) {
    const newButton = page.getByRole("button", { name: "New diagram", exact: true });
    await expect(newButton).toHaveCount(1);
    await newButton.click();
    await expect(page.getByRole("tab")).toHaveCount(index + 2);
  }

  await expect(page.getByRole("tab")).toHaveCount(10);
  const limitedNewButton = page.locator(".workspace-tab-new");
  await expect(limitedNewButton).toBeDisabled();
  await expect(limitedNewButton).toHaveAttribute(
    "title",
    "Maximum reached: 10 open diagrams. Close a tab to create another.",
  );

  const stripMetrics = await page.locator(".workspace-tab-scroll").evaluate((element) => {
    const style = window.getComputedStyle(element);
    const closeStyles = [...element.querySelectorAll<HTMLElement>(".workspace-tab-close")]
      .map((close) => window.getComputedStyle(close));
    return {
      overflowX: style.overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      closeControlsVisible: closeStyles.every((close) => close.opacity !== "0" && close.pointerEvents !== "none"),
    };
  });
  expect(stripMetrics.overflowX).toBe("auto");
  expect(stripMetrics.scrollWidth).toBeGreaterThan(stripMetrics.clientWidth);
  expect(stripMetrics.closeControlsVisible).toBe(true);

  const limitTooltip = page.locator(".workspace-tab-new-control");
  await limitTooltip.hover();
  await expect(page.locator(".workspace-tab-new-tooltip")).toBeVisible();
  await expect(page.locator(".workspace-tab-new-tooltip")).toContainText("Maximum reached");
  await expect(page.locator(".workspace-tab-new-tooltip")).toContainText("10 open diagrams");
});

test("opens the Help and Examples modals and launches an example in a new tab", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Browse examples", exact: true }).click();
  const examples = page.getByRole("dialog", { name: "Browse examples" });
  await expect(examples).toBeVisible();
  await expect(examples.locator(".example-card")).toHaveCount(3);
  await expect(examples.getByText("Creation prompt", { exact: true })).toHaveCount(3);
  await expect(examples.locator(".example-prompt pre")).toHaveCount(3);
  await expect(examples.locator(".example-prompt pre").nth(0)).toContainText(
    'Create a diagram titled "Claims processing with Amazon Bedrock"',
  );
  await expect(examples.locator(".example-prompt pre").nth(1)).toContainText(
    'Create a diagram titled "AWS Data Transfer Hub"',
  );
  await expect(examples.locator(".example-prompt pre").nth(2)).toContainText(
    'Create a diagram titled "Highly available AWS web application"',
  );
  await examples.getByRole("button", { name: "Open", exact: true }).first().click();
  await expect(page.getByRole("tab")).toHaveCount(2);

  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "DumbDiagrams Studio help" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "DumbDiagrams Studio help" })).toHaveCount(0);
});

test("keeps the Help menu inside the viewport", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Help", exact: true }).click();

  const menu = page.getByRole("menu", { name: "Help", exact: true });
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  const viewport = page.viewportSize();

  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height);
});

test("opens the format picker and export studio with auto-filled canvas options", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "More export formats", exact: true }).click();
  const picker = page.getByRole("menu", { name: "Export as", exact: true });
  await expect(picker).toBeVisible();
  await expect(picker.locator(".export-format-option")).toHaveCount(11);
  await picker.locator(".export-format-option").filter({ hasText: "PNG" }).click();

  const dialog = page.getByRole("dialog", { name: "Export PNG" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Entire diagram/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Selection only/ })).toBeDisabled();
  await expect(dialog.getByText(/Auto-filled from the full canvas/)).toBeVisible();
  await expect(dialog.getByText(/Advanced/)).toBeVisible();

  await dialog.locator("select").first().selectOption("svg");
  const svgDialog = page.getByRole("dialog", { name: "Export SVG" });
  await expect(svgDialog).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await svgDialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  await expect(svgDialog).toHaveCount(0);
});

test("opens multiple .dgm files as separate tabs", async ({ page }) => {
  await page.goto("/");
  const input = page.locator('input[type="file"]');
  await input.setInputFiles([
    `${ROOT}/examples/src/async-docs.dgm`,
    `${ROOT}/examples/src/transfer-hub.dgm`,
  ]);

  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.locator(".workspace-tab")).toContainText(["Async Docs", "Async Docs", "Transfer Hub"]);
});

test("updates an imported filename when the diagram is renamed", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(`${ROOT}/examples/src/async-docs.dgm`);

  const title = page.getByRole("textbox", { name: "Diagram name", exact: true });
  await expect(title).toHaveValue("Async Docs");
  await expect(page.locator(".file-name")).toHaveText("async-docs.dgm");

  await title.fill("hhh");
  await title.press("Enter");

  await expect(page.locator(".file-name")).toHaveText("hhh.dgm");
  await expect(page.locator(".workspace-tab.is-active .workspace-tab-filename")).toHaveText("hhh.dgm");

  await page.getByRole("button", { name: "File", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("hhh.dgm");
});

test("prompts before discarding a dirty tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Diagram name" });
  await title.fill("Changed diagram");
  await title.press("Enter");

  await page.locator(".workspace-tab.is-active .workspace-tab-close").click();
  const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(1);
});

test("reopens the most recently closed tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.locator(".workspace-tab.is-active .workspace-tab-close").click();
  await expect(page.getByRole("tab")).toHaveCount(1);

  await page.keyboard.press("Control+KeyK");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  const search = palette.getByRole("searchbox", { name: "Search commands" });
  await search.fill("reopen closed tab");
  await palette.getByRole("option", { name: /Reopen closed tab/ }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-active")).toContainText(/Untitled diagram/i);
});

test("restores each tab's viewport when switching tabs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const initialReadout = await page.locator(".status-capsule-readout").textContent();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const customizedReadout = await page.locator(".status-capsule-readout").textContent();
  expect(customizedReadout).not.toBe(initialReadout);
  await page.getByRole("tab").first().click();
  await expect(page.locator(".status-capsule-readout")).not.toHaveText(customizedReadout ?? "");
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator(".status-capsule-readout")).toHaveText(customizedReadout ?? "");
});

test("reorders tabs with drag and preserves the new order after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const tabs = page.locator(".workspace-tab");
  await expect(tabs).toHaveCount(2);
  await tabs.nth(1).dragTo(tabs.nth(0));
  await expect(page.locator(".workspace-tab.is-active")).toContainText(/Untitled diagram/i);
  await page.reload();
  await expect(page.locator(".workspace-tab.is-active")).toContainText(/Untitled diagram/i);
});

test("downloads the canonical source from Save and clears the dirty marker", async ({ page }) => {
  await page.goto("/");
  const title = page.getByRole("textbox", { name: "Diagram name" });
  await title.fill("Saved diagram");
  await title.press("Enter");
  await expect(page.locator(".dirty-pill")).toHaveCount(1);

  await page.getByRole("button", { name: "File", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/saved-diagram\.dgm$/i);
  await expect(page.locator(".dirty-pill")).toHaveCount(0);
});

test("restores open tabs after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("opens the command palette with the keyboard shortcut", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+KeyK");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  expect(await palette.getByRole("option").count()).toBeGreaterThanOrEqual(18);
  await expect(palette.getByRole("option", { name: /Zoom in/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
});

test("contains long unbroken diagram names inside the top bar", async ({ page }) => {
  await page.goto("/");
  const title = page.getByRole("textbox", { name: "Diagram name" });
  await title.fill("x".repeat(120));
  await title.press("Enter");

  const metrics = await page.locator(".floating-topbar").evaluate((topbar) => {
    const fileName = topbar.querySelector<HTMLElement>(".file-name")!;
    const topbarRect = topbar.getBoundingClientRect();
    const fileRect = fileName.getBoundingClientRect();
    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fileInside: fileRect.right <= topbarRect.right,
      fileWidth: fileRect.width,
      fileScrollWidth: fileName.scrollWidth,
    };
  });
  expect(metrics.bodyOverflow).toBe(0);
  expect(metrics.fileInside).toBe(true);
  expect(metrics.fileWidth).toBeLessThanOrEqual(320);
  expect(metrics.fileScrollWidth).toBeGreaterThanOrEqual(metrics.fileWidth);
});
