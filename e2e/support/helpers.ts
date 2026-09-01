import { expect, type Page } from "@playwright/test";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");

export const ASYNC_DOCS = `${ROOT}/examples/diagrams/async-docs.dgm`;
export const SIMPLE_SERVERLESS = `${ROOT}/examples/curated/simple-serverless-web-application/diagram.dgm`;
export const MOD = process.platform === "darwin" ? "Meta" : "Control";

export async function waitForStudioReady(page: Page) {
  await expect(page.locator(".app")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".workspace-loading")).toHaveCount(0);
}

export async function openSourceDrawer(page: Page) {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Source", exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

export async function entityBox(
  page: Page,
  kind: "resource" | "group",
  id: string,
) {
  const entity = page.locator(`[data-entity-kind="${kind}"][data-entity-id="${id}"]`).first();
  await expect(entity).toHaveCount(1);
  const box = await entity.boundingBox();
  expect(box, `${kind}:${id} should have a rendered box`).not.toBeNull();
  return box!;
}
