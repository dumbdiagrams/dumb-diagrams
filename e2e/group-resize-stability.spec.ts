import { expect, test, type Page } from "@playwright/test";

import { entityBox, waitForStudioReady } from "./support/helpers";

const source = `diagram gcp-group-resize-stability {
  grammar gcp
  flow lr

  cloud-agnostic.client client "External client"

  gcp.organization organization "Google Cloud organization" {
    gcp.project project "Application project" {
      gcp.region region "Application region" {
        cloud-agnostic.boundary api "API" {
          gcp.cloud-load-balancing load_balancer "Cloud Load Balancing"
          gcp.cloud-run service "Cloud Run"
        }
        cloud-agnostic.boundary data "Data" {
          cloud-agnostic.database firestore "Firestore"
        }
        cloud-agnostic.boundary support "Support" {
          gcp.secret-manager secrets "Secret Manager"
          gcp.cloud-logging logging "Cloud Logging"
        }
      }
    }
  }

  client -> load_balancer { id request label "HTTPS request" }
  load_balancer -> service { id dispatch label "route" }
  service -> firestore { id persist label "persist" }
  service -> secrets { id credentials kind peer style dashed }
  service -> logging { id telemetry kind peer style dashed }
}`;

type Bounds = { x: number; y: number; w: number; h: number };
type Geometry = Record<string, Bounds>;

async function openApplication(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "gcp-group-resize-stability.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  await waitForStudioReady(page);
  await expect(page.locator("#res-client")).toHaveCount(1);
  await expect(page.locator("#group-project rect.group-border")).toHaveCount(1);
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

async function connectorGeometry(page: Page): Promise<Record<string, string>> {
  return page.locator(".canvas-artboard .diagram-svg").evaluate((svg) => {
    const result: Record<string, string> = {};
    for (const edge of svg.querySelectorAll<SVGGElement>('g[id^="edge-"]')) {
      const path = edge.querySelector("path")?.getAttribute("d") ?? "";
      const labels = [...edge.querySelectorAll<SVGTextElement>("text")]
        .map((label) => `${label.getAttribute("x")},${label.getAttribute("y")},${label.textContent ?? ""}`)
        .join("|");
      result[edge.id] = `${path}|${labels}`;
    }
    return result;
  });
}

async function resizeFromHandle(page: Page, handle: string, dx: number, dy: number) {
  const handleBox = await page.locator(
    `[data-resize-kind="group"][data-resize-handle="${handle}"]`,
  ).boundingBox();
  expect(handleBox, `group ${handle} resize handle should be rendered`).not.toBeNull();
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
  await page.mouse.up();
}

function expectOnlyGroupChanged(before: Geometry, after: Geometry, groupId: string) {
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  for (const [id, bounds] of Object.entries(before)) {
    if (id !== groupId) expect(after[id], id).toEqual(bounds);
  }
}

for (const testCase of [
  { groupId: "project", name: "nested GCP project", secondHandle: "se", secondDx: 96, secondDy: 72 },
  { groupId: "organization", name: "outer GCP organization", secondHandle: "nw", secondDx: -96, secondDy: -72 },
] as const) {
  test(`enlarging the ${testCase.name} preserves every other world bound through undo and redo`, async ({ page }) => {
    await openApplication(page);

    const group = page.locator(`[data-entity-kind="group"][data-entity-id="${testCase.groupId}"]`);
    const groupBox = await entityBox(page, "group", testCase.groupId);
    await group.click({ position: { x: groupBox.width / 2, y: 8 } });
    await expect(group).toHaveAttribute("aria-selected", "true");

    const groupKey = `group-${testCase.groupId}`;
    const initial = await geometry(page);
    const initialConnectors = await connectorGeometry(page);
    await resizeFromHandle(page, "e", 120, 0);
    await expect.poll(async () => (await geometry(page))[groupKey]?.w)
      .toBeGreaterThan(initial[groupKey]!.w);
    const afterEast = await geometry(page);
    expectOnlyGroupChanged(initial, afterEast, groupKey);
    await expect.poll(() => connectorGeometry(page)).toEqual(initialConnectors);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => geometry(page)).toEqual(initial);
    await expect.poll(() => connectorGeometry(page)).toEqual(initialConnectors);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect.poll(() => geometry(page)).toEqual(afterEast);
    await expect.poll(() => connectorGeometry(page)).toEqual(initialConnectors);

    await resizeFromHandle(page, testCase.secondHandle, testCase.secondDx, testCase.secondDy);
    await expect.poll(async () => (await geometry(page))[groupKey]?.w)
      .toBeGreaterThan(afterEast[groupKey]!.w);
    await expect.poll(async () => (await geometry(page))[groupKey]?.h)
      .toBeGreaterThan(afterEast[groupKey]!.h);
    const afterSecond = await geometry(page);
    expectOnlyGroupChanged(afterEast, afterSecond, groupKey);
    await expect.poll(() => connectorGeometry(page)).toEqual(initialConnectors);

    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(() => geometry(page)).toEqual(afterEast);
    await expect.poll(() => connectorGeometry(page)).toEqual(initialConnectors);
    await expect(redo).toBeEnabled();
    await redo.click();
    await expect.poll(() => geometry(page)).toEqual(afterSecond);
    await expect.poll(() => connectorGeometry(page)).toEqual(initialConnectors);
  });
}
