import { expect, test, type Page } from "@playwright/test";

async function canvasPointForE3(page: Page) {
  const points = await canvasPointsForE3(page);
  return points[0]!;
}

async function canvasPointsForE3(page: Page) {
  return page.locator('[data-entity-kind="edge"][data-entity-id="e3"]').evaluate((element) => {
    const routePoints = (element.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((value) => {
        const [x, y] = value.split(",").map(Number);
        return { x, y };
      });
    const svg = element.ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    return routePoints.slice(0, -1).map((a, index) => {
      const b = routePoints[index + 1]!;
      return {
        x: rect.left + ((a.x + b.x) / 2) * scaleX,
        y: rect.top + ((a.y + b.y) / 2) * scaleY,
      };
    });
  });
}

async function selectE3(page: Page) {
  const edge = page.locator('[data-entity-kind="edge"][data-entity-id="e3"]');
  await expect(edge).toHaveCount(1);
  const edgePoint = await canvasPointForE3(page);
  await edge.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: edgePoint.x,
    clientY: edgePoint.y,
  });
  await edge.dispatchEvent("pointerup", {
    bubbles: true,
    button: 0,
    clientX: edgePoint.x,
    clientY: edgePoint.y,
  });
  await edge.dispatchEvent("click", {
    bubbles: true,
    clientX: edgePoint.x,
    clientY: edgePoint.y,
  });
  await expect(edge).toHaveAttribute("aria-selected", "true");
  return edge;
}

test("highlights the nearest canvas target and edits a movable numbered edge badge", async ({ page }) => {
  await page.goto("/");

  const region = page.locator('[data-entity-kind="group"][data-entity-id="use1"]');
  await expect(region).toHaveCount(1);
  await region.hover({ position: { x: 20, y: 20 } });
  await expect(page.locator('[data-hover-kind="group"][data-hover-id="use1"]')).toHaveCount(1);

  // Use an exposed point on the region's top-left border. A deep point can
  // legitimately be covered by a nested group hit layer in the SVG stack.
  await region.click({ position: { x: 4, y: 8 } });
  await expect(region).toHaveAttribute("aria-selected", "true");

  const edge = page.locator('[data-entity-kind="edge"][data-entity-id="e3"]');
  await expect(edge).toHaveCount(1);
  const hover = page.locator('[data-hover-kind="edge"][data-hover-id="e3"]');
  // Try each routed segment: the inspector or a nearby node can cover one
  // physical midpoint after layout changes, while another segment remains a
  // deterministic edge-hover target.
  for (const edgePoint of await canvasPointsForE3(page)) {
    await edge.dispatchEvent("pointermove", {
      bubbles: true,
      clientX: edgePoint.x,
      clientY: edgePoint.y,
    });
    if (await hover.count()) break;
  }
  await expect(hover).toHaveCount(1);
  // SVG pointer targeting can vary with the browser's transformed canvas
  // surface; dispatch on the verified connector hit element to exercise the
  // same React pointer/click handlers deterministically.
  const edgePoint = await canvasPointForE3(page);
  await edge.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: edgePoint.x,
    clientY: edgePoint.y,
  });
  await edge.dispatchEvent("pointerup", {
    bubbles: true,
    button: 0,
    clientX: edgePoint.x,
    clientY: edgePoint.y,
  });
  await edge.dispatchEvent("click", {
    bubbles: true,
    clientX: edgePoint.x,
    clientY: edgePoint.y,
  });
  await expect(edge).toHaveAttribute("aria-selected", "true");

  const numberControl = page.locator("#edge-panel-step");
  await expect(numberControl).toHaveCount(1);
  await numberControl.click();

  const numberInput = page.locator("input#edge-panel-step");
  await expect(numberInput).toHaveCount(1);
  await numberInput.fill("7");
  const badge = page.locator('[data-edge-badge="e3"]');
  await expect(badge).toHaveCount(1);
  await expect(badge.locator("text")).toHaveText("7");
  await badge.scrollIntoViewIfNeeded();
  await expect(badge).toBeVisible();

  const before = await badge.boundingBox();
  expect(before).not.toBeNull();
  const centerX = before!.x + before!.width / 2;
  const centerY = before!.y + before!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY + 38, { steps: 8 });
  await expect(page.locator('[data-edge-badge-preview]')).toHaveCount(1);
  await page.mouse.up();

  const after = await badge.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.y).toBeGreaterThan(before!.y + 12);
});

test("exposes draggable turn points and moves a connector bend", async ({ page }) => {
  await page.goto("/");
  const edge = await selectE3(page);

  const routeEditor = page.locator('[data-route-editor="e3"]');
  await expect(routeEditor).toHaveCount(1);
  const bendHandles = page.locator('[data-bend-handle^="e3:"]');
  const bendCount = await bendHandles.count();
  expect(bendCount).toBeGreaterThan(0);
  const bend = bendHandles.nth(Math.min(1, bendCount - 1));
  await bend.scrollIntoViewIfNeeded();
  const beforeBox = await bend.boundingBox();
  const beforePoints = await edge.getAttribute("points");
  expect(beforeBox).not.toBeNull();
  expect(beforePoints).toBeTruthy();

  const centerX = beforeBox!.x + beforeBox!.width / 2;
  const centerY = beforeBox!.y + beforeBox!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 24, centerY + 16, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => edge.getAttribute("points")).not.toBe(beforePoints);
});

test("adds an orthogonal manual break point on connector double-click", async ({ page }) => {
  await page.goto("/");
  const edge = await selectE3(page);
  const beforePoints = await edge.getAttribute("points");
  const edgePoint = await canvasPointForE3(page);

  await edge.dispatchEvent("dblclick", {
    bubbles: true,
    clientX: edgePoint.x,
    clientY: edgePoint.y,
  });

  await expect.poll(async () => edge.getAttribute("points")).not.toBe(beforePoints);
  const points = await edge.evaluate((element) =>
    (element.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((value) => {
        const [x, y] = value.split(",").map(Number);
        return { x, y };
      }),
  );
  expect(points.length).toBeGreaterThan(4);
  expect(points.slice(0, -1).every((point, index) => {
    const next = points[index + 1]!;
    return point.x === next.x || point.y === next.y;
  })).toBe(true);
});

test("exposes segment handles and moves a routed connector section", async ({ page }) => {
  await page.goto("/");
  const edge = await selectE3(page);

  const segmentHandles = page.locator('[data-segment-handle^="e3:"]');
  const segmentCount = await segmentHandles.count();
  expect(segmentCount).toBeGreaterThan(0);
  const segment = segmentHandles.nth(Math.min(1, segmentCount - 1));
  await segment.scrollIntoViewIfNeeded();
  const beforeBox = await segment.boundingBox();
  const beforePoints = await edge.getAttribute("points");
  expect(beforeBox).not.toBeNull();
  expect(beforePoints).toBeTruthy();

  const orientation = await segment.getAttribute("class");
  const centerX = beforeBox!.x + beforeBox!.width / 2;
  const centerY = beforeBox!.y + beforeBox!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(
    orientation?.includes("is-horizontal") ? centerX : centerX + 24,
    orientation?.includes("is-horizontal") ? centerY + 24 : centerY,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect.poll(async () => edge.getAttribute("points")).not.toBe(beforePoints);
});

test("uses clear lock controls in the layers panel", async ({ page }) => {
  await page.goto("/");
  const layers = page.getByRole("button", { name: "Layers", exact: true });
  await expect(layers).toHaveCount(1);
  await layers.click();

  const lockToggle = page.locator('[data-layer-lock="client"]');
  await expect(lockToggle).toHaveCount(1);
  await expect(lockToggle).toHaveAttribute("aria-label", "Lock");
  await expect(lockToggle.locator("svg.layer-lock-icon")).toHaveCount(1);
  await expect(lockToggle.locator("svg.layer-lock-icon")).toHaveClass(/is-unlocked/);

  await lockToggle.click();
  await expect(lockToggle).toHaveAttribute("aria-label", "Unlock");
  await expect(lockToggle).toHaveAttribute("data-locked", "true");
  await expect(lockToggle.locator("svg.layer-lock-icon")).toHaveClass(/is-locked/);

  const visibilityToggle = page.locator('[data-layer-visibility="client"]');
  await expect(visibilityToggle).toHaveCount(1);
  await expect(visibilityToggle).toHaveAttribute("aria-label", "Hide");
  await expect(visibilityToggle.locator("svg.layer-visibility-icon")).toHaveCount(1);
  const visibilityBox = await visibilityToggle.boundingBox();
  expect(visibilityBox?.width).toBe(30);
  expect(visibilityBox?.height).toBe(30);

  await visibilityToggle.click();
  await expect(visibilityToggle).toHaveAttribute("aria-label", "Show");
  await expect(visibilityToggle).toHaveAttribute("data-visible", "false");
  await expect(visibilityToggle.locator("svg.layer-visibility-icon")).toHaveCount(1);
});

test("applies the dark palette to the canvas and grid", async ({ page }) => {
  await page.goto("/");

  const theme = page.getByRole("button", { name: "Theme", exact: true });
  await expect(theme).toHaveCount(1);
  await theme.click();

  const dark = page.getByRole("menuitem", { name: "Dark", exact: true });
  await expect(dark).toHaveCount(1);
  await dark.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const colors = await page.locator('[data-testid="canvas-stage"]').evaluate((stage) => {
    const artboard = stage.querySelector<HTMLElement>(".diagram-svg");
    const firstText = stage.querySelector<SVGTextElement>(".diagram-svg svg text");
    const stageStyle = getComputedStyle(stage);
    const artboardStyle = artboard ? getComputedStyle(artboard) : null;
    return {
      canvas: stageStyle.backgroundColor,
      atmosphere: stageStyle.backgroundImage,
      artboard: artboardStyle?.backgroundColor ?? "",
      grid: artboardStyle?.backgroundImage ?? "",
      text: firstText ? getComputedStyle(firstText).fill : "",
    };
  });

  expect(colors.canvas).not.toBe("rgb(255, 255, 255)");
  expect(colors.atmosphere).toContain("radial-gradient");
  expect(colors.artboard).not.toBe("rgb(255, 255, 255)");
  expect(colors.grid).toContain("linear-gradient");
  expect(colors.text).not.toBe("rgb(35, 47, 62)");
});

test("shows a friendly editable diagram name", async ({ page }) => {
  await page.goto("/");

  const title = page.getByRole("textbox", { name: "Diagram name", exact: true });
  await expect(title).toHaveValue("Async Docs");
  await expect(title).toHaveAttribute("placeholder", "Untitled diagram");
  await expect(page.getByRole("button", { name: "Edit diagram name", exact: true })).toHaveCount(1);

  await title.fill("Orders Platform");
  await title.press("Enter");
  await expect(title).toHaveValue("Orders Platform");
});

test("supports copy, paste, cut, and keyboard deletion for canvas selections", async ({ page }) => {
  await page.goto("/");

  const resources = page.locator('[data-entity-kind="resource"]');
  const beforeCount = await resources.count();
  const nestedResource = page.locator('[data-entity-kind="resource"][data-entity-id="artifacts"]');
  await expect(nestedResource).toHaveCount(1);
  await nestedResource.click();
  await expect(nestedResource).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Control+c");
  await expect(page.getByRole("status")).toContainText("Copied selection");
  await page.keyboard.press("Control+v");
  await expect(page.getByRole("status")).toContainText("Pasted selection");
  await expect(resources).toHaveCount(beforeCount + 1);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);

  await page.keyboard.press("Backspace");
  await expect(page.getByRole("status")).toContainText("Deleted selection");
  await expect(resources).toHaveCount(beforeCount);

  const client = page.locator('[data-entity-kind="resource"][data-entity-id="client"]');
  await expect(client).toHaveCount(1);
  await client.click();
  await expect(client).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+x");
  await expect(page.getByRole("status")).toContainText("Cut selection");
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="client"]')).toHaveCount(0);

  await page.keyboard.press("Control+v");
  await expect(page.getByRole("status")).toContainText("Pasted selection");
  await expect(page.locator('[data-entity-kind="resource"]')).toHaveCount(beforeCount);

  const pasted = page.locator('[data-entity-kind="resource"][aria-selected="true"]');
  await expect(pasted).toHaveCount(1);
  await page.keyboard.press("Delete");
  await expect(page.getByRole("status")).toContainText("Deleted selection");
  await expect(page.locator('[data-entity-kind="resource"]')).toHaveCount(beforeCount - 1);
});

test("offers quick connector ports directly on a selected icon", async ({ page }) => {
  await page.goto("/");

  const edges = page.locator('[data-entity-kind="edge"]');
  const beforeEdgeCount = await edges.count();
  const client = page.locator('[data-entity-kind="resource"][data-entity-id="client"]');
  await client.click();

  const quickControls = page.locator('[data-quick-connect="client"]');
  await expect(quickControls).toHaveCount(1);
  await expect(quickControls.locator(".port-hit-area")).toHaveCount(4);
  await expect(quickControls.locator("[data-port-visual]")).toHaveCount(4);
  await expect(quickControls.locator('[data-port-side="e"]')).toHaveCount(1);

  await quickControls.locator('[data-port-side="e"]').click();
  await expect(page.locator('[data-node-id="api_alb"][data-port-side="w"]')).toHaveCount(1);
  await page.locator('[data-node-id="api_alb"][data-port-side="w"]').click();

  await expect(edges).toHaveCount(beforeEdgeCount + 1);
  await expect(page.locator('[data-entity-kind="edge"][aria-selected="true"]')).toHaveCount(1);
});
