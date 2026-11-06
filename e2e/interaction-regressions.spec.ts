import { expect, test, type Page } from "@playwright/test";

import { ASYNC_DOCS, MOD, entityBox, waitForStudioReady } from "./support/helpers";

async function openAsyncDocs(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);
  await expect(page.locator('[data-entity-kind="edge"][data-entity-id="e1"]')).toHaveCount(1);
}

async function selectGroup(page: Page, id: string) {
  const group = page.locator(`[data-entity-kind="group"][data-entity-id="${id}"]`);
  const box = await entityBox(page, "group", id);
  await group.click({ position: { x: box.width / 2, y: 8 } });
  await expect(group).toHaveAttribute("aria-selected", "true");
  return group;
}

async function renderedBox(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} should have a rendered box`).not.toBeNull();
  return box!;
}

async function worldTransform(page: Page) {
  return page.locator(".canvas-world").getAttribute("style");
}

test("moving a group moves its children and internal connectors by the same delta", async ({ page }) => {
  await openAsyncDocs(page);

  const group = await selectGroup(page, "queues");
  const beforeGroup = await entityBox(page, "group", "queues");
  const beforeChild = await entityBox(page, "resource", "jobs");
  const beforeEdge = await renderedBox(page, "#edge-e6");
  const start = await group.evaluate((element) => {
    const box = element.getBoundingClientRect();
    for (const fraction of [0.75, 0.25, 0.5]) {
      const point = {
        x: box.left + box.width * fraction,
        y: box.top + box.height * fraction,
      };
      const target = document.elementFromPoint(point.x, point.y);
      if (target?.getAttribute("data-entity-kind") === "group" &&
          target.getAttribute("data-entity-id") === "queues") return point;
    }
    return null;
  });
  expect(start, "group should expose a draggable hit area").not.toBeNull();

  await page.mouse.move(start!.x, start!.y);
  await page.mouse.down();
  await page.mouse.move(start!.x + 72, start!.y + 40, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await entityBox(page, "group", "queues")).x)
    .not.toBe(beforeGroup.x);
  const afterGroup = await entityBox(page, "group", "queues");
  const afterChild = await entityBox(page, "resource", "jobs");
  const afterEdge = await renderedBox(page, "#edge-e6");
  const dx = afterGroup.x - beforeGroup.x;
  const dy = afterGroup.y - beforeGroup.y;

  expect(afterChild.x - beforeChild.x).toBeCloseTo(dx, 0);
  expect(afterChild.y - beforeChild.y).toBeCloseTo(dy, 0);
  expect(afterEdge.x - beforeEdge.x).toBeCloseTo(dx, 0);
  expect(afterEdge.y - beforeEdge.y).toBeCloseTo(dy, 0);
  await expect(group).toHaveAttribute("aria-selected", "true");
});

test("clamps opposite corner and edge group resizes while preserving child geometry", async ({ page }) => {
  await openAsyncDocs(page);
  await selectGroup(page, "queues");

  const child = page.locator('[data-entity-kind="resource"][data-entity-id="jobs"]');
  const beforeCornerChild = await entityBox(page, "resource", "jobs");
  const cornerBox = await renderedBox(page, '[data-resize-kind="group"][data-resize-handle="nw"]');
  await page.mouse.move(cornerBox.x + cornerBox.width / 2, cornerBox.y + cornerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cornerBox.x + 600, cornerBox.y + 600, { steps: 8 });
  await page.mouse.up();

  const border = page.locator("#group-queues rect.group-border");
  await expect.poll(async () => Number(await border.getAttribute("width")))
    .toBeGreaterThanOrEqual(32);
  await expect.poll(async () => Math.round((await entityBox(page, "resource", "jobs")).x))
    .toBe(Math.round(beforeCornerChild.x));
  await expect.poll(async () => Math.round((await entityBox(page, "resource", "jobs")).y))
    .toBe(Math.round(beforeCornerChild.y));

  const beforeEdgeChild = await entityBox(page, "resource", "jobs");
  const edgeBox = await renderedBox(page, '[data-resize-kind="group"][data-resize-handle="w"]');
  await page.mouse.move(edgeBox.x + edgeBox.width / 2, edgeBox.y + edgeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(edgeBox.x + 600, edgeBox.y, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => Number(await border.getAttribute("width")))
    .toBeGreaterThanOrEqual(32);
  await expect.poll(async () => Math.round((await entityBox(page, "resource", "jobs")).x))
    .toBe(Math.round(beforeEdgeChild.x));
  await expect.poll(async () => Math.round((await entityBox(page, "resource", "jobs")).y))
    .toBe(Math.round(beforeEdgeChild.y));
  await expect(child).toHaveCount(1);
});

for (const gesture of ["move", "resize"] as const) {
  test(`cancels a group ${gesture} without history and undoes the next gesture in one step`, async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener("pointerdown", (event) => {
        (window as Window & { lastGesturePointer?: number }).lastGesturePointer = event.pointerId;
      }, { capture: true });
    });
    await openAsyncDocs(page);
    await selectGroup(page, "queues");
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await expect(undo).toBeDisabled();
    const original = await entityBox(page, "group", "queues");
    const target = gesture === "resize"
      ? await renderedBox(page, '[data-resize-kind="group"][data-resize-handle="se"]')
      : original;
    const start = { x: target.x + target.width / 2,
      y: gesture === "resize" ? target.y + target.height / 2 : target.y + 8 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 72, start.y + 48, { steps: 6 });
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent("pointercancel", {
        pointerId: (window as Window & { lastGesturePointer?: number }).lastGesturePointer,
      }));
    });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await entityBox(page, "group", "queues")).x)).toBe(Math.round(original.x));
    await expect.poll(async () => Math.round((await entityBox(page, "group", "queues")).width)).toBe(Math.round(original.width));
    await expect(undo).toBeDisabled();

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 72, start.y + 48, { steps: 6 });
    await page.mouse.up();
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(async () => Math.round((await entityBox(page, "group", "queues")).x)).toBe(Math.round(original.x));
    await expect.poll(async () => Math.round((await entityBox(page, "group", "queues")).width)).toBe(Math.round(original.width));
    await expect(undo).toBeDisabled();
  });
}

test("persists real wheel pan, modifier wheel zoom, and Space drag across tabs and reload", async ({ page }) => {
  await openAsyncDocs(page);
  const stage = page.getByTestId("canvas-stage");
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  const center = { x: stageBox!.x + stageBox!.width / 2, y: stageBox!.y + stageBox!.height / 2 };
  const blankPoint = await stage.evaluate((element) => {
    const box = element.getBoundingClientRect();
    for (const x of [0.08, 0.2, 0.8, 0.92]) {
      for (const y of [0.08, 0.2, 0.8, 0.92]) {
        const point = { x: box.left + box.width * x, y: box.top + box.height * y };
        const target = document.elementFromPoint(point.x, point.y);
        if (target?.closest("[data-testid=canvas-stage]") === element &&
            !target.closest("[data-interactive]")) return point;
      }
    }
    return null;
  });
  expect(blankPoint, "canvas should expose a blank panning surface").not.toBeNull();
  const initial = await worldTransform(page);

  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(96, 48);
  await expect.poll(() => worldTransform(page)).not.toBe(initial);
  const afterPan = await worldTransform(page);

  await page.keyboard.down(MOD);
  await page.mouse.wheel(0, -120);
  await page.keyboard.up(MOD);
  await expect.poll(() => worldTransform(page)).not.toBe(afterPan);
  const afterZoom = await worldTransform(page);

  await stage.focus();
  await page.keyboard.down("Space");
  await page.mouse.move(blankPoint!.x, blankPoint!.y);
  await page.mouse.down();
  await page.mouse.move(blankPoint!.x + 56, blankPoint!.y + 32, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect.poll(() => worldTransform(page)).not.toBe(afterZoom);
  const persisted = await worldTransform(page);

  const asyncTab = page.getByRole("tab", { name: /Async Docs/i });
  const tabs = page.getByRole("tab");
  await tabs.first().click();
  await asyncTab.click();
  await expect.poll(() => worldTransform(page)).toBe(persisted);

  await page.waitForTimeout(450);
  await page.reload();
  await waitForStudioReady(page);
  await expect.poll(() => worldTransform(page)).toBe(persisted);
});

test("copies and pastes nested groups with descendants and internal edges through clipboard fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => { throw new DOMException("clipboard denied", "NotAllowedError"); },
        read: async () => { throw new DOMException("clipboard denied", "NotAllowedError"); },
        readText: async () => { throw new DOMException("clipboard denied", "NotAllowedError"); },
      },
    });
  });
  await openAsyncDocs(page);

  await selectGroup(page, "use1");
  const groupsBefore = await page.locator('[data-entity-kind="group"]').count();
  const resourcesBefore = await page.locator('[data-entity-kind="resource"]').count();
  const edgesBefore = await page.locator('[data-entity-kind="edge"]').count();

  await page.keyboard.press(`${MOD}+C`);
  await expect(page.getByRole("status")).toContainText("Copied selection internally");
  await page.keyboard.press(`${MOD}+V`);

  await expect(page.getByRole("status")).toContainText("Pasted selection from Studio clipboard");
  await expect.poll(() => page.locator('[data-entity-kind="group"]').count())
    .toBeGreaterThan(groupsBefore);
  await expect.poll(() => page.locator('[data-entity-kind="resource"]').count())
    .toBeGreaterThan(resourcesBefore);
  await expect.poll(() => page.locator('[data-entity-kind="edge"]').count())
    .toBeGreaterThan(edgesBefore + 1);
});
