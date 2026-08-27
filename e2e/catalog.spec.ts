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

test("keeps groups before resources in the left tool dock", async ({ page }) => {
  await page.goto("/");
  const labels = await page
    .getByRole("navigation", { name: "Diagram tools" })
    .getByRole("button")
    .evaluateAll((buttons) => buttons.slice(0, 3).map((button) => button.getAttribute("aria-label")));
  expect(labels).toEqual(["Select", "Boundaries", "Resources"]);
});

test("progressively renders real catalog icons in the all-provider view", async ({ page }) => {
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
  expect(cardCount).toBe(80);
  await expect(page.getByText(/Showing 80 of \d+/)).toBeVisible();
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(cards).toHaveCount(160);

  await expect
    .poll(
      () =>
        page.locator('[data-catalog-type][data-asset-kind="resource"] img').evaluateAll((images) =>
          images.filter((image) => image.complete && image.naturalWidth > 0).length,
        ),
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .toBe(160);
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
    name: "Add ECR to favorites",
    exact: true,
  });
  await favorite.click();
  await expect(
    card.getByRole("button", {
      name: "Remove ECR from favorites",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await card.getByRole("button", { name: "Add ECR", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resources", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(
    page.locator(
      '[data-entity-kind="resource"][aria-label="Resource ECR"]',
    ),
  ).toHaveCount(1);
});

test("drags a catalog resource onto the canvas", async ({ page }) => {
  await openResources(page);
  await page.getByRole("textbox", { name: "Search catalog", exact: true }).fill("Elastic Container Registry");

  const card = page.locator('[data-catalog-type="aws.elastic-container-registry"]');
  await expect(card).toHaveCount(1);
  const stage = page.locator('[data-testid="canvas-stage"]');
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();

  await card.locator(".palette-item").dragTo(stage, {
    targetPosition: {
      x: stageBox!.width - 120,
      y: stageBox!.height - 120,
    },
  });

  await expect(page.locator('[data-entity-kind="resource"][aria-label="Resource ECR"]')).toHaveCount(1);
});

test("places root resources in the open lane and allows manual compatibility overrides", async ({ page }) => {
  await openResources(page);
  const resources = page.locator('[data-entity-kind="resource"]');
  const existingRight = await resources.evaluateAll((elements) =>
    Math.max(...elements.map((element) =>
      Number(element.getAttribute("x") ?? 0) + Number(element.getAttribute("width") ?? 0),
    )),
  );

  const search = page.getByRole("textbox", { name: "Search catalog", exact: true });
  await search.fill("Elastic Container Registry");
  const rootCard = page.locator('[data-catalog-type="aws.elastic-container-registry"]');
  await expect(rootCard).toHaveCount(1);
  await rootCard.getByRole("button", { name: "Add ECR", exact: true }).click();

  const rootResource = page.locator('[data-entity-kind="resource"][aria-selected="true"]');
  await expect(rootResource).toHaveCount(1);
  expect(Number(await rootResource.getAttribute("x"))).toBeGreaterThan(existingRight);

  await openResources(page, "use1");
  await page.getByRole("textbox", { name: "Search catalog", exact: true }).fill("Elastic Container Service");
  const manuallyNestedCard = page.locator('[data-catalog-type="aws.elastic-container-service"]');
  await expect(manuallyNestedCard).toHaveCount(1);
  await manuallyNestedCard.getByRole("button", { name: "Add ECS", exact: true }).click();

  const inspector = page.getByRole("dialog", { name: "ECS", exact: true });
  await expect(inspector).toHaveCount(1);
  await inspector.getByText("Advanced details", { exact: true }).click();
  await expect(inspector.getByText("AWS Region (us-east-1)", { exact: true })).toBeVisible();
});

test("opens the group library and keeps provider group icons available", async ({ page }) => {
  await page.goto("/");
  const groups = page.getByRole("button", { name: "Boundaries", exact: true });
  await expect(groups).toHaveCount(1);
  await groups.click();

  const footerZ = await page.locator(".privacy-footer").evaluate((element) =>
    Number.parseInt(getComputedStyle(element).zIndex, 10),
  );
  const drawerZ = await page.locator(".floating-panel.drawer-sheet").evaluate((element) =>
    Number.parseInt(getComputedStyle(element).zIndex, 10),
  );
  expect(footerZ).toBeLessThan(drawerZ);

  const cards = page.locator('[data-catalog-type][data-asset-kind="group"]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(10);
  await expect(page.locator('[data-icon-status="error"]')).toHaveCount(0);
  await expect
    .poll(() => cards.locator("img").evaluateAll((images) => images.filter((image) => image.naturalWidth > 0).length))
    .toBe(count);
});

test("adds cloud-agnostic boundaries as resizable groups", async ({ page }) => {
  await page.goto("/");
  const groups = page.locator('[data-entity-kind="group"]');
  const beforeCount = await groups.count();

  await page.getByRole("button", { name: "Boundaries", exact: true }).click();
  await page.getByRole("tab", { name: "Cloud-agnostic", exact: true }).click();

  const cloud = page.locator('[data-catalog-type="cloud-agnostic.cloud"]');
  await expect(cloud).toHaveCount(1);
  await expect(cloud).toHaveAttribute("data-asset-kind", "group");

  const cluster = page.locator('[data-catalog-type="cloud-agnostic.cluster"]');
  await expect(cluster).toHaveCount(1);
  await expect(cluster).toHaveAttribute("data-asset-kind", "group");
  const boundary = page.locator('[data-catalog-type="cloud-agnostic.boundary"]');
  await expect(boundary).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add boundary", exact: true })).toBeVisible();
  await cluster.locator(".palette-item").click();

  await expect(groups).toHaveCount(beforeCount + 1);
  await expect(page.locator('[data-entity-kind="group"][aria-label="Group Cluster"]')).toHaveCount(1);
  await expect(page.locator('[data-entity-kind="resource"][aria-label="Resource Cluster"]')).toHaveCount(0);
  await expect(page.locator('[data-resize-kind="group"][data-resize-handle="se"]')).toHaveCount(1);
  await expect(page.locator('[data-resize-kind="group"][data-resize-handle="e"]')).toHaveCount(1);
  await expect(page.locator('[data-resize-kind="group"][data-resize-handle="s"]')).toHaveCount(1);
});

test("creates and customizes an iconless boundary and hides icons on semantic boundaries", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Boundaries", exact: true }).click();

  const boundaryAction = page.getByRole("button", { name: "Add boundary", exact: true });
  await expect(boundaryAction).toBeVisible();
  await boundaryAction.click();

  const boundaryGroup = page.locator('[data-entity-kind="group"][aria-label="Group Boundary"]');
  await expect(boundaryGroup).toHaveCount(1);
  const boundaryId = await boundaryGroup.getAttribute("data-entity-id");
  expect(boundaryId).toBeTruthy();
  await expect(page.locator(`#group-${boundaryId} image`)).toHaveCount(0);

  const boundaryInspector = page.getByRole("dialog", { name: "Boundary", exact: true });
  await boundaryInspector.locator(".boundary-color-options").getByRole("radio", { name: "Purple" }).click();
  await boundaryInspector.getByRole("radio", { name: "None" }).click();
  const renderedBoundary = page.locator(`#group-${boundaryId} rect`).first();
  await expect(renderedBoundary).toHaveAttribute("stroke", "#7C3AED");
  await expect(renderedBoundary).toHaveAttribute("fill", "transparent");

  await page.getByRole("button", { name: "Boundaries", exact: true }).click();
  await page.getByRole("tab", { name: "Cloud-agnostic", exact: true }).click();
  await page.locator('[data-catalog-type="cloud-agnostic.cluster"] .palette-item').click();

  const inspector = page.getByRole("dialog", { name: "Cluster", exact: true });
  await expect(inspector.getByRole("button", { name: "Hide icon", exact: true })).toBeVisible();
  await inspector.getByRole("button", { name: "Hide icon", exact: true }).click();

  const cloudGroup = page.locator('[data-entity-kind="group"][aria-label="Group Cluster"]');
  const cloudGroupId = await cloudGroup.getAttribute("data-entity-id");
  expect(cloudGroupId).toBeTruthy();
  await expect(page.locator(`#group-${cloudGroupId} image`)).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Hide icon", exact: true })).toHaveClass(/is-active/);
});

test("drags a catalog group onto the canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Boundaries", exact: true }).click();
  await page.getByRole("tab", { name: "Cloud-agnostic", exact: true }).click();

  const card = page.locator('[data-catalog-type="cloud-agnostic.cluster"]');
  await expect(card).toHaveCount(1);
  const stage = page.locator('[data-testid="canvas-stage"]');
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();

  await card.locator(".palette-item").dragTo(stage, {
    targetPosition: {
      x: stageBox!.width - 120,
      y: stageBox!.height - 120,
    },
  });

  await expect(page.locator('[data-entity-kind="group"][aria-label="Group Cluster"]')).toHaveCount(1);
  await expect(page.locator('[data-entity-kind="resource"][aria-label="Resource Cluster"]')).toHaveCount(0);
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

  await page.getByRole("button", { name: "Boundaries", exact: true }).click();
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

test("supports paper, code, callout, and checklist note styles", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add note", exact: true }).click();

  const stage = page.locator('[data-testid="canvas-stage"]');
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  const composer = page.getByRole("dialog", { name: "Choose note style", exact: true });
  await expect(composer).toHaveCount(1);
  const composerBox = await composer.boundingBox();
  expect(composerBox).not.toBeNull();
  expect(composerBox!.x).toBeLessThan(stageBox!.x + stageBox!.width / 2);
  await expect(composer.locator(".note-style-grid-with-previews [data-note-style-preview]")).toHaveCount(4);
  const selectedNote = page.locator('[data-entity-kind="annotation"][aria-selected="true"]');
  await expect(selectedNote).toHaveCount(0);
  await expect(composer.getByRole("button", { name: "Paper", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  for (const style of ["Code snippet", "Callout", "Checklist"]) {
    await composer.getByRole("button", { name: style, exact: true }).click();
    await expect(selectedNote).toHaveCount(0);
  }

  await composer.getByRole("button", { name: "Code snippet", exact: true }).click();
  await composer.getByRole("button", { name: "Create Code snippet", exact: true }).click();
  await expect(composer).toHaveCount(0);
  await expect(selectedNote).toHaveCount(1);
  await expect(page.locator('[data-annotation-style="code"]')).toHaveCount(1);

  const inspector = page.getByRole("dialog", { name: "Note", exact: true });
  await expect(inspector).toHaveCount(1);
  const inspectorBox = await inspector.boundingBox();
  expect(inspectorBox).not.toBeNull();
  expect(inspectorBox!.x).toBeGreaterThan(stageBox!.x + stageBox!.width / 2);
  await expect(inspector.getByText("Note style", { exact: true })).toBeVisible();
});

test("formats plain text from the composer and selection inspector", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Text", exact: true }).click();

  const composer = page.getByRole("dialog", { name: "Add text", exact: true });
  await expect(composer).toBeVisible();
  await composer.getByRole("textbox", { name: "Text content" }).fill("Architecture note");
  await composer.getByLabel("Font", { exact: true }).selectOption("serif");
  await composer.getByLabel("Size", { exact: true }).selectOption("20");
  await composer.getByRole("button", { name: "Center", exact: true }).click();
  await composer.getByRole("button", { name: "Place text", exact: true }).click();

  const renderedText = page.locator('.diagram-svg [data-annotation-style="text"] text');
  await expect(renderedText).toHaveAttribute("font-family", /Georgia/);
  await expect(renderedText).toHaveAttribute("font-size", "20");
  await expect(renderedText).toHaveAttribute("text-anchor", "middle");

  const inspector = page.locator(".inspector-sheet");
  await expect(inspector.getByLabel("Font", { exact: true })).toHaveValue("serif");
  await inspector.getByLabel("Font", { exact: true }).selectOption("mono");
  await expect(renderedText).toHaveAttribute("font-family", /ui-monospace/);
});
