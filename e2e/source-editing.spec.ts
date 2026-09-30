import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { ASYNC_DOCS, entityBox, MOD, openSourceDrawer, waitForStudioReady } from "./support/helpers";

async function replaceSource(page: Page, source: string) {
  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press(`${MOD}+A`);
  await page.keyboard.insertText(source);
  await editor.blur();
  return drawer;
}

test("keeps the last valid canvas and blocks save until source is repaired", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);
  await expect(page.locator("#group-use1")).toHaveCount(1);

  await replaceSource(page, "diagram broken { grammar aws");
  await expect(page.getByRole("alert")).toContainText("last valid diagram");
  await expect(page.locator("#group-use1")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name: "Source", exact: true }).locator(".issues")).toBeVisible();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Save", exact: true })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Save As…", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  const drawer = page.getByRole("dialog", { name: "Source", exact: true });
  await expect(drawer.getByRole("button", { name: "Format", exact: true })).toBeDisabled();

  await replaceSource(page, readFileSync(ASYNC_DOCS, "utf8"));
  await waitForStudioReady(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("#group-use1")).toHaveCount(1);
});

test("surfaces validation-invalid source and disables save and rendered export", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);
  await replaceSource(page, `diagram invalid-edge {
  grammar aws
  cloud-agnostic.actor client
  client -> missing { id e1 kind flow }
}
`);

  await expect(page.getByRole("alert")).toContainText("Diagram error");
  await expect(page.getByRole("dialog", { name: "Source", exact: true }).locator(".issues")).toBeVisible();

  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Save", exact: true })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Save As…", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
});

test("valid source edits sync to the canvas and survive reload", async ({ page }) => {
  await page.goto("/");
  await replaceSource(page, `diagram persisted-edit {
  grammar aws
  aws.aws-lambda handler "Handler" {}
}
`);
  await waitForStudioReady(page);
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="handler"]')).toHaveCount(1);

  await page.reload();
  await waitForStudioReady(page);
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="handler"]')).toHaveCount(1);
});

for (const [kind, draft] of [
  ["syntax", "diagram unfinished { grammar aws"],
  ["validation", "diagram unfinished { grammar aws cloud-agnostic.actor client client -> missing { id e1 kind flow } }"],
]) {
  test(`recovers the only tab with a ${kind}-invalid draft`, async ({ page }) => {
    await page.goto("/");
    await replaceSource(page, draft!);
    await expect(page.getByRole("tab")).toHaveCount(1);
    await page.reload();
    await waitForStudioReady(page);
    await expect(page.getByRole("tab")).toHaveCount(1);
    const drawer = await openSourceDrawer(page);
    await expect(drawer.locator(".cm-content")).toContainText(draft!);
    await expect(drawer.locator(".issues")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Format", exact: true })).toBeDisabled();
  });
}

test("recovers multiple invalid source drafts after reload", async ({ page }) => {
  await page.goto("/");
  const first = "diagram first-draft { grammar aws";
  const second = "diagram second-draft { grammar aws";
  await replaceSource(page, first);
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  await replaceSource(page, second);

  await page.reload();
  await waitForStudioReady(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  const drawer = await openSourceDrawer(page);
  await expect(drawer.locator(".cm-content")).toContainText(second);
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Source", exact: true })).toBeHidden();
  await page.locator(".workspace-tab").first().click();
  const firstDrawer = await openSourceDrawer(page);
  await expect(firstDrawer.locator(".cm-content")).toContainText(first);
});

test("keeps source edit history across drawer close and supports undo and redo", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);
  const original = readFileSync(ASYNC_DOCS, "utf8");
  const edited = original.replace("diagram async-docs", "diagram edited-source");
  await replaceSource(page, edited);
  const drawer = page.getByRole("dialog", { name: "Source", exact: true });
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(drawer).toBeHidden();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const undone = await openSourceDrawer(page);
  await expect(undone.locator(".cm-content")).toContainText(original.slice(0, 40));
  await undone.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Source", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  const redone = await openSourceDrawer(page);
  await expect(redone.locator(".cm-content")).toContainText("diagram edited-source");
});

test("discards redo after a new source edit", async ({ page }) => {
  await page.goto("/");
  const original = readFileSync(ASYNC_DOCS, "utf8");
  const first = original.replace("diagram async-docs", "diagram first-source");
  const second = original.replace("diagram async-docs", "diagram second-source");
  await replaceSource(page, first);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await replaceSource(page, second);
  await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeDisabled();
});

test("undo restores a canvas edit after repairing invalid source", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);

  const apiBefore = await entityBox(page, "resource", "apiA");
  const api = page.locator('[data-entity-kind="resource"][data-entity-id="apiA"]');
  const apiCenter = { x: apiBefore.x + apiBefore.width / 2, y: apiBefore.y + apiBefore.height / 2 };
  await page.mouse.move(apiCenter.x, apiCenter.y);
  await page.mouse.down();
  await page.mouse.move(apiCenter.x + 96, apiCenter.y + 48);
  await page.mouse.up();
  const apiMoved = await entityBox(page, "resource", "apiA");
  expect(Math.abs(apiMoved.x - apiBefore.x)).toBeGreaterThan(20);

  const original = readFileSync(ASYNC_DOCS, "utf8");
  const repaired = original.replace("diagram async-docs", "diagram repaired-source");
  await replaceSource(page, "diagram broken { grammar aws");
  await expect(page.getByRole("alert")).toBeVisible();
  await replaceSource(page, repaired);
  await waitForStudioReady(page);

  // Source transactions stay ordered around the canvas transaction:
  // repaired source -> invalid draft -> moved canvas -> original source.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const invalidDrawer = await openSourceDrawer(page);
  await expect(invalidDrawer.locator(".cm-content")).toContainText("diagram broken");
  await invalidDrawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Source", exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const apiAfterInvalid = await entityBox(page, "resource", "apiA");
  expect(Math.abs(apiAfterInvalid.x - apiMoved.x)).toBeLessThan(12);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const apiAfterUndo = await entityBox(page, "resource", "apiA");
  expect(Math.abs(apiAfterUndo.x - apiBefore.x)).toBeLessThan(12);
});
