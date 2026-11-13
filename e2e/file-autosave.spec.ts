import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { ASYNC_DOCS, openSourceDrawer, waitForStudioReady } from "./support/helpers";

const initialSource = readFileSync(ASYNC_DOCS, "utf8");

function diagram(name: string, resource: string) {
  return `diagram ${name} {
  grammar cloud-agnostic
  cloud-agnostic.server ${resource} "${resource}"
}
`;
}

async function linkMockFile(page: Page) {
  await page.addInitScript((source) => {
    const state = {
      source,
      writes: [] as string[],
      reads: 0,
      staged: null as string | null,
      failNextClose: false,
      permission: "granted" as PermissionState,
      permissionRequests: 0,
      permissionModes: [] as string[],
      denyPermission: false,
      createWritableCalls: 0,
    };
    Object.assign(window, {
      __mockDisk: state,
      showOpenFilePicker: async () => [{
        kind: "file",
        name: "autosave.dgm",
        queryPermission: async () => state.permission,
        requestPermission: async (options: { mode?: string }) => {
          state.permissionRequests += 1;
          state.permissionModes.push(options.mode ?? "");
          if (state.denyPermission) return "denied";
          state.permission = "granted";
          return state.permission;
        },
        getFile: async () => {
          state.reads += 1;
          return new File([state.source], "autosave.dgm", {
            type: "text/plain",
            lastModified: 1,
          });
        },
        createWritable: async () => {
          state.createWritableCalls += 1;
          return {
            write: async (next: string) => { state.staged = next; },
            close: async () => {
              if (state.failNextClose) {
                state.failNextClose = false;
                state.staged = null;
                throw new Error("mock disk write failed");
              }
              if (state.staged !== null) {
                state.source = state.staged;
                state.writes.push(state.staged);
                state.staged = null;
              }
            },
            abort: async () => { state.staged = null; },
          };
        },
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

async function diskSource(page: Page) {
  return page.evaluate(() => (window as Window & { __mockDisk: { source: string } }).__mockDisk.source);
}

async function writes(page: Page) {
  return page.evaluate(() => (window as Window & { __mockDisk: { writes: string[] } }).__mockDisk.writes.length);
}

async function reads(page: Page) {
  return page.evaluate(() => (window as Window & { __mockDisk: { reads: number } }).__mockDisk.reads);
}

async function permissionRequests(page: Page) {
  return page.evaluate(() => (window as Window & { __mockDisk: { permissionRequests: number } }).__mockDisk.permissionRequests);
}

async function permissionModes(page: Page) {
  return page.evaluate(() => (window as Window & { __mockDisk: { permissionModes: string[] } }).__mockDisk.permissionModes);
}

async function createWritableCalls(page: Page) {
  return page.evaluate(() => (window as Window & { __mockDisk: { createWritableCalls: number } }).__mockDisk.createWritableCalls);
}

async function editSource(page: Page, source: string) {
  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText(source);
  await editor.blur();
  return editor;
}

async function saveFromFileMenu(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
}

test("auto-saves linked edits by default, coalesces a burst, and remembers the manual-save setting", async ({ page }) => {
  await linkMockFile(page);
  expect(await permissionModes(page)).toEqual([]);
  await page.getByRole("button", { name: "File", exact: true }).click();
  const autoSave = page.getByRole("menuitemcheckbox", { name: "Auto-save", exact: true });
  await expect(autoSave).toBeChecked();
  const saveIndex = await page.getByRole("menuitem", { name: "Save", exact: true }).evaluate((el) => {
    const siblings = [...el.closest('[role="menu"]')!.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')];
    return siblings.indexOf(el);
  });
  const autoSaveIndex = await autoSave.evaluate((el) => {
    const siblings = [...el.closest('[role="menu"]')!.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]')];
    return siblings.indexOf(el);
  });
  expect(autoSaveIndex).toBe(saveIndex + 1);
  await page.keyboard.press("Escape");

  const editor = await openSourceDrawer(page).then((drawer) => drawer.locator(".cm-content"));
  await editor.fill(diagram("burst_first", "first_worker"));
  await editor.fill(diagram("burst_second", "second_worker"));
  const finalSource = diagram("burst_final", "final_worker");
  await editor.fill(finalSource);
  await expect.poll(() => diskSource(page)).toBe(finalSource);
  await expect.poll(() => writes(page)).toBe(1);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Auto-save", exact: true }).click();
  await page.keyboard.press("Escape");
  const readsBeforeManualEdit = await reads(page);
  const manualSource = diagram("manual_only", "manual_worker");
  await editor.fill(manualSource);
  await expect(page.getByText("Unsaved", { exact: true }).first()).toBeVisible();
  await expect.poll(() => reads(page), { timeout: 5_000 }).toBeGreaterThanOrEqual(readsBeforeManualEdit + 2);
  await expect.poll(() => writes(page)).toBe(1);
  await saveFromFileMenu(page);
  await expect.poll(() => diskSource(page)).toBe(manualSource);
  await expect.poll(() => writes(page)).toBe(2);

  await page.reload();
  await waitForStudioReady(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  const autoSaveAfterReload = page.getByRole("menuitemcheckbox", { name: "Auto-save", exact: true });
  await expect(autoSaveAfterReload).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Reload from disk", exact: true })).toHaveCount(0);
  await autoSaveAfterReload.click();
  await page.keyboard.press("Escape");

  await page.reload();
  await waitForStudioReady(page);
  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Auto-save", exact: true })).toBeChecked();
  await page.getByRole("menuitem", { name: "Open .dgm", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reload from disk", exact: true })).toBeVisible();

  const relinkedSource = diagram("autosave_after_relink", "autosave_worker");
  const relinkedEditor = await openSourceDrawer(page).then((drawer) => drawer.locator(".cm-content"));
  await relinkedEditor.fill(relinkedSource);
  await expect.poll(() => diskSource(page)).toBe(relinkedSource);
  await expect.poll(() => writes(page)).toBe(1);
});

test("Undo and Redo after external versions automatically save each adopted history version", async ({ page }) => {
  await linkMockFile(page);
  const sourceA = initialSource;
  const sourceB = diagram("external_b", "external_b_worker");
  const sourceC = diagram("external_c", "external_c_worker");
  const editor = await openSourceDrawer(page).then((drawer) => drawer.locator(".cm-content"));

  await setDiskSource(page, sourceB);
  await expect(editor).toContainText("diagram external_b", { timeout: 10_000 });
  await setDiskSource(page, sourceC);
  await expect(editor).toContainText("diagram external_c", { timeout: 10_000 });

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await undo.click();
  await expect(editor).toContainText("diagram external_b");
  await expect.poll(() => diskSource(page)).toBe(sourceB);
  await undo.click();
  await expect(editor).toContainText("diagram async-docs");
  await expect.poll(() => diskSource(page)).toBe(sourceA);
  await redo.click();
  await expect(editor).toContainText("diagram external_b");
  await expect.poll(() => diskSource(page)).toBe(sourceB);
});

test("does not overwrite an external disk change while a local autosave is pending", async ({ page }) => {
  await linkMockFile(page);
  const local = diagram("local_pending", "local_worker");
  const external = diagram("external_pending", "external_worker");
  const editor = await editSource(page, local);
  await setDiskSource(page, external);

  await expect(page.getByText("File changed", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(editor).toContainText("diagram local_pending");
  await expect.poll(() => diskSource(page)).toBe(external);

  await page.getByRole("button", { name: "Reload from disk", exact: true }).click();
  const conflict = page.getByRole("dialog", { name: "File changed on disk" });
  await expect(conflict).toBeVisible();
  await conflict.getByRole("button", { name: "Reload from disk", exact: true }).click();
  await expect(conflict).toBeHidden();
  await expect(editor).toContainText("diagram external_pending");
});

test("keeps a failed autosave dirty, then saves on explicit retry", async ({ page }) => {
  await linkMockFile(page);
  await page.evaluate(() => {
    (window as Window & { __mockDisk: { failNextClose: boolean } }).__mockDisk.failNextClose = true;
  });
  const local = diagram("retry_save", "retry_worker");
  const editor = await editSource(page, local);
  const beforeUnloadPrevented = () => page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(await beforeUnloadPrevented()).toBe(true);
  await expect(page.getByText("Save failed", { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(editor).toContainText("diagram retry_save");
  expect(await diskSource(page)).toBe(initialSource);
  expect(await beforeUnloadPrevented()).toBe(true);

  await saveFromFileMenu(page);
  await expect.poll(() => diskSource(page)).toBe(local);
  expect(await beforeUnloadPrevented()).toBe(false);
});

test("does not prompt for revoked write permission in the background, but explicit Save can request it", async ({ page }) => {
  await linkMockFile(page);
  const requestCountBeforeEdit = await permissionRequests(page);
  const writableCountBeforeEdit = await createWritableCalls(page);
  await page.evaluate(() => {
    const state = (window as Window & { __mockDisk: { permission: PermissionState; denyPermission: boolean } }).__mockDisk;
    state.permission = "prompt";
    state.denyPermission = true;
  });

  const local = diagram("permission_retry", "permission_worker");
  const editor = await editSource(page, local);
  await expect(page.getByText("Unsaved", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(editor).toContainText("diagram permission_retry");
  expect(await diskSource(page)).toBe(initialSource);
  expect(await permissionRequests(page)).toBe(requestCountBeforeEdit);
  expect(await createWritableCalls(page)).toBe(writableCountBeforeEdit);

  await page.evaluate(() => {
    (window as Window & { __mockDisk: { denyPermission: boolean } }).__mockDisk.denyPermission = false;
  });
  await saveFromFileMenu(page);
  await expect.poll(() => diskSource(page)).toBe(local);
  expect(await permissionRequests(page)).toBe(requestCountBeforeEdit + 1);
  expect(await createWritableCalls(page)).toBe(writableCountBeforeEdit + 1);
});

test("shows Browser only for an unlinked tab without automatic downloads or save picker prompts", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __mockFallback: { savePickerCalls: 0 },
      showSaveFilePicker: async () => {
        (window as Window & { __mockFallback: { savePickerCalls: number } }).__mockFallback.savePickerCalls += 1;
        throw new Error("the picker should only open after an explicit Save As action");
      },
    });
  });
  let downloadCount = 0;
  page.on("download", () => { downloadCount += 1; });
  await page.goto("/");
  await waitForStudioReady(page);
  const local = diagram("browser_only", "browser_worker");
  const editor = await editSource(page, local);
  await expect(editor).toContainText("diagram browser_only");
  await expect(page.getByRole("status")).toContainText("Browser only");
  await page.waitForTimeout(800);
  expect(downloadCount).toBe(0);
  expect(await page.evaluate(() => (
    window as Window & { __mockFallback: { savePickerCalls: number } }
  ).__mockFallback.savePickerCalls)).toBe(0);
});
