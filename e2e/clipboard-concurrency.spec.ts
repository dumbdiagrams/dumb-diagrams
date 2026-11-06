import { expect, test } from "@playwright/test";
import { MOD, openSourceDrawer, waitForStudioReady } from "./support/helpers";

const payload = JSON.stringify({
  type: "dumb-diagrams/clipboard",
  annotations: [{ annotation: { id: "late-note", text: "Late clipboard note", style: "paper" }, place: { x: 24, y: 24, w: 220, h: 96 } }],
});

for (const change of ["tab", "source"] as const) {
  test(`pending clipboard paste preserves a changed ${change}`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        read: async () => [],
        readText: () => new Promise<string>((resolve) => {
          Object.assign(window, { pendingClipboardRead: resolve });
        }),
      } });
    });
    await page.goto("/");
    await waitForStudioReady(page);
    await page.getByRole("button", { name: "New diagram", exact: true }).click();
    await page.getByTestId("canvas-stage").click();
    await page.keyboard.press(`${MOD}+v`);
    await page.waitForFunction(() => typeof (window as unknown as { pendingClipboardRead?: unknown }).pendingClipboardRead === "function");
    if (change === "tab") {
      await page.getByRole("tab").first().click();
    } else {
      const drawer = await openSourceDrawer(page);
      const input = drawer.locator(".cm-content");
      await input.click();
      await page.keyboard.press(`${MOD}+A`);
      await page.keyboard.insertText("diagram newer-draft { grammar aws flow lr }");
      await input.blur();
    }
    await page.evaluate(async (text) => {
      (window as unknown as { pendingClipboardRead: (text: string) => void }).pendingClipboardRead(text);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    }, payload);
    await expect(page.locator('.diagram-svg [id^="annotation-"]')).toHaveCount(0);
    if (change === "tab") {
      await page.getByRole("tab").nth(1).click();
      await expect(page.locator('.diagram-svg [id^="annotation-"]')).toHaveCount(0);
    } else {
      await expect(page.getByRole("dialog", { name: "Source", exact: true }).locator(".cm-content")).toContainText("diagram newer-draft");
    }
  });
}
