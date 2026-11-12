import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { ASYNC_DOCS, openSourceDrawer, waitForStudioReady } from "./support/helpers";

const initialSource = readFileSync(ASYNC_DOCS, "utf8");

function diagram(name: string, resource: string, note: string) {
  return `diagram ${name} {
  grammar cloud-agnostic
  cloud-agnostic.server ${resource} "${resource}"
  annotation disk_note "${note}" { style paper }
}
view default {
  annotation disk_note { x 40 y 40 w 220 h 72 pin }
}
`;
}

async function linkMockFile(page: Page) {
  await page.addInitScript((source) => {
    const state = { source, reads: 0, unreadable: false };
    Object.assign(window, {
      __mockDisk: state,
      showOpenFilePicker: async () => [{
        kind: "file",
        name: "live-sync.dgm",
        getFile: async () => {
          state.reads += 1;
          if (state.unreadable) throw new Error("mock disk read failed");
          return new File([state.source], "live-sync.dgm", {
            type: "text/plain",
            lastModified: 1,
          });
        },
        createWritable: async () => ({
          write: async (next: string) => { state.source = next; },
          close: async () => undefined,
        }),
      }],
    });
  }, initialSource);
  await page.goto("/");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open .dgm", exact: true }).click();
  await waitForStudioReady(page);
  await expect(page.getByRole("button", { name: "Reload from disk", exact: true })).toBeVisible();
}

async function setDiskSource(page: Page, source: string) {
  await page.evaluate((next) => {
    (window as Window & { __mockDisk: { source: string } }).__mockDisk.source = next;
  }, source);
}

async function setDiskUnreadable(page: Page, unreadable: boolean) {
  await page.evaluate((value) => {
    (window as Window & { __mockDisk: { unreadable: boolean } }).__mockDisk.unreadable = value;
  }, unreadable);
}

async function worldTransform(page: Page) {
  return page.locator(".canvas-world").getAttribute("style");
}

test("refreshes a clean linked file after a quiet burst of disk writes", async ({ page }) => {
  await linkMockFile(page);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");

  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const afterZoom = await worldTransform(page);
  const stageBox = await page.getByTestId("canvas-stage").boundingBox();
  expect(stageBox).not.toBeNull();
  await page.mouse.move(stageBox!.x + stageBox!.width / 2, stageBox!.y + stageBox!.height / 2);
  await page.mouse.wheel(96, 48);
  await expect.poll(() => worldTransform(page)).not.toBe(afterZoom);
  const customizedView = await worldTransform(page);

  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");
  await editor.click();
  await expect(editor).toBeFocused();

  await setDiskSource(page, diagram("disk-first", "first_worker", "First disk note"));
  await expect(page.getByText("Updating…", { exact: true })).toBeVisible();
  await expect(page.locator("#group-use1")).toHaveCount(1);

  await setDiskSource(page, diagram("disk-final", "final_worker", "Final disk note"));
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Disk Final");
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="final_worker"]')).toHaveCount(1);
  await expect(page.locator("#annotation-disk_note")).toContainText("Final disk note");
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="first_worker"]')).toHaveCount(0);
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect.poll(() => worldTransform(page)).toBe(customizedView);
  await expect(editor).toContainText("diagram disk-final");
  await expect(page.locator(".dirty-pill")).toHaveCount(0);
});

test("preserves the last valid diagram through invalid disk contents and recovers automatically", async ({ page }) => {
  await linkMockFile(page);
  await expect(page.locator("#group-use1")).toHaveCount(1);

  for (const invalid of ["diagram unfinished { grammar aws", "", `x`.repeat(1_048_577)]) {
    await setDiskSource(page, invalid);
    await expect(page.getByText("Waiting…", { exact: true })).toBeVisible();
    await expect(page.locator("#group-use1")).toHaveCount(1);
    await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");
  }

  await setDiskSource(page, diagram("disk-recovered", "recovered_worker", "Recovered note"));
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Disk Recovered");
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="recovered_worker"]')).toHaveCount(1);
  await expect(page.locator("#annotation-disk_note")).toContainText("Recovered note");
});

test("recovers from an unreadable file and reloads a clean file on demand", async ({ page }) => {
  await linkMockFile(page);
  await page.setViewportSize({ width: 480, height: 900 });
  await setDiskUnreadable(page, true);
  await expect(page.getByText("Disconnected", { exact: true })).toBeVisible();
  await expect(page.locator("#group-use1")).toHaveCount(1);
  const syncButton = page.getByRole("button", { name: "Reload from disk", exact: true });
  const syncBox = await syncButton.boundingBox();
  expect(syncBox).not.toBeNull();
  expect(syncBox!.x).toBeGreaterThanOrEqual(0);
  expect(syncBox!.x + syncBox!.width).toBeLessThanOrEqual(480);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(480);

  await page.setViewportSize({ width: 1280, height: 720 });
  await setDiskUnreadable(page, false);
  await setDiskSource(page, diagram("disk-reconnected", "reconnected_worker", "Reconnected note"));
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="reconnected_worker"]')).toHaveCount(1);

  await setDiskSource(page, diagram("disk-manual", "manual_worker", "Manual reload note"));
  await page.getByRole("button", { name: "Reload from disk", exact: true }).click();
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Disk Manual");
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="manual_worker"]')).toHaveCount(1);
});

test("keeps a dirty local draft until reload from disk is reviewed and confirmed", async ({ page }) => {
  await linkMockFile(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Auto-save", exact: true }).click();
  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Auto-save", exact: true })).not.toBeChecked();
  await page.keyboard.press("Escape");
  const localDraft = initialSource.replace("diagram async-docs", "diagram local-draft");
  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(localDraft);
  await editor.blur();

  await setDiskSource(page, diagram("disk-review", "review_worker", "Reviewed disk note"));
  await expect(page.getByText("File changed", { exact: true })).toBeVisible();
  await expect(editor).toContainText("diagram local-draft");

  await page.getByRole("button", { name: "Reload from disk", exact: true }).click();
  const conflict = page.getByRole("dialog", { name: "File changed on disk" });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByRole("button", { name: "Reload from disk", exact: true })).toBeVisible();
  const latestDiskSource = diagram("disk-latest", "latest_worker", "Latest disk note");
  await setDiskSource(page, latestDiskSource);
  await conflict.getByRole("button", { name: "Reload from disk", exact: true }).click();

  await expect(conflict).toBeHidden();
  await expect(editor).toContainText("diagram disk-latest");
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="latest_worker"]')).toHaveCount(1);
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="review_worker"]')).toHaveCount(0);
});
