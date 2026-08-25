import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

const ROOT = join(import.meta.dirname, "..");
const DIAGRAMS = join(ROOT, ".artifacts/packed-studio-e2e/project/diagrams");

test("runs the packed CLI and bundled Studio through the local-file lifecycle", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".local-studio-status")).toHaveText("Local file");
  await expect(page.locator(".file-name")).toHaveText("architecture.dgm");

  const title = page.getByRole("textbox", { name: "Diagram name", exact: true });
  await title.fill("Saved through packed Studio");
  await title.press("Enter");
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  await expect.poll(() => readFileSync(join(DIAGRAMS, "architecture.dgm"), "utf8"))
    .toContain("Saved through packed Studio");

  await page.reload();
  await expect(title).toHaveValue("Saved through packed Studio");
  await expect(page.locator(".local-studio-status")).toHaveText("Local file");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save As…", exact: true }).click();
  const saveAs = page.getByRole("dialog", { name: "Save diagram as" });
  await saveAs.getByLabel("Filename").fill("packed-copy.dgm");
  await saveAs.getByRole("button", { name: "Save .dgm", exact: true }).click();
  await expect.poll(() => readFileSync(join(DIAGRAMS, "packed-copy.dgm"), "utf8"))
    .toContain("Saved through packed Studio");
  await expect(page.locator(".file-name")).toHaveText("packed-copy.dgm");

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Open project diagram…", exact: true }).click();
  const projectFiles = page.getByRole("dialog", { name: "Project diagrams" });
  await expect(projectFiles.locator(".project-file-item")).toContainText(["architecture.dgm", "async-docs.dgm", "packed-copy.dgm"]);
  await projectFiles.getByRole("button").filter({ hasText: "async-docs.dgm" }).click();
  await expect(page.locator(".file-name")).toHaveText("async-docs.dgm");
  await expect(title).toHaveValue("Async Docs");

  await title.fill("Unsaved browser edit");
  await title.press("Enter");
  const asyncDocsPath = join(DIAGRAMS, "async-docs.dgm");
  const external = readFileSync(asyncDocsPath, "utf8")
    .replace("  flow lr\n", '  flow lr\n  title "External revision"\n');
  writeFileSync(asyncDocsPath, external, "utf8");
  const conflict = page.getByRole("alert").filter({ hasText: "File changed outside Studio" });
  await expect(conflict).toBeVisible();
  await conflict.getByRole("button", { name: "Reload from disk", exact: true }).click();
  await expect(title).toHaveValue("External revision");

  await page.route("**/api/events", (route) => route.abort());
  await page.reload();
  await expect(page.locator(".local-studio-status")).toHaveText("Studio disconnected");
  const recovered = readFileSync(asyncDocsPath, "utf8")
    .replace('title "External revision"', 'title "Recovered after reconnect"');
  writeFileSync(asyncDocsPath, recovered, "utf8");
  await page.unroute("**/api/events");
  await expect(page.locator(".local-studio-status")).toHaveText("Local file");
  await expect(title).toHaveValue("Recovered after reconnect");
});
