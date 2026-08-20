import { expect, test, type Page } from "@playwright/test";

async function canvasPointForE3(page: Page) {
  const points = await canvasPointsForE3(page);
  return points[0]!;
}

async function canvasPointsForE3(page: Page) {
  return canvasPointsForEdge(page, "e3");
}

async function canvasPointsForEdge(page: Page, edgeId: string) {
  return page.locator(`[data-entity-kind="edge"][data-entity-id="${edgeId}"]`).evaluate((element) => {
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
  return selectEdge(page, "e3");
}

async function selectEdge(page: Page, edgeId: string) {
  const edge = page.locator(`[data-entity-kind="edge"][data-entity-id="${edgeId}"]`);
  await expect(edge).toHaveCount(1);
  const edgePoint = (await canvasPointsForEdge(page, edgeId))[0]!;
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
  const bend = bendHandles.first();
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

test("moves the adjoining leg when a connector bend is dragged past its line", async ({ page }) => {
  await page.goto("/");
  const edge = await selectEdge(page, "e1");
  const bend = page.locator('[data-bend-handle="e1:2"]');
  await expect(bend).toHaveCount(1);
  const beforeBox = await bend.boundingBox();
  expect(beforeBox).not.toBeNull();

  const centerX = beforeBox!.x + beforeBox!.width / 2;
  const centerY = beforeBox!.y + beforeBox!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY + 96, { steps: 10 });
  await page.mouse.up();

  const points = await edge.evaluate((element) =>
    (element.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((value) => {
        const [x, y] = value.split(",").map(Number);
        return { x, y };
      }),
  );
  const hasHairpin = points.slice(1, -1).some((point, index) => {
    const previous = points[index]!;
    const next = points[index + 2]!;
    if (previous.x === point.x && point.x === next.x) {
      return (point.y - previous.y) * (next.y - point.y) < 0;
    }
    if (previous.y === point.y && point.y === next.y) {
      return (point.x - previous.x) * (next.x - point.x) < 0;
    }
    return false;
  });

  expect(hasHairpin, JSON.stringify(points)).toBe(false);
  expect(points.slice(0, -1).every((point, index) => {
    const next = points[index + 1]!;
    return point.x === next.x || point.y === next.y;
  })).toBe(true);
});

test("merges connector controls when a bend collapses onto its neighbor", async ({ page }) => {
  await page.goto("/");
  await selectEdge(page, "e1");
  const bendHandles = page.locator('[data-bend-handle^="e1:"]');
  const beforeCount = await bendHandles.count();
  expect(beforeCount).toBeGreaterThan(1);

  const moving = page.locator('[data-bend-handle="e1:2"]');
  const neighbor = page.locator('[data-bend-handle="e1:1"]');
  const movingBox = await moving.boundingBox();
  const neighborBox = await neighbor.boundingBox();
  expect(movingBox).not.toBeNull();
  expect(neighborBox).not.toBeNull();

  await page.mouse.move(
    movingBox!.x + movingBox!.width / 2,
    movingBox!.y + movingBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    neighborBox!.x + neighborBox!.width / 2,
    neighborBox!.y + neighborBox!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect(bendHandles).toHaveCount(beforeCount - 1);
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
  await expect(title).toHaveCSS("outline-style", "none");
  await title.press("Enter");
  await expect(title).toHaveValue("Orders Platform");
});

test("keeps the canvas zoom controls ordered and padded", async ({ page }) => {
  await page.goto("/");

  const controls = page.getByRole("toolbar", { name: "Canvas view controls", exact: true });
  await expect(controls).toHaveCount(1);
  await expect(controls.getByRole("button")).toHaveText(["", "100%", "−", "+"]);
  await expect(controls.getByRole("button", { name: "Zoom out", exact: true })).toHaveCount(1);
  await expect(controls.getByRole("button", { name: "Zoom in", exact: true })).toHaveCount(1);
  await expect(controls.locator(".status-capsule-mode")).toHaveText("Opinionated layout");
  await expect(controls.locator(".status-capsule-readout")).toHaveText("90%");

  await page.setViewportSize({ width: 2_000, height: 1_100 });
  await page.reload();
  const frame = await page.locator('[data-testid="canvas-stage"]').evaluate((stage) => {
    const artboard = stage.querySelector<HTMLElement>(".diagram-svg svg")!;
    const stageRect = stage.getBoundingClientRect();
    const artboardRect = artboard.getBoundingClientRect();
    return {
      top: artboardRect.top - stageRect.top,
      right: stageRect.right - artboardRect.right,
    };
  });
  expect(frame.top).toBeGreaterThanOrEqual(88);
  expect(frame.right).toBeGreaterThanOrEqual(32);
  expect(frame.right).toBeLessThanOrEqual(48);
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
  const status = page.getByRole("status");
  await expect(status).toContainText("Copied selection");
  await expect(status).toHaveCSS("animation-name", "toast-in-out");
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
  await expect(quickControls.locator(".port-hit-area")).toHaveCount(12);
  await expect(quickControls.locator("[data-port-visual]")).toHaveCount(12);
  await expect(quickControls.locator('[data-port-side="e"]')).toHaveCount(3);
  await expect(quickControls.locator('[data-port-side="e"][data-port-offset="0.5"]')).toHaveCount(1);

  await quickControls.locator('[data-port-side="e"][data-port-offset="0.5"]').click();
  await expect(page.locator('[data-node-id="api_alb"][data-port-side="w"]')).toHaveCount(3);
  await page.locator('[data-node-id="api_alb"][data-port-side="w"][data-port-offset="0.5"]').click();

  await expect(edges).toHaveCount(beforeEdgeCount + 1);
  await expect(page.locator('[data-entity-kind="edge"][aria-selected="true"]')).toHaveCount(1);
});

test("previews the calculated route while dragging between ports", async ({ page }) => {
  await page.goto("/");

  const edges = page.locator('[data-entity-kind="edge"]');
  const beforeEdgeCount = await edges.count();
  await page.locator('[data-entity-kind="resource"][data-entity-id="client"]').click();

  const sourcePort = page.locator('[data-quick-connect="client"] [data-port-side="e"][data-port-offset="0.5"]');
  await expect(sourcePort).toHaveCount(1);
  const sourceBox = await sourcePort.boundingBox();
  expect(sourceBox).not.toBeNull();
  const sourceX = sourceBox!.x + sourceBox!.width / 2;
  const sourceY = sourceBox!.y + sourceBox!.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();

  const targetPort = page.locator('[data-node-id="api_alb"][data-port-side="w"][data-port-offset="0.5"]');
  await expect(targetPort).toHaveCount(1);
  const targetBox = await targetPort.boundingBox();
  expect(targetBox).not.toBeNull();
  const targetX = targetBox!.x + targetBox!.width / 2;
  const targetY = targetBox!.y + targetBox!.height / 2;

  await page.mouse.move((sourceX + targetX) / 2, (sourceY + targetY) / 2, { steps: 6 });
  const preview = page.locator('[data-connector-drag-path]');
  await expect(preview).toHaveCount(1);
  await expect(preview).not.toHaveClass(/is-snapped/);
  const rubberBand = await preview.getAttribute("points");

  await page.mouse.move(targetX, targetY, { steps: 8 });
  await expect(preview).toHaveClass(/is-snapped/);
  await expect.poll(async () => preview.getAttribute("points")).not.toBe(rubberBand);
  await page.mouse.up();

  await expect(edges).toHaveCount(beforeEdgeCount + 1);
  await expect(page.locator('[data-entity-kind="edge"][aria-selected="true"]')).toHaveCount(1);
});

test("keeps rewired endpoints on explicit icon ports", async ({ page }) => {
  await page.goto("/");
  const edge = await selectE3(page);
  const stage = page.locator('[data-testid="canvas-stage"]');
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();

  // The target endpoint is behind the inspector in the default viewport; the
  // source endpoint is the same interaction with a visible drop surface.
  const targetHandle = page.locator('[data-endpoint-handle="e3:source"]');
  await expect(targetHandle).toHaveCount(1);
  const beforePoints = await edge.getAttribute("points");
  const handleBox = await targetHandle.boundingBox();
  expect(handleBox).not.toBeNull();

  // Dropping away from a port is ignored rather than leaving a floating end.
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(stageBox!.x + 24, stageBox!.y + stageBox!.height - 24, { steps: 8 });
  await page.mouse.up();
  await expect(edge).toHaveAttribute("points", beforePoints!);

  const nextHandle = page.locator('[data-endpoint-handle="e3:source"]');
  const nextHandleBox = await nextHandle.boundingBox();
  expect(nextHandleBox).not.toBeNull();
  await page.mouse.move(nextHandleBox!.x + nextHandleBox!.width / 2, nextHandleBox!.y + nextHandleBox!.height / 2);
  await page.mouse.down();

  const port = page.locator('[data-node-id="api_alb"][data-port-side="w"][data-port-offset="0.25"]');
  await expect(port).toHaveCount(1);
  const portPoint = await port.evaluate((element) => {
    const circle = element as SVGCircleElement;
    const svg = circle.ownerSVGElement!;
    const circleBox = circle.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    return {
      x: ((circleBox.left + circleBox.width / 2 - svgBox.left) / svgBox.width) * width,
      y: ((circleBox.top + circleBox.height / 2 - svgBox.top) / svgBox.height) * height,
    };
  });
  const portBox = await port.boundingBox();
  expect(portBox).not.toBeNull();
  await page.mouse.move(portBox!.x + portBox!.width / 2, portBox!.y + portBox!.height / 2, { steps: 8 });
  const preview = page.locator(".rewire-preview.is-snapped");
  await expect(preview).toHaveCount(1);
  await expect(page.locator("[data-rewire-preview-endpoint]")).toHaveCount(1);
  await expect(page.locator('[data-route-editor="e3"]')).toHaveClass(/is-rewiring/);
  const previewPoints = await preview.getAttribute("points");
  await page.mouse.up();

  const afterPoints = await edge.getAttribute("points");
  expect(afterPoints).not.toBe(beforePoints);
  expect(afterPoints).toBe(previewPoints);
  const first = afterPoints!.trim().split(/\s+/)[0]!.split(",").map(Number);
  expect(first[0]).toBeCloseTo(portPoint.x, 4);
  expect(first[1]).toBeCloseTo(portPoint.y, 4);
});

test("infers the top face and previews the routed path when an endpoint is dropped on an icon", async ({ page }) => {
  await page.goto("/");
  const edge = await selectE3(page);
  const sourceHandle = page.locator('[data-endpoint-handle="e3:source"]');
  const handleBox = await sourceHandle.boundingBox();
  expect(handleBox).not.toBeNull();

  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2,
    handleBox!.y + handleBox!.height / 2,
  );
  await page.mouse.down();

  const topPort = page.locator(
    '[data-quick-connect="client"] [data-port-side="n"][data-port-offset="0.5"]',
  );
  const topPortBox = await topPort.boundingBox();
  expect(topPortBox).not.toBeNull();
  const expectedTop = await topPort.evaluate((element) => {
    const circle = element as SVGCircleElement;
    const svg = circle.ownerSVGElement!;
    const circleBox = circle.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    return {
      x: ((circleBox.left + circleBox.width / 2 - svgBox.left) / svgBox.width) * width,
      y: ((circleBox.top + circleBox.height / 2 - svgBox.top) / svgBox.height) * height,
    };
  });
  const targetX = topPortBox!.x + topPortBox!.width / 2;
  // Deliberately miss the small port circle and drop inside the icon's top
  // region. The interaction layer should still infer the north face.
  const targetY = topPortBox!.y + topPortBox!.height / 2 + 20;

  await page.mouse.move(targetX, targetY, { steps: 8 });
  await expect(page.locator(".rewire-preview.is-snapped")).toHaveCount(1);
  const previewPoints = await page.locator(".rewire-preview").getAttribute("points");
  expect(previewPoints?.trim().split(/\s+/).length).toBeGreaterThan(2);
  const previewEndpoint = page.locator("[data-rewire-preview-endpoint]");
  expect(Number(await previewEndpoint.getAttribute("cx"))).toBeCloseTo(expectedTop.x, 4);
  expect(Number(await previewEndpoint.getAttribute("cy"))).toBeCloseTo(expectedTop.y, 4);
  await page.mouse.up();

  const afterPoints = await edge.getAttribute("points");
  expect(afterPoints).toBe(previewPoints);
  const first = afterPoints!.trim().split(/\s+/)[0]!.split(",").map(Number);
  expect(first[0]).toBeCloseTo(expectedTop.x, 4);
  expect(first[1]).toBeCloseTo(expectedTop.y, 4);
});
