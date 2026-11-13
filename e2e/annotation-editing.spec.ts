import { expect, test } from "@playwright/test";

import { MOD, ROOT, openSourceDrawer, waitForStudioReady } from "./support/helpers";

test("edits annotations live on the canvas and in the inspector", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(`${ROOT}/tests/compat/v1/kitchen-sink.dgm`);
  await waitForStudioReady(page);

  const note = page.locator('[data-entity-kind="annotation"][data-entity-id="note_code"]');
  await expect(note).toHaveCount(1);
  await note.dblclick();
  const canvasEditor = page.getByRole("textbox", { name: "Edit note text" });
  await expect(canvasEditor).toBeFocused();
  await canvasEditor.fill("");
  await expect(page.locator("#inspector-label")).toHaveValue("");
  await expect(page.locator('.toast[role="status"]').filter({ hasText: "annotation text must" })).toHaveCount(0);
  await canvasEditor.type("live canvas\nsecond line");
  await expect(canvasEditor).toBeFocused();
  await expect(page.locator(".diagram-svg #annotation-note_code text")).toContainText("live canvas");
  await expect(page.locator("#inspector-label")).toHaveValue("live canvas\nsecond line");
  await canvasEditor.press("Control+Enter");
  await expect(canvasEditor).toHaveCount(0);

  const sidebarEditor = page.locator("#inspector-label");
  await sidebarEditor.fill("");
  await sidebarEditor.type("live sidebar\nsecond line");
  await expect(sidebarEditor).toHaveValue("live sidebar\nsecond line");
  await expect(sidebarEditor).toBeFocused();
  await expect(page.locator(".diagram-svg #annotation-note_code text")).toContainText("live sidebar");
  await expect(canvasEditor).toHaveCount(0);
  await sidebarEditor.press("Escape");
  await expect(sidebarEditor).toHaveValue("live canvas\nsecond line");
  await page.keyboard.press(`${MOD}+z`);
  await expect(sidebarEditor).toHaveValue("Code");

  const text = page.locator('[data-entity-kind="annotation"][data-entity-id="note_text"]');
  await text.dblclick();
  const textEditor = page.getByRole("textbox", { name: "Edit note text" });
  await expect(textEditor).toBeFocused();
  await textEditor.fill("plain text edit");
  await textEditor.press("Control+Enter");
  await page.locator("#inspector-text-font-family").selectOption("serif");
  await page.locator("#inspector-text-font-size").fill("20");
  await page.locator("#inspector-text-font-size").press("Enter");
  await page.getByRole("button", { name: "Colour theme: Lavender" }).click();
  await page.getByRole("button", { name: "Center", exact: true }).click();
  await expect(text).toHaveAttribute("aria-label", "Text plain text edit");

  const renderedText = page.locator(".diagram-svg #annotation-note_text text");
  await expect(renderedText).toHaveAttribute("text-anchor", "middle");
  const typography = await renderedText.evaluate((text) => ({ size: getComputedStyle(text).fontSize, color: getComputedStyle(text).fill, family: getComputedStyle(text).fontFamily }));
  expect(typography.size).toBe("20px");
  expect(typography.color).toBe("rgb(61, 45, 92)");
  expect(typography.family).toContain("Georgia");
  await expect(page.locator("#annotation-note_text rect")).toHaveAttribute("fill", "#ebe6f5");

  const sourceDrawer = await openSourceDrawer(page);
  const sourceEditor = sourceDrawer.locator(".cm-content");
  await expect(sourceEditor).toContainText('annotation note_text "plain text edit"');
  await expect(sourceEditor).toContainText("font serif");
  await expect(sourceEditor).toContainText("size 20");
  await expect(sourceEditor).toContainText("align center");
  await expect(sourceEditor).toContainText('background "#ebe6f5"');
  await expect(sourceEditor).toContainText('color "#3d2d5c"');
});
