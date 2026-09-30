import { expect, test, type Page } from "@playwright/test";

import { SIMPLE_SERVERLESS, entityBox, waitForStudioReady } from "./support/helpers";

type Bounds = { x: number; y: number; w: number; h: number };
type Geometry = Record<string, Bounds>;
type Routes = Record<string, string>;

async function openApplication(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(SIMPLE_SERVERLESS);
  await waitForStudioReady(page);
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="gateway"]')).toHaveCount(1);
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

test("Manual edits keep other nodes and routes stable, while Auto-fix repairs an overlap as one undoable step", async ({ page }) => {
  await openApplication(page);
  await expect(page.getByRole("group", { name: "Layout editing mode" })).toHaveCount(0);
  const before = await geometry(page);
  const beforeRoutes = await routes(page);
  await dragResourceToResource(page, "gateway", "handler");
  const overlap = await geometry(page);
  expect(overlaps(overlap["res-gateway"]!, overlap["res-handler"]!)).toBe(true);
  sameBoundsExcept(before, overlap, "res-gateway");

  const manualRoutes = await routes(page);
  for (const [id, route] of Object.entries(beforeRoutes)) {
    if (id !== "edge-cdn_to_api" && id !== "edge-api_to_handler") expect(manualRoutes[id], id).toBe(route);
  }

  const autoFix = page.getByRole("button", { name: "Auto-fix", exact: true });
  await autoFix.click();
  await expect.poll(async () => {
    const current = await geometry(page);
    return overlaps(current["res-gateway"]!, current["res-handler"]!);
  }, { timeout: 10_000 }).toBe(false);
  await expect(autoFix).toBeEnabled();
  await expect(autoFix).toHaveAttribute("aria-busy", "false");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(() => geometry(page)).toEqual(overlap);
  await expect(undo).toBeEnabled();
});
