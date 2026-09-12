import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { ASYNC_DOCS, openSourceDrawer, waitForStudioReady } from "./support/helpers";

test("prompts before overwriting a file changed on disk", async ({ page }) => {
  const original = readFileSync(ASYNC_DOCS, "utf8");
  const edited = original.replace("diagram async-docs", "diagram edited");
  const external = original.replace("diagram async-docs", "diagram external");
  await page.addInitScript((source) => {
    const state = { source };
    Object.assign(window, {
      __mockDisk: state,
      showOpenFilePicker: async () => [{
        kind: "file",
        name: "async-docs.dgm",
        getFile: async () => new File([state.source], "async-docs.dgm", { type: "text/plain" }),
        createWritable: async () => ({
          write: async (next: string) => { state.source = next; },
          close: async () => undefined,
        }),
      }],
    });
  }, original);
  await page.goto("/");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open .dgm", exact: true }).click();
  await waitForStudioReady(page);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");

  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(edited);
  await editor.blur();
  await page.evaluate((next) => {
    (window as Window & { __mockDisk?: { source: string } }).__mockDisk!.source = next;
  }, external);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const conflict = page.getByRole("dialog", { name: "File changed on disk" });
  await expect(conflict).toBeVisible();
  await expect(conflict.getByRole("button", { name: "Reload from disk", exact: true })).toBeVisible();
  await expect(conflict.getByRole("button", { name: "Overwrite anyway", exact: true })).toBeVisible();
  await conflict.getByRole("button", { name: "Reload from disk", exact: true }).click();

  const reloadedDrawer = await openSourceDrawer(page);
  await expect(reloadedDrawer.locator(".cm-content")).toContainText("diagram external");
});

test("overwrites a file changed on disk when explicitly confirmed", async ({ page }) => {
  const original = readFileSync(ASYNC_DOCS, "utf8");
  const edited = original.replace("diagram async-docs", "diagram edited");
  const external = original.replace("diagram async-docs", "diagram external");
  await page.addInitScript((source) => {
    const state = { source };
    Object.assign(window, {
      __mockDisk: state,
      showOpenFilePicker: async () => [{
        kind: "file",
        name: "async-docs.dgm",
        getFile: async () => new File([state.source], "async-docs.dgm", { type: "text/plain" }),
        createWritable: async () => ({
          write: async (next: string) => { state.source = next; },
          close: async () => undefined,
        }),
      }],
    });
  }, original);
  await page.goto("/");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open .dgm", exact: true }).click();
  await waitForStudioReady(page);

  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(edited);
  await editor.blur();
  await page.evaluate((next) => {
    (window as Window & { __mockDisk?: { source: string } }).__mockDisk!.source = next;
  }, external);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const conflict = page.getByRole("dialog", { name: "File changed on disk" });
  await conflict.getByRole("button", { name: "Overwrite anyway", exact: true }).click();

  await expect(conflict).toBeHidden();
  expect(await page.evaluate(() => (
    window as Window & { __mockDisk: { source: string } }
  ).__mockDisk.source)).toBe(edited);
});

test("surfaces local persistence degradation without blocking editing", async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key === "dumb-diagrams:workspace-pending" || key === "dumb-diagrams:workspace") {
        throw new Error("storage disabled");
      }
      return originalGetItem.call(this, key);
    };
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "dumb-diagrams:workspace-pending") throw new Error("storage disabled");
      return originalSetItem.call(this, key, value);
    };
  });
  await page.goto("/");
  await waitForStudioReady(page);
  await expect(page.getByRole("button", { name: /warning/i })).toBeVisible();
  await expect(page.locator(".cm-content")).toHaveCount(0);
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Source", exact: true })).toBeVisible();
});

test("blocks workspace shortcuts until persisted tabs finish restoring", async ({ page }) => {
  await page.addInitScript(() => {
    const original = indexedDB.open.bind(indexedDB);
    Object.assign(window, { __releaseRestore: undefined });
    indexedDB.open = (...args) => {
      const request = original(...args);
      return new Proxy(request, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, property, value) {
          if (property === "onsuccess") {
            target.onsuccess = (event) => {
              Object.assign(window, { __releaseRestore: () => value.call(target, event) });
            };
            return true;
          }
          return Reflect.set(target, property, value, target);
        },
      });
    };
  });
  await page.goto("/");
  await expect(page.locator(".workspace-loading")).toBeVisible();
  await page.waitForFunction(() => typeof (
    window as unknown as { __releaseRestore: unknown }
  ).__releaseRestore === "function");

  await page.keyboard.press(process.platform === "darwin" ? "Meta+n" : "Control+n");
  await expect(page.locator(".workspace-tab")).toHaveCount(1);

  await page.evaluate(() => (
    window as unknown as { __releaseRestore: () => void }
  ).__releaseRestore());
  await expect(page.locator(".workspace-loading")).toHaveCount(0);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+n" : "Control+n");
  await expect(page.locator(".workspace-tab")).toHaveCount(2);
});
