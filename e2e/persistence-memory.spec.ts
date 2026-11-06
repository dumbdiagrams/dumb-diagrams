import { expect, test } from "@playwright/test";

import { MOD, openSourceDrawer, waitForStudioReady } from "./support/helpers";

test("coalesces stalled persistence writes and recovers the newest journal", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The controlled IndexedDB transaction uses Chromium's browser APIs.");

  await page.addInitScript(() => {
    const control = {
      writes: [] as string[],
      releases: [] as Array<() => void>,
    };
    Object.assign(window, { __persistenceControl: control });
    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) {
      if (args[1] !== "readwrite") return originalTransaction.apply(this, args);
      const transaction: {
        oncomplete: ((event: Event) => void) | null;
        onerror: ((event: Event) => void) | null;
        onabort: ((event: Event) => void) | null;
        objectStore: () => { put: (value: unknown, key: string) => object };
      } = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => ({
          put: (value) => {
            control.writes.push(JSON.stringify(value));
            return {};
          },
        }),
      };
      control.releases.push(() => transaction.oncomplete?.(new Event("complete")));
      return transaction as unknown as IDBTransaction;
    };
  });

  await page.goto("/");
  await waitForStudioReady(page);
  await page.waitForFunction(() => (
    window as Window & { __persistenceControl: { writes: string[] } }
  ).__persistenceControl.writes.length === 1);

  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");
  for (const source of ["diagram coalesced-one {", "diagram coalesced-two {", "diagram coalesced-three {"]) {
    await editor.click();
    await page.keyboard.press(`${MOD}+A`);
    await page.keyboard.insertText(source);
    await editor.blur();
    // Flush each edit separately while the first durable write is stalled;
    // a Promise chain would retain all three snapshots at this point.
    await page.waitForFunction((expected) => (
      window.localStorage.getItem("dumb-diagrams:workspace-pending")?.includes(expected)
    ), source);
  }

  await page.waitForFunction(() => (
    window.localStorage.getItem("dumb-diagrams:workspace-pending")?.includes("coalesced-three")
  ));
  expect(await page.evaluate(() => localStorage.getItem("dumb-diagrams:workspace-pending"))).toContain("coalesced-three");

  await page.evaluate(() => {
    const control = (window as Window & {
      __persistenceControl: { releases: Array<() => void> };
    }).__persistenceControl;
    control.releases.shift()?.();
  });
  await page.waitForFunction(() => (
    window as Window & { __persistenceControl: { writes: string[] } }
  ).__persistenceControl.writes.length === 2);
  expect(await page.evaluate(() => (
    window as Window & { __persistenceControl: { writes: string[] } }
  ).__persistenceControl.writes[1])).toContain("coalesced-three");
  expect(await page.evaluate(() => localStorage.getItem("dumb-diagrams:workspace-pending"))).toContain("coalesced-three");

  await page.reload();
  await waitForStudioReady(page);
  const restored = await openSourceDrawer(page);
  await expect(restored.locator(".cm-content")).toContainText("coalesced-three");
});
