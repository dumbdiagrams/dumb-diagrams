import { expect, test, type Locator, type Page } from "@playwright/test";

import { SIMPLE_SERVERLESS, waitForStudioReady } from "./support/helpers";

async function expectDrawerFits(page: Page, drawer: Locator, width: number, height: number) {
  await expect.poll(() => drawer.evaluate((panel) => {
    const panelRect = panel.getBoundingClientRect();
    const toolbarRect = document.querySelector<HTMLElement>(".floating-topbar")?.getBoundingClientRect();
    const railRect = document.querySelector<HTMLElement>(".tool-dock")?.getBoundingClientRect();
    return Boolean(
      toolbarRect && railRect
        && panelRect.top >= toolbarRect.bottom - 1
        && panelRect.left >= railRect.right - 1
        && panelRect.right <= window.innerWidth + 1
        && panelRect.bottom <= window.innerHeight + 1,
    );
  })).toBe(true);

  const metrics = await page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>(".tool-dock")!.getBoundingClientRect();
    const toolbar = document.querySelector<HTMLElement>(".floating-topbar")!.getBoundingClientRect();
    const panelElement = document.querySelector<HTMLElement>(".floating-panel.drawer-sheet")!;
    const panel = panelElement.getBoundingClientRect();
    const heading = panelElement.querySelector(".floating-panel-header h2")?.getBoundingClientRect();
    const search = panelElement.querySelector<HTMLElement>(".drawer-search-input, .cm-content, .layers-search")?.getBoundingClientRect();
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      railRight: rail.right,
      toolbarBottom: toolbar.bottom,
      panelLeft: panel.left,
      panelRight: panel.right,
      panelTop: panel.top,
      panelBottom: panel.bottom,
      headingLeft: heading?.left ?? panel.left,
      searchLeft: search?.left ?? panel.left,
    };
  });

  expect(metrics.overflowX, `${width}×${height} horizontal overflow`).toBeLessThanOrEqual(0);
  expect(metrics.panelTop).toBeGreaterThanOrEqual(metrics.toolbarBottom - 1);
  expect(metrics.panelLeft).toBeGreaterThanOrEqual(metrics.railRight - 1);
  expect(metrics.headingLeft).toBeGreaterThanOrEqual(metrics.railRight - 1);
  expect(metrics.searchLeft).toBeGreaterThanOrEqual(metrics.railRight - 1);
  expect(metrics.panelRight).toBeLessThanOrEqual(width + 1);
  expect(metrics.panelBottom).toBeLessThanOrEqual(height + 1);
}

test("keeps the left drawers and tool rail usable in split-screen windows", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/");
  await waitForStudioReady(page);
  await page.locator('input[type="file"]').setInputFiles(SIMPLE_SERVERLESS);
  await waitForStudioReady(page);
  const inspector = page.getByRole("dialog").filter({ has: page.locator("#inspector-label") });

  for (const viewport of [
    { width: 894, height: 967 },
    { width: 768, height: 800 },
    { width: 640, height: 800 },
    { width: 480, height: 800 },
    { width: 640, height: 360 },
  ]) {
    await page.setViewportSize(viewport);
    const navigatorTrigger = page.getByRole("button", { name: "Canvas items" });
    await navigatorTrigger.click();
    await page.getByRole("option", { name: "resource aws.aws-lambda", exact: true }).click();
    await navigatorTrigger.click();
    await expect(inspector).toBeVisible();

    await page.getByRole("button", { name: "Resources", exact: true }).click();
    const resources = page.getByRole("dialog", { name: "Resources", exact: true });
    await expect(resources).toBeVisible();
    await expectDrawerFits(page, resources, viewport.width, viewport.height);
    if (viewport.width < 887) await expect(inspector).not.toBeVisible();
    else await expect(inspector).toBeVisible();

    const resourceSearch = resources.getByRole("textbox", { name: "Search catalog", exact: true });
    await resourceSearch.fill("Lambda");
    await expect(resourceSearch).toHaveValue("Lambda");
    const awsTab = resources.getByRole("tab", { name: "AWS", exact: true });
    await awsTab.click();
    await expect(awsTab).toHaveAttribute("aria-selected", "true");
    const lambdaCard = resources.locator('[data-catalog-type="aws.aws-lambda"]');
    await expect(lambdaCard).toBeVisible();
    await lambdaCard.locator("button.palette-item").click({ trial: true });

    if (viewport.height <= 360) {
      await resourceSearch.fill("");
      await resources.getByRole("tab", { name: "All", exact: true }).click();
      const cards = resources.locator(".palette-card");
      await expect(cards).toHaveCount(80);
      await cards.last().scrollIntoViewIfNeeded();
      await expect.poll(() => cards.count()).toBeGreaterThan(80);
    }

    await page.getByRole("button", { name: "Boundaries", exact: true }).click();
    const boundaries = page.getByRole("dialog", { name: "Boundaries", exact: true });
    await expect(boundaries).toBeVisible();
    await expectDrawerFits(page, boundaries, viewport.width, viewport.height);
    if (viewport.width < 887) await expect(inspector).not.toBeVisible();
    else await expect(inspector).toBeVisible();

    if (viewport.width === 894) {
      const inspectorMetrics = await inspector.evaluate((panel) => {
        const rect = panel.getBoundingClientRect();
        const toolbar = document.querySelector<HTMLElement>(".floating-topbar")!.getBoundingClientRect();
        const close = panel.querySelector<HTMLElement>("button[aria-label='Close']")!.getBoundingClientRect();
        return {
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          top: rect.top,
          right: rect.right,
          toolbarBottom: toolbar.bottom,
          closeLeft: close.left,
          closeRight: close.right,
          closeBottom: close.bottom,
        };
      });
      expect(inspectorMetrics.overflowX).toBeLessThanOrEqual(0);
      expect(inspectorMetrics.top).toBeGreaterThanOrEqual(inspectorMetrics.toolbarBottom - 1);
      expect(inspectorMetrics.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(inspectorMetrics.closeLeft).toBeGreaterThanOrEqual(0);
      expect(inspectorMetrics.closeRight).toBeLessThanOrEqual(viewport.width + 1);
      expect(inspectorMetrics.closeBottom).toBeLessThanOrEqual(viewport.height + 1);
    }

    const boundarySearch = boundaries.getByRole("textbox", { name: "Search catalog", exact: true });
    await boundarySearch.fill("network");
    await expect(boundarySearch).toHaveValue("network");
    const boundaryAwsTab = boundaries.getByRole("tab", { name: "AWS", exact: true });
    await boundaryAwsTab.click();
    await expect(boundaryAwsTab).toHaveAttribute("aria-selected", "true");
    await boundarySearch.fill("");
    const boundaryCard = boundaries.locator(".palette-card.is-group button.palette-item").first();
    await expect(boundaryCard).toBeVisible();
    await boundaryCard.click({ trial: true });

    if (viewport.height <= 360) {
      const dock = page.getByRole("navigation", { name: "Diagram tools" });
      await dock.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    }
    const sourceButton = page.getByRole("button", { name: "Source", exact: true });
    if (viewport.height <= 360) {
      await sourceButton.scrollIntoViewIfNeeded();
      const sourceRailMetrics = await sourceButton.evaluate((button) => {
        const buttonRect = button.getBoundingClientRect();
        const dockRect = button.closest(".tool-dock")!.getBoundingClientRect();
        return {
          buttonTop: buttonRect.top,
          buttonBottom: buttonRect.bottom,
          buttonWidth: buttonRect.width,
          buttonHeight: buttonRect.height,
          visibleTop: Math.max(dockRect.top, 0),
          visibleBottom: Math.min(dockRect.bottom, window.innerHeight),
        };
      });
      expect(sourceRailMetrics.buttonTop).toBeGreaterThanOrEqual(sourceRailMetrics.visibleTop - 1);
      expect(sourceRailMetrics.buttonBottom).toBeLessThanOrEqual(sourceRailMetrics.visibleBottom + 1);
      expect(sourceRailMetrics.buttonWidth).toBeGreaterThanOrEqual(36);
      expect(sourceRailMetrics.buttonHeight).toBeGreaterThanOrEqual(40);
    }
    await sourceButton.click();
    const source = page.getByRole("dialog", { name: "Source", exact: true });
    await expect(source).toBeVisible();
    await expectDrawerFits(page, source, viewport.width, viewport.height);
    const sourceEditor = source.locator(".cm-content");
    await expect(sourceEditor).toBeVisible();
    await sourceEditor.click({ trial: true });
    await source.getByRole("button", { name: "Format", exact: true }).click({ trial: true });

    if (viewport.height <= 360) {
      const layersButton = page.getByRole("button", { name: "Layers", exact: true });
      await layersButton.scrollIntoViewIfNeeded();
      const railMetrics = await layersButton.evaluate((button) => {
        const buttonRect = button.getBoundingClientRect();
        const dockRect = button.closest(".tool-dock")!.getBoundingClientRect();
        return {
          buttonTop: buttonRect.top,
          buttonBottom: buttonRect.bottom,
          buttonWidth: buttonRect.width,
          buttonHeight: buttonRect.height,
          visibleTop: Math.max(dockRect.top, 0),
          visibleBottom: Math.min(dockRect.bottom, window.innerHeight),
        };
      });
      expect(railMetrics.buttonTop).toBeGreaterThanOrEqual(railMetrics.visibleTop - 1);
      expect(railMetrics.buttonBottom).toBeLessThanOrEqual(railMetrics.visibleBottom + 1);
      expect(railMetrics.buttonWidth).toBeGreaterThanOrEqual(36);
      expect(railMetrics.buttonHeight).toBeGreaterThanOrEqual(40);
    }
    await page.getByRole("button", { name: "Layers", exact: true }).click();
    const layers = page.getByRole("dialog", { name: "Layers", exact: true });
    await expect(layers).toBeVisible();
    await expectDrawerFits(page, layers, viewport.width, viewport.height);
    const layersSearch = layers.getByRole("textbox", { name: "Search layers", exact: true });
    await layersSearch.fill("Request handler");
    await expect(layersSearch).toHaveValue("Request handler");
    const layer = layers.locator(".layer-select").filter({ hasText: "Request handler" }).first();
    await expect(layer).toBeVisible();
    await layer.click({ trial: true });

    await page.getByRole("button", { name: "Select", exact: true }).click();
    await expect(layers).toHaveCount(0);
    await expect(inspector).toBeVisible();
    await inspector.getByRole("button", { name: "Close", exact: true }).click();
  }
});
