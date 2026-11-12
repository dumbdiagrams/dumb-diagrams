import { expect, test, type Page } from "@playwright/test";

import { waitForStudioReady } from "./support/helpers";

const source = `diagram annotation-inline-editor-regression {
  grammar cloud-agnostic
  cloud-agnostic.server worker "Application worker"
  annotation callout_note "Callout text stays inside its note" { style callout font sans size 16 }
  annotation code_note "const queue = await receive()" { style code font mono size 16 }
  annotation text_note "Plain text stays aligned" { style text font serif size 20 }
}
view default {
  annotation callout_note { x -360 y -180 w 300 h 120 pin }
  annotation code_note { x 80 y -180 w 420 h 160 pin }
  annotation text_note { x -360 y 150 w 260 h 64 pin }
}`;

type Style = "callout" | "code" | "text";

async function importSource(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "annotation-inline.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  await waitForStudioReady(page);
}

async function frameSignature(page: Page, id: string, style: Style) {
  const rect = page.locator(`.diagram-svg #annotation-${id} rect`).first();
  if (style === "text") {
    const hit = page.locator(`[data-entity-kind="annotation"][data-entity-id="${id}"]`);
    return hit.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
  }
  return rect.evaluate((element) => ({
    x: element.getAttribute("x"),
    y: element.getAttribute("y"),
    width: element.getAttribute("width"),
    height: element.getAttribute("height"),
    fill: element.getAttribute("fill"),
    stroke: element.getAttribute("stroke"),
  }));
}

async function panCanvasDown(page: Page, amount: number) {
  const stage = page.getByTestId("canvas-stage");
  const start = await stage.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const candidates = [0.2, 0.4, 0.6, 0.8].flatMap((x) =>
      [0.35, 0.5, 0.65, 0.8].map((y) => ({
        x: box.left + box.width * x,
        y: box.top + box.height * y,
      })),
    );
    return candidates.find(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return Boolean(
        target &&
          element.contains(target) &&
          !target.closest("[data-interactive], button, input, textarea, select, [role=button], .floating-topbar, .status-capsule, .floating-panel"),
      );
    }) ?? null;
  });
  expect(start, "should find unobstructed canvas space to pan from").not.toBeNull();

  await page.keyboard.down("Space");
  await page.mouse.move(start!.x, start!.y);
  await page.mouse.down();
  await page.mouse.move(start!.x, start!.y + amount, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Space");
}

test("opens annotation editors in place across negative canvas bounds and zoom", async ({ page }) => {
  await importSource(page);

  await page.getByRole("button", { name: "Fit to screen", exact: true }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const callout = page.locator('[data-entity-kind="annotation"][data-entity-id="callout_note"]');
  const calloutBeforePan = await callout.boundingBox();
  const topbar = await page.locator(".floating-topbar").boundingBox();
  expect(calloutBeforePan).not.toBeNull();
  expect(topbar).not.toBeNull();
  const panDistance = Math.max(48, topbar!.y + topbar!.height + 16 - calloutBeforePan!.y);
  await panCanvasDown(page, panDistance);
  const calloutAfterPan = await callout.boundingBox();
  expect(calloutAfterPan).not.toBeNull();
  expect(calloutAfterPan!.y).toBeGreaterThan(topbar!.y + topbar!.height);

  // Exercise a transformed world; note positions force a nonzero, negative SVG viewBox origin.
  for (const { id, style, editedText } of [
    { id: "callout_note", style: "callout" as const, editedText: "Callout edited in place" },
    { id: "code_note", style: "code" as const, editedText: "const result = await fetch()" },
    { id: "text_note", style: "text" as const, editedText: "Plain text edited in place" },
  ]) {
    const note = page.locator(`[data-entity-kind="annotation"][data-entity-id="${id}"]`);
    const group = page.locator(`.diagram-svg #annotation-${id}`);
    await expect(note).toHaveCount(1);
    const originalFrame = await frameSignature(page, id, style);
    const content = group.locator('[data-annotation-content="true"]');
    await expect(content).toHaveCount(1);

    if (style === "code") {
      const originalFont = await content.evaluate((element) => getComputedStyle(element).fontFamily);
      expect(originalFont).toMatch(/mono|menlo|consolas|courier/i);
    }

    await note.dblclick();
    const editor = page.getByRole("textbox", { name: "Edit note text" });
    await expect(editor).toBeFocused();
    await expect(editor).toHaveAttribute("data-editing-annotation-id", id);
    await expect(content).toHaveCSS("visibility", "hidden");

    // The editor must fit within this note's rendered frame/hit area. The callout
    // text starts after its icon and code text starts below its title bar.
    const geometry = await page.evaluate(({ id, style }) => {
      const group = document.querySelector<SVGGElement>(`.diagram-svg #annotation-${id}`)!;
      const editor = document.querySelector<HTMLTextAreaElement>("textarea[data-editing-annotation-id]")!;
      const target = style === "text"
        ? document.querySelector<SVGRectElement>(`[data-entity-kind="annotation"][data-entity-id="${id}"]`)!
        : group.querySelector<SVGRectElement>("rect")!;
      const note = target.getBoundingClientRect();
      const edit = editor.getBoundingClientRect();
      return {
        note: { left: note.left, top: note.top, right: note.right, bottom: note.bottom, width: note.width, height: note.height },
        edit: { left: edit.left, top: edit.top, right: edit.right, bottom: edit.bottom },
        style,
        font: getComputedStyle(editor).fontFamily,
      };
    }, { id, style });
    expect(geometry.edit.left).toBeGreaterThanOrEqual(geometry.note.left - 1);
    expect(geometry.edit.top).toBeGreaterThanOrEqual(geometry.note.top - 1);
    expect(geometry.edit.right).toBeLessThanOrEqual(geometry.note.right + 1);
    expect(geometry.edit.bottom).toBeLessThanOrEqual(geometry.note.bottom + 1);
    if (style === "callout") expect(geometry.edit.left).toBeGreaterThanOrEqual(geometry.note.left + geometry.note.width * 0.12);
    if (style === "code") expect(geometry.edit.top).toBeGreaterThanOrEqual(geometry.note.top + geometry.note.height * 0.12);
    if (style === "code") expect(geometry.font).toMatch(/mono|menlo|consolas|courier/i);

    if (style === "callout") {
      await expect(group.locator("circle").first()).toBeVisible();
      await expect(page.locator("#inspector-label")).toHaveValue("Callout text stays inside its note");
      expect(await frameSignature(page, id, style)).toEqual(originalFrame);
    } else if (style === "code") {
      await expect(group.locator("circle")).toHaveCount(3);
      await expect(group.locator("circle").first()).toBeVisible();
      await expect(group.locator("rect").nth(1)).toBeVisible();
      await expect(page.locator("#inspector-label")).toHaveValue("const queue = await receive()");
      expect(await frameSignature(page, id, style)).toEqual(originalFrame);
    }

    await editor.fill(editedText);
    await expect(page.locator("#inspector-label")).toHaveValue(editedText);
    await expect(page.locator(`[data-entity-kind="annotation"][data-entity-id="${id}"]`)).toHaveCount(1);
    await page.locator("#inspector-label").focus();
    await expect(editor).toHaveCount(0);
    await expect(content).toBeVisible();
    await expect.poll(async () =>
      content.evaluate((element) => (element.textContent ?? "").replace(/\s+/g, "")),
    ).toContain(editedText.replace(/\s+/g, ""));
    await expect(page.locator(`[data-entity-kind="annotation"][data-entity-id="${id}"]`)).toHaveCount(1);
    await expect(page.locator("#inspector-label")).toHaveValue(editedText);
  }
});
