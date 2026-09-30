import { expect, test, type Page } from "@playwright/test";

import { SIMPLE_SERVERLESS, entityBox, openSourceDrawer, waitForStudioReady } from "./support/helpers";

type Bounds = { x: number; y: number; w: number; h: number };
type Geometry = Record<string, Bounds>;
type Routes = Record<string, string>;

async function openApplication(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(SIMPLE_SERVERLESS);
  await waitForStudioReady(page);
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="gateway"]')).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Layout editing mode" })).toBeVisible();
}

async function geometry(page: Page): Promise<Geometry> {
  return page.locator(".canvas-artboard .diagram-svg").evaluate((svg) => {
    const result: Geometry = {};
    for (const element of svg.querySelectorAll<SVGGraphicsElement>(
      'g[id^="res-"] > image, g[id^="group-"] > rect.group-border',
    )) {
      result[element.parentElement!.id] = {
        x: Number(element.getAttribute("x")),
        y: Number(element.getAttribute("y")),
        w: Number(element.getAttribute("width")),
        h: Number(element.getAttribute("height")),
      };
    }
    return result;
  });
}

async function routes(page: Page): Promise<Routes> {
  return page.locator(".canvas-artboard .diagram-svg").evaluate((svg) => {
    const result: Routes = {};
    for (const edge of svg.querySelectorAll<SVGGElement>('g[id^="edge-"]')) {
      result[edge.id] = edge.getAttribute("points") ?? edge.querySelector("path")?.getAttribute("d") ?? "";
    }
    return result;
  });
}

async function source(page: Page): Promise<string> {
  const drawer = await openSourceDrawer(page);
  const value = await drawer.locator(".cm-content").innerText();
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Source", exact: true })).toHaveCount(0);
  return value;
}

function automaticLayoutButton(page: Page) {
  return page.getByRole("button", { name: "Automatic layout", exact: true });
}

async function dragResourceToResource(page: Page, movingId: string, targetId: string) {
  const moving = await entityBox(page, "resource", movingId);
  const target = await entityBox(page, "resource", targetId);
  const start = { x: moving.x + moving.width / 2, y: moving.y + moving.height / 2 };
  const finish = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 12 });
  await page.mouse.up();
}

function sameBoundsExcept(before: Geometry, after: Geometry, omitted: string) {
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const [id, bounds] of Object.entries(before)) {
    if (id !== omitted) expect(after[id], id).toEqual(bounds);
  }
}

function overlaps(a: Bounds, b: Bounds) {
  return Math.abs(a.x - b.x) < 4 && Math.abs(a.y - b.y) < 4;
}

test("defaults to Manual and changing mode preserves source, geometry, routes, dirty state, and history", async ({ page }) => {
  await openApplication(page);
  const before = await geometry(page);
  const beforeRoutes = await routes(page);
  const beforeSource = await source(page);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const manual = page.getByRole("button", { name: "Manual layout", exact: true });
  const automatic = page.getByRole("button", { name: "Automatic layout", exact: true });

  await expect(manual).toHaveAttribute("aria-pressed", "true");
  await expect(automatic).toHaveAttribute("aria-pressed", "false");
  await expect(undo).toBeDisabled();
  await expect(page.locator(".dirty-pill")).toHaveCount(0);

  await automatic.click();
  await expect(automatic).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => geometry(page)).toEqual(before);
  await expect.poll(() => routes(page)).toEqual(beforeRoutes);
  await expect(await source(page)).toBe(beforeSource);
  await expect(undo).toBeDisabled();
  await expect(page.locator(".dirty-pill")).toHaveCount(0);

  await manual.click();
  await expect(manual).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => geometry(page)).toEqual(before);
  await expect.poll(() => routes(page)).toEqual(beforeRoutes);
  await expect(await source(page)).toBe(beforeSource);
  await expect(undo).toBeDisabled();
  await expect(page.locator(".dirty-pill")).toHaveCount(0);
});

test("remembers layout mode per tab and across reload", async ({ page }) => {
  await openApplication(page);
  const automatic = page.getByRole("button", { name: "Automatic layout", exact: true });
  const manual = page.getByRole("button", { name: "Manual layout", exact: true });
  await automatic.click();
  await expect(automatic).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  // Importing a file keeps the protected blank draft open, so this creates
  // the third tab. The imported tab remains the middle tab.
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(manual).toHaveAttribute("aria-pressed", "true");
  await expect(automatic).toHaveAttribute("aria-pressed", "false");

  const tabs = page.getByRole("tab");
  await tabs.nth(1).click();
  await expect(automatic).toHaveAttribute("aria-pressed", "true");
  await tabs.nth(2).click();
  await expect(manual).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await waitForStudioReady(page);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(manual).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab").nth(1).click();
  await expect(automatic).toHaveAttribute("aria-pressed", "true");
});

test("Manual edits keep other nodes and routes stable, while Auto-fix now repairs an overlap as one undoable step", async ({ page }) => {
  await openApplication(page);
  const before = await geometry(page);
  const beforeRoutes = await routes(page);
  await dragResourceToResource(page, "gateway", "handler");
  const overlap = await geometry(page);
  expect(overlaps(overlap["res-gateway"]!, overlap["res-handler"]!)).toBe(true);
  sameBoundsExcept(before, overlap, "res-gateway");
  await expect(page.getByText("Manual layout enabled", { exact: false })).toBeHidden();

  const manualRoutes = await routes(page);
  for (const [id, route] of Object.entries(beforeRoutes)) {
    if (id !== "edge-cdn_to_api" && id !== "edge-api_to_handler") expect(manualRoutes[id], id).toBe(route);
  }

  const autoFix = page.getByRole("button", { name: "Auto-fix now", exact: true });
  await autoFix.click();
  const repaired = await geometry(page);
  expect(overlaps(repaired["res-gateway"]!, repaired["res-handler"]!)).toBe(false);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => geometry(page)).toEqual(overlap);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
});

test("Automatic mode repairs an overlap after the next completed canvas edit and undo restores it in one step", async ({ page }) => {
  await openApplication(page);
  const initial = await geometry(page);
  await dragResourceToResource(page, "gateway", "handler");
  const overlap = await geometry(page);
  expect(overlaps(overlap["res-gateway"]!, overlap["res-handler"]!)).toBe(true);
  await page.getByRole("button", { name: "Automatic layout", exact: true }).click();
  await expect.poll(() => geometry(page)).toEqual(overlap);

  // Changing the mode itself is inert. A subsequent edit to an unrelated
  // node is the completed canvas edit that runs planAutoFix.
  const client = await entityBox(page, "resource", "web_client");
  const start = { x: client.x + client.width / 2, y: client.y + client.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 24, start.y, { steps: 8 });
  await page.mouse.up();
  await expect(automaticLayoutButton(page)).toHaveAttribute("aria-pressed", "true");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect.poll(async () => {
    const current = await geometry(page);
    return overlaps(current["res-gateway"]!, current["res-handler"]!);
  }, { timeout: 10_000 }).toBe(false);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => geometry(page)).toEqual(overlap);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  await undo.click();
  await expect.poll(() => geometry(page)).toEqual(initial);
  await expect(undo).toBeDisabled();
});
