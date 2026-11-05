import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { ASYNC_DOCS, ROOT, waitForStudioReady } from "./support/helpers";

test("rejects invalid, oversized, and non-.dgm imports without replacing the workspace", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");

  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from("diagram broken { grammar aws\n  not valid"),
  });
  await expect(page.locator(".toast")).toContainText("broken.dgm");
  await expect(page.locator(".toast")).toContainText("invalid .dgm source");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");
  await expect(page.locator("#group-use1")).toHaveCount(1);

  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a diagram"),
  });
  await expect(page.locator(".toast")).toContainText("notes.txt");
  await expect(page.getByRole("tab")).toHaveCount(2);

  const oversized = "x".repeat(1_048_577);
  await page.locator('input[type="file"]').setInputFiles({
    name: "too-large.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(`diagram too-large {\n  grammar aws\n  ${oversized}\n}\n`),
  });
  await expect(page.locator(".toast")).toContainText("too-large.dgm");
  await expect(page.locator(".toast")).toContainText("over 1 MiB");
  await expect(page.getByRole("tab")).toHaveCount(2);

  await page.locator('input[type="file"]').setInputFiles(`${ROOT}/tests/fixtures/engine/transfer-hub.dgm`);
  await waitForStudioReady(page);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Transfer Hub");
});

test("keeps a valid diagram open when a later import in the same batch is invalid", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: "async-docs.dgm",
      mimeType: "text/plain",
      buffer: Buffer.from(readFileSync(ASYNC_DOCS)),
    },
    {
      name: "broken.dgm",
      mimeType: "text/plain",
      buffer: Buffer.from("diagram broken { grammar aws"),
    },
  ]);
  await waitForStudioReady(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");
  await expect(page.locator(".toast")).toContainText("Rejected broken.dgm");
});

test("reports validation failures for structurally invalid but parseable diagrams", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid-containment.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(`diagram invalid-containment {
  grammar aws
  aws.aws-lambda orphan "Orphan" {}
}
`),
  });
  await expect(page.locator(".toast")).toContainText("invalid-containment.dgm");
  await expect(page.locator(".toast")).toContainText("invalid .dgm source");
  await expect(page.getByRole("tab")).toHaveCount(1);
});

test("unsafe SVG typed into source reports an error and can be repaired", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Source", exact: true });
  const source = drawer.getByRole("textbox", { name: "Diagram source", exact: true });
  const unsafe = 'diagram asset-error { grammar aws cloud-agnostic.server box "Custom" { icon logo } } assets { asset logo { svg "<svg><script>alert(1)</script></svg>" w 32 h 32 } }';
  await source.fill(unsafe);
  await expect(drawer).toContainText(/script.*not allowed|invalid.*asset|unsafe.*SVG/i);
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
  await source.fill('diagram repaired { grammar aws cloud-agnostic.actor client "Client" }');
  await expect(page.locator('[data-entity-id="client"][data-entity-kind="resource"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
});
