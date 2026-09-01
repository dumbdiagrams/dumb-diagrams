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

  await page.locator('input[type="file"]').setInputFiles(`${ROOT}/examples/diagrams/transfer-hub.dgm`);
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
