import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { ROOT, waitForStudioReady } from "./support/helpers";

const providerExamples = [
  {
    path: join(ROOT, "examples/curated/azure-private-app-service/diagram.dgm"),
    tab: "Azure private write-through application",
    renderedId: "#res-app_service",
  },
  {
    path: join(ROOT, "examples/curated/gcp-streaming-analytics/diagram.dgm"),
    tab: "Google Cloud streaming analytics platform",
    renderedId: "#res-gke",
  },
  {
    path: join(ROOT, "examples/curated/cloud-agnostic-order-processing/diagram.dgm"),
    tab: "Cloud-agnostic order processing",
    renderedId: "#res-order_service",
  },
] as const;

test("imports and renders every non-AWS curated provider workflow", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(providerExamples.map((example) => example.path));
  await waitForStudioReady(page);

  for (const example of providerExamples) {
    await page.getByRole("tab", { name: new RegExp(example.tab, "i") }).click();
    await waitForStudioReady(page);
    await expect(page.locator(example.renderedId)).toHaveCount(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
});
