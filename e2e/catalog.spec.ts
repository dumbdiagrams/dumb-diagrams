import { expect, test, type Locator, type Page } from "@playwright/test";

const PROVIDER_SAMPLES = [
  { provider: "aws", type: "aws.elastic-container-registry", search: "Elastic Container Registry" },
  { provider: "azure", type: "azure.sql-database", search: "SQL Database" },
  { provider: "gcp", type: "gcp.bigquery", search: "BigQuery" },
  { provider: "cloud-agnostic", type: "cloud-agnostic.database", search: "Database" },
] as const;

async function openResources(page: Page, parentGroupId?: string) {
  await page.goto("/");
  if (parentGroupId) {
    const parentGroup = page.locator(
      `[data-entity-kind="group"][data-entity-id="${parentGroupId}"]`,
    );
    await expect(parentGroup).toHaveCount(1);
    // The region hit area surrounds nested resources; choose its empty upper-left
    // corner so a child resource does not intercept the pointer event.
    await parentGroup.click({ position: { x: 20, y: 20 } });
  }
  const resources = page.getByRole("button", { name: "Resources", exact: true });
  await expect(resources).toHaveCount(1);
  await resources.click();
  await expect(page.getByRole("tab", { name: "All", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

async function expectLoadedIcon(card: Locator) {
  const image = card.locator("img");
  await expect(image).toHaveCount(1);
  await expect
    .poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0))
    .toBe(true);
  await expect(card).toHaveAttribute("data-icon-status", "loaded");
}

test("renders a real icon for every catalog entry in the all-provider view", async ({ page }) => {
  const failedIconResponses: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/catalog-icons/") && !response.ok()) {
      failedIconResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/catalog-icons/")) failedIconResponses.push(request.url());
  });

  await openResources(page);
  const cards = page.locator('[data-catalog-type][data-asset-kind="resource"]');
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThan(1_000);

  await expect
    .poll(
      () =>
        page.locator('[data-catalog-type][data-asset-kind="resource"] img').evaluateAll((images) =>
          images.filter((image) => image.complete && image.naturalWidth > 0).length,
        ),
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .toBe(cardCount);
  await expect(page.locator('[data-icon-status="error"]')).toHaveCount(0);
  expect(failedIconResponses).toEqual([]);

  for (const sample of PROVIDER_SAMPLES) {
    await page.getByRole("textbox", { name: "Search catalog", exact: true }).fill(sample.search);
    const card = page.locator(`[data-catalog-type="${sample.type}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("data-provider", sample.provider);
    await expectLoadedIcon(card);
  }
});

test("searches across providers, favorites a service, and adds it to the canvas", async ({ page }) => {
  await openResources(page, "use1");
  const search = page.getByRole("textbox", { name: "Search catalog", exact: true });
  await search.fill("Elastic Container Registry");

  const card = page.locator('[data-catalog-type="aws.elastic-container-registry"]');
  await expect(card).toHaveCount(1);
  await expectLoadedIcon(card);

  const favorite = card.getByRole("button", {
    name: "Add Amazon Elastic Container Registry to favorites",
    exact: true,
  });
  await favorite.click();
  await expect(
    card.getByRole("button", {
      name: "Remove Amazon Elastic Container Registry from favorites",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await card.getByRole("button", { name: "Add Amazon Elastic Container Registry", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resources", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(
    page.locator(
      '[data-entity-kind="resource"][aria-label="Resource Amazon Elastic Container Registry"]',
    ),
  ).toHaveCount(1);
});

test("opens the group library and keeps provider group icons available", async ({ page }) => {
  await page.goto("/");
  const groups = page.getByRole("button", { name: "Groups", exact: true });
  await expect(groups).toHaveCount(1);
  await groups.click();

  const cards = page.locator('[data-catalog-type][data-asset-kind="group"]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(10);
  await expect(page.locator('[data-icon-status="error"]')).toHaveCount(0);
  await expect
    .poll(() => cards.locator("img").evaluateAll((images) => images.filter((image) => image.naturalWidth > 0).length))
    .toBe(count);
});

test("places a new root group outside the tiled canvas with resize controls", async ({ page }) => {
  await page.goto("/");

  const existingGroups = page.locator('[data-entity-kind="group"]');
  const beforeCount = await existingGroups.count();
  const existingRight = await existingGroups.evaluateAll((elements) =>
    Math.max(...elements.map((element) =>
      Number(element.getAttribute("x") ?? 0) + Number(element.getAttribute("width") ?? 0),
    )),
  );

  await page.getByRole("button", { name: "Groups", exact: true }).click();
  await page.locator('[data-catalog-type="aws.account"] .palette-item').click();

  await expect(existingGroups).toHaveCount(beforeCount + 1);
  const newGroup = page.locator('[data-entity-kind="group"][aria-selected="true"]');
  await expect(newGroup).toHaveCount(1);
  expect(Number(await newGroup.getAttribute("x"))).toBeGreaterThan(existingRight);

  const resizeHandle = page.locator('[data-resize-kind="group"][data-resize-handle="se"]');
  await expect(resizeHandle).toHaveCount(1);
  const beforeWidth = Number(await newGroup.getAttribute("width"));
  const handlePoint = await resizeHandle.evaluate((element) => {
    const svg = element.ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    return {
      x: rect.left + Number(element.getAttribute("x")) * scaleX,
      y: rect.top + Number(element.getAttribute("y")) * scaleY,
    };
  });
  await resizeHandle.dispatchEvent("pointerdown", {
    bubbles: true,
    pointerId: 1,
    clientX: handlePoint.x,
    clientY: handlePoint.y,
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 1,
      clientX: x + 48,
      clientY: y + 48,
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 1,
      clientX: x + 48,
      clientY: y + 48,
    }));
  }, handlePoint);
  await expect.poll(async () => Number(await newGroup.getAttribute("width"))).toBeGreaterThan(beforeWidth);
});
