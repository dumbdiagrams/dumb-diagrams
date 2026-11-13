import { expect, test } from "@playwright/test";

import { ROOT, openSourceDrawer, waitForStudioReady } from "./support/helpers";

test("annotation size fields accept presets and precise custom values", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(`${ROOT}/tests/compat/v1/kitchen-sink.dgm`);
  await waitForStudioReady(page);

  const code = page.locator('[data-entity-kind="annotation"][data-entity-id="note_code"]');
  await code.click();
  const codeSize = page.locator("#inspector-text-font-size");
  await expect(codeSize).toHaveValue("14");
  await codeSize.fill("11");
  await expect.poll(() => page.locator(".diagram-svg #annotation-note_code text").evaluate((el) => getComputedStyle(el).fontSize)).toBe("11px");

  const text = page.locator('[data-entity-kind="annotation"][data-entity-id="note_text"]');
  await text.click();
  const size = page.locator("#inspector-text-font-size");
  await expect(size).toHaveValue("12");
  await expect(page.locator("#inspector-text-font-size-presets option[value='6']")).toHaveCount(1);

  await size.fill("8");
  await expect.poll(() => page.locator(".diagram-svg #annotation-note_text text").evaluate((el) => getComputedStyle(el).fontSize)).toBe("8px");
  await size.fill("8.5");
  await expect.poll(() => page.locator(".diagram-svg #annotation-note_text text").evaluate((el) => getComputedStyle(el).fontSize)).toBe("8.5px");
  const sourceAtFractionalSize = await openSourceDrawer(page);
  await expect(sourceAtFractionalSize.locator(".cm-content")).toContainText("size 8.5");
  const savedDsl = await sourceAtFractionalSize.locator(".cm-content").innerText();
  await sourceAtFractionalSize.getByRole("button", { name: "Close" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "fractional-size.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(savedDsl),
  });
  await waitForStudioReady(page);
  await page.locator('[data-entity-kind="annotation"][data-entity-id="note_text"]').click();
  await expect(page.locator("#inspector-text-font-size")).toHaveValue("8.5");

  for (const invalid of ["5", "97", ""]) {
    await size.fill(invalid);
    await expect.poll(() => page.locator(".diagram-svg #annotation-note_text text").evaluate((el) => getComputedStyle(el).fontSize)).toBe("8.5px");
    await size.blur();
    await expect(size).toHaveValue("8.5");
  }

  await size.fill("64");
  await size.press("Enter");
  await expect(size).toHaveValue("64");
  await expect.poll(() => page.locator(".diagram-svg #annotation-note_text text").evaluate((el) => getComputedStyle(el).fontSize)).toBe("64px");

  const source = await openSourceDrawer(page);
  await expect(source.locator(".cm-content")).toContainText("size 64");
});

test("composer exposes the same editable size control and fits a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  const composer = page.getByRole("dialog", { name: "Add text", exact: true });
  const size = composer.locator("#composer-text-font-size");
  await expect(size).toBeVisible();
  await composer.getByRole("textbox", { name: "Text content" }).fill("Small text");
  await size.fill("8.5");
  await size.press("Enter");
  await expect(size).toHaveValue("8.5");
  const box = await size.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(640);
  await composer.getByRole("button", { name: "Place text", exact: true }).click();
  await expect(page.locator('.diagram-svg [data-annotation-style="text"] text')).toHaveAttribute("font-size", "8.5");

  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const noteComposer = page.getByRole("dialog", { name: "Choose note style", exact: true });
  await expect(noteComposer.getByRole("button", { name: "Paper", exact: true })).toHaveAttribute("aria-pressed", "true");
  await noteComposer.getByRole("button", { name: "Create Paper", exact: true }).click();
  const paperSize = page.locator("#inspector-text-font-size");
  await paperSize.fill("8.5");
  await expect.poll(() => page.locator('.diagram-svg [data-annotation-style="paper"] text').last().evaluate((el) => getComputedStyle(el).fontSize)).toBe("8.5px");
});
