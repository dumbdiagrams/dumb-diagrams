import { expect, test, type Page } from "@playwright/test";

import { entityBox, waitForStudioReady } from "./support/helpers";

const source = `diagram azure-web-application {
  grammar azure
  flow lr
  cloud-agnostic.actor actor "Actor"
  azure.subscription subscription "Azure subscription" {
    azure.region region "Azure region" {
      cloud-agnostic.boundary application "Web application" {
        azure.front-door-and-cdn-profiles front_door "Azure Front Door"
        azure.app-services app_service "App Service"
        azure.sql-database database "Azure SQL Database"
        azure.key-vaults vault "Key Vault"
        azure.application-insights insights "Application Insights"
      }
    }
  }
  actor -> front_door { id ingress step 1 label "user requests" }
  front_door -> app_service { id requests step 2 label "user requests" }
  app_service -> database { id database_access label "database access" }
  app_service -> vault { id secrets label "secret retrieval" }
  app_service -> insights { id telemetry style dashed label "telemetry" }
}`;

async function openApplication(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "azure-web-application.dgm", mimeType: "text/plain", buffer: Buffer.from(source),
  });
  await waitForStudioReady(page);
  await expect(page.locator("#res-app_service image")).toHaveCount(1);
}

async function geometry(page: Page) {
  return page.locator(".canvas-artboard .diagram-svg").evaluate((svg) => {
    const result: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const element of svg.querySelectorAll<SVGGraphicsElement>('g[id^="res-"] > image, g[id^="group-"] > rect.group-border')) {
      result[element.parentElement!.id] = {
        x: Number(element.getAttribute("x")), y: Number(element.getAttribute("y")),
        w: Number(element.getAttribute("width")), h: Number(element.getAttribute("height")),
      };
    }
    return result;
  });
}

test("dragging App Service preserves every other item in the initial layout", async ({ page }) => {
  await openApplication(page);
  const before = await geometry(page);
  const box = await entityBox(page, "resource", "app_service");
  const x = box.x + box.width / 2;
  const y = box.y + 16;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 24, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await geometry(page))["res-app_service"]!.x)
    .not.toBe(before["res-app_service"]!.x);
  const after = await geometry(page);
  for (const [id, bounds] of Object.entries(before)) {
    if (id !== "res-app_service") expect(after[id], id).toEqual(bounds);
  }
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => geometry(page)).toEqual(before);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
});

test("deleting telemetry preserves Application Insights and the rest of the layout", async ({ page }) => {
  await openApplication(page);
  const before = await geometry(page);
  await page.locator('[data-edge-label-handle="telemetry"]').click();
  await expect(page.locator('.hit-edge[data-entity-id="telemetry"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Delete");
  await expect(page.locator("#edge-telemetry")).toHaveCount(0);
  await expect.poll(() => geometry(page)).toEqual(before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#edge-telemetry")).toHaveCount(1);
  await expect.poll(() => geometry(page)).toEqual(before);
});
