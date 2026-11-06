import { expect, test } from "@playwright/test";

import { MOD, openSourceDrawer, waitForStudioReady } from "./support/helpers";

// Tracing can retain DOM for historical snapshots and distort memory checks.
test.use({ trace: "off" });

function denseDiagram(label: string): string {
  const ids = Array.from({ length: 44 }, (_, index) => `node${index}`);
  return `diagram dense {
    grammar aws
    flow lr
    aws.cloud cloud { aws.account account {
      ${ids.map((id, index) => `cloud-agnostic.actor ${id} "${index === 0 ? label : `Node ${index}`}"`).join("\n")}
    } }
    ${ids.flatMap((id, index) => ids.slice(index + 1).map((target) => `${id} -> ${target}`)).join("\n")}
  }`;
}

test("bounds retained memory and diagnostic DOM during dense source edits", async ({ page, browserName }) => {
  // CI's four-worker run can spend most of the default 45 seconds compiling
  // the 44-node/946-edge diagram 20 times; retain every iteration while
  // leaving enough time for the full stress contract to finish.
  test.setTimeout(90_000);
  // CDP exposes post-GC heap usage in Chromium. Other engines exercise source
  // editing in the shared interaction suite.
  test.skip(browserName !== "chromium", "Chromium memory profiling requires CDP");
  await page.goto("/");
  await waitForStudioReady(page);
  const drawer = await openSourceDrawer(page);
  const editor = drawer.locator(".cm-content");

  for (let index = 0; index < 20; index += 1) {
    const label = `Memory edit ${index}`;
    await editor.click();
    await page.keyboard.press(`${MOD}+A`);
    await page.keyboard.insertText(denseDiagram(label));
    await editor.blur();
    await expect(page.locator("#res-node0")).toContainText(label);
    await expect(drawer.locator(".issues > *")).not.toHaveCount(0);
    // 200 detailed geometry findings, their summary, and routing/storage warnings.
    expect(await drawer.locator(".issues > *").count()).toBeLessThanOrEqual(203);
    await expect(drawer.locator(".issues")).toContainText("additional failures omitted");
  }

  const profiling = await page.context().newCDPSession(page);
  try {
    await profiling.send("HeapProfiler.collectGarbage");
    const heap = await profiling.send("Runtime.getHeapUsage");
    // A generous retained-heap ceiling accommodates dev-server instrumentation.
    // The audited regression retained over 400 MiB on the UI thread alone.
    expect(heap.usedSize + heap.backingStorageSize).toBeLessThan(80 * 1024 * 1024);
    expect(await page.locator("*").count()).toBeLessThan(15_000);

    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(page.locator("#res-node0")).toContainText("Memory edit 19");
    // Native contenteditable undo can retain removed DOM during synthetic
    // text insertion. Unmounting Source must release that editing history.
    await expect.poll(async () => {
      await profiling.send("HeapProfiler.collectGarbage");
      return (await profiling.send("Memory.getDOMCounters")).nodes;
    }).toBeLessThan(15_000);
  } finally {
    await profiling.detach();
  }
});
