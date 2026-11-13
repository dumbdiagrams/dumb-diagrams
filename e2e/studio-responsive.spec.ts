import { expect, test } from "@playwright/test";

import { waitForStudioReady } from "./support/helpers";

test("keeps Studio usable while resizing into split-screen widths", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await waitForStudioReady(page);

  const longNote = "A long code note title ".repeat(150);
  const source = `dgm 1
diagram responsive-test {
  grammar aws
  aws.cloud cloud "AWS Cloud" {
    aws.vpc network "VPC" {
      aws.dynamodb table_one "Orders"
    }
  }
  annotation note_code "${longNote}" { style code font mono size 14 align center }
}
`;
  await page.locator('input[type="file"]').setInputFiles({
    name: "long-code-note.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  await waitForStudioReady(page);

  await page.getByRole("button", { name: "Canvas items" }).click();
  await page.getByRole("option").filter({ hasText: "A long code note title" }).click();
  await page.getByRole("button", { name: "Canvas items" }).click();
  const inspector = page.getByRole("dialog").filter({ has: page.locator("#inspector-label") });
  await expect(inspector).toBeVisible();

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 900, height: 768 },
    { width: 768, height: 640 },
    { width: 640, height: 540 },
    { width: 480, height: 700 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(inspector, `${viewport.width}px inspector remains open`).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>(".floating-topbar")?.getBoundingClientRect();
      const panel = document.querySelector<HTMLElement>(".floating-panel.inspector-sheet")?.getBoundingClientRect();
      return toolbar && panel ? panel.top - toolbar.bottom : -Infinity;
    })).toBeGreaterThanOrEqual(-1);
    await expect(page.getByRole("button", { name: "Auto-fix" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Snap to grid" })).toBeVisible();

    const metrics = await page.evaluate(() => {
      const regions = [".topbar-left", ".topbar-center", ".topbar-right"]
        .map((selector) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => Boolean(rect));
      const left = regions[0];
      const right = regions[2];
      const title = document.querySelector<HTMLElement>(".floating-panel-header h2")?.getBoundingClientRect();
      const panel = document.querySelector<HTMLElement>(".floating-panel.inspector-sheet")?.getBoundingClientRect();
      const close = document.querySelector<HTMLElement>(".floating-panel.inspector-sheet button[aria-label='Close']")?.getBoundingClientRect();
      const body = document.querySelector<HTMLElement>(".floating-panel.inspector-sheet .floating-panel-body");
      return {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        windowScrollY: window.scrollY,
        appScrollTop: document.querySelector<HTMLElement>(".app")?.scrollTop ?? Infinity,
        titleHeight: title?.height ?? Infinity,
        panelTop: panel?.top ?? -Infinity,
        panelBottom: panel?.bottom ?? Infinity,
        toolbarBottom: document.querySelector<HTMLElement>(".floating-topbar")?.getBoundingClientRect().bottom ?? Infinity,
        closeLeft: close?.left ?? -Infinity,
        closeRight: close?.right ?? Infinity,
        closeTop: close?.top ?? -Infinity,
        closeBottom: close?.bottom ?? Infinity,
        headerOverlap: Boolean(left && right
          && left.left < right.right
          && left.right > right.left
          && left.top < right.bottom
          && left.bottom > right.top),
        bodyScrollHeight: body?.scrollHeight ?? 0,
        bodyClientHeight: body?.clientHeight ?? 0,
      };
    });

    expect(metrics.documentWidth).toBeLessThanOrEqual(viewport.width);
    expect(metrics.bodyWidth).toBeLessThanOrEqual(viewport.width);
    expect(metrics.windowScrollY).toBe(0);
    expect(metrics.appScrollTop).toBe(0);
    expect(metrics.headerOverlap).toBe(false);
    expect(metrics.titleHeight).toBeLessThan(62);
    expect(metrics.panelTop).toBeGreaterThanOrEqual(metrics.toolbarBottom - 1);
    expect(metrics.panelBottom).toBeLessThanOrEqual(viewport.height - 55);
    expect(metrics.closeLeft).toBeGreaterThanOrEqual(0);
    expect(metrics.closeRight).toBeLessThanOrEqual(viewport.width + 1);
    expect(metrics.closeTop).toBeGreaterThanOrEqual(0);
    expect(metrics.closeBottom).toBeLessThanOrEqual(viewport.height + 1);
    if (viewport.height <= 640) {
      expect(metrics.bodyScrollHeight).toBeGreaterThan(metrics.bodyClientHeight);
    }

    if (viewport.width <= 640) {
      const canvasItemsTrigger = page.getByRole("button", { name: "Canvas items" });
      await canvasItemsTrigger.click();
      const canvasItems = page.getByRole("dialog", { name: "Canvas items" });
      await expect(canvasItems).toBeVisible();
      const canvasItemsInsideViewport = await canvasItems.evaluate((popover) => {
        const rect = popover.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight;
      });
      expect(canvasItemsInsideViewport).toBe(true);
      const canvasItem = canvasItems.getByRole("option").first();
      const canvasItemClickable = await canvasItem.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit?.closest("button") === button;
      });
      expect(canvasItemClickable).toBe(true);
      await canvasItemsTrigger.click();

      const issuesTrigger = page.locator(".issue-journal-trigger");
      await expect(issuesTrigger).toBeVisible();
      await issuesTrigger.click();
      const issuesPopover = page.getByRole("menu", { name: "Diagram issues" });
      await expect(issuesPopover).toBeVisible();
      const issuesInsideViewport = await issuesPopover.evaluate((popover) => {
        const rect = popover.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight;
      });
      expect(issuesInsideViewport).toBe(true);
      const issueItem = issuesPopover.getByRole("menuitem").first();
      const issueItemClickable = await issueItem.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit?.closest("button") === button;
      });
      expect(issueItemClickable).toBe(true);
      await issuesTrigger.click();
    }

    const controls = page.locator([
      ".topbar-left .document-name-edit",
      ".topbar-center button",
      ".topbar-right .entity-navigator-trigger",
      ".topbar-right .issue-journal-trigger",
      ".topbar-right .history-controls button",
      ".topbar-right .topbar-group button",
    ].join(", "));
    await expect(controls).not.toHaveCount(0);
    for (const control of await controls.all()) {
      await expect(control).toBeVisible();
      const centerIsClickable = await control.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit?.closest("button") === button;
      });
      expect(centerIsClickable, `${viewport.width}px control ${await control.getAttribute("aria-label") ?? await control.textContent()}`).toBe(true);
    }
  }

  const content = page.locator("#inspector-label");
  await content.focus();
  await content.fill("Editable note content remains available at narrow widths");
  await expect(content).toBeFocused();
  await expect(content).toHaveValue("Editable note content remains available at narrow widths");

  const panelBody = page.locator(".floating-panel.inspector-sheet .floating-panel-body");
  await panelBody.evaluate((body) => { body.scrollTop = body.scrollHeight; });
  await page.getByRole("button", { name: "Delete", exact: true }).click({ trial: true });
});
