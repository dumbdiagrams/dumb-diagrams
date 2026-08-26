import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

const formats = [
  { value: "png", label: "PNG", extension: ".png", verify: (data: Buffer) => expect(data.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { value: "jpeg", label: "JPEG", extension: ".jpg", verify: (data: Buffer) => expect(data.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8])) },
  { value: "webp", label: "WebP", extension: ".webp", verify: (data: Buffer) => expect(data.subarray(0, 12).toString("ascii")).toMatch(/^RIFF....WEBP$/s) },
  { value: "gif", label: "Animated GIF", extension: ".gif", verify: (data: Buffer) => expect(data.subarray(0, 6).toString("ascii")).toBe("GIF89a") },
  { value: "svg", label: "SVG", extension: ".svg", verify: (data: Buffer) => expect(data.toString("utf8")).toContain("<svg") },
  { value: "pdf", label: "PDF", extension: ".pdf", verify: (data: Buffer) => expect(data.subarray(0, 5).toString("ascii")).toBe("%PDF-") },
  { value: "html", label: "HTML", extension: ".html", verify: (data: Buffer) => expect(data.toString("utf8")).toMatch(/^<!doctype html>[\s\S]*<svg/) },
  { value: "xml", label: "XML", extension: ".xml", verify: (data: Buffer) => expect(data.toString("utf8")).toMatch(/^<\?xml[\s\S]*<diagram/) },
  { value: "url", label: "URL", extension: ".url.txt", verify: (data: Buffer) => expect(data.toString("utf8")).toContain("#diagram=") },
  { value: "json", label: "JSON", extension: ".json", verify: (data: Buffer) => expect(JSON.parse(data.toString("utf8"))).toHaveProperty("id") },
  { value: "dgm", label: "DGM source", extension: ".dgm", verify: (data: Buffer) => expect(data.toString("utf8")).toMatch(/^diagram\s/m) },
] as const;

test("downloads a structurally valid artifact for every advertised export format", async ({ page }) => {
  await page.goto("/");
  const supportsWebp = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  });

  for (const format of formats) {
    if (format.value === "webp" && !supportsWebp) {
      await page.getByRole("button", { name: "More export formats", exact: true }).click();
      await expect(page.getByRole("menuitem", { name: /WebP/ })).toHaveCount(0);
      await page.getByRole("button", { name: "More export formats", exact: true }).click();
      continue;
    }
    await test.step(format.label, async () => {
      await page.getByRole("button", { name: "More export formats", exact: true }).click();
      const picker = page.getByRole("menu", { name: "Export as", exact: true });
      await picker.locator(".export-format-option").filter({ hasText: format.label }).click();

      const dialog = page.getByRole("dialog", { name: `Export ${format.label}` });
      const downloadPromise = page.waitForEvent("download");
      await dialog.getByRole("button", { name: `Export ${format.label}`, exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename().endsWith(format.extension)).toBe(true);
      const path = await download.path();
      expect(path).not.toBeNull();
      const data = await readFile(path!);
      expect(data.byteLength).toBeGreaterThan(20);
      format.verify(data);
      await expect(dialog).toHaveCount(0);
    });
  }
});
