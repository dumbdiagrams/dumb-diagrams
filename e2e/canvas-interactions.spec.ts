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

test("keeps rendered arrow numbers readable in light and dark themes", async ({ page }) => {
  await page.goto("/");

  const badgeText = page.locator(".diagram-svg .edge-badge-text").first();
  await expect(badgeText).toHaveCount(1);
  await expect(badgeText).not.toHaveText("");

  for (const theme of ["light", "dark"] as const) {
    await page.evaluate((nextTheme) => {
      document.documentElement.setAttribute("data-theme", nextTheme);
    }, theme);
    const colors = await badgeText.evaluate((text) => {
      const circle = text.parentElement?.querySelector(".edge-badge-circle");
      return {
        text: getComputedStyle(text).fill,
        circle: circle ? getComputedStyle(circle).fill : "",
      };
    });
    expect(colors.text).not.toBe(colors.circle);
  }
});

test("selects the owning connector when its numbered badge is clicked", async ({ page }) => {
  await page.goto("/");

  const edge = page.locator('[data-entity-kind="edge"][data-entity-id="e1"]');
  const badge = page.locator('[data-edge-badge-hit="e1"]');
  await expect(edge).toHaveCount(1);
  await expect(edge).toHaveAttribute("aria-selected", "false");
  await expect(badge).toHaveCount(1);
  await badge.click();

  await expect(edge).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog", { name: "Connector", exact: true })).toHaveCount(1);
});

test("highlights the connector and badge together on badge hover", async ({ page }) => {
  await page.goto("/");

  const badge = page.locator('[data-edge-badge-hit="e1"]');
  await expect(badge).toHaveCount(1);
  await badge.hover();

  await expect(page.locator('[data-hover-kind="edge"][data-hover-id="e1"]')).toHaveCount(1);
  await expect(page.locator('[data-hover-kind="edge-badge"][data-hover-id="e1"]')).toHaveCount(1);
});

test("shows only the resolved connector hover when wide hit strokes overlap", async ({ page }) => {
  await page.goto("/");

  const edge = page.locator('[data-entity-kind="edge"][data-entity-id="e3"]');
  const hover = page.locator(".hover-edge");
  for (const point of await canvasPointsForE3(page)) {
    await edge.dispatchEvent("pointermove", {
      bubbles: true,
      clientX: point.x,
      clientY: point.y,
    });
    await page.waitForTimeout(20);
    if (await hover.count()) break;
  }

  await expect(hover).toHaveCount(1);
  const browserHitHighlights = await page.locator(".hit-edge").evaluateAll((elements) =>
    elements.filter((element) => {
      const stroke = getComputedStyle(element).stroke;
      return stroke !== "none" && stroke !== "rgba(0, 0, 0, 0)" && stroke !== "transparent";
    }).length
  );
  expect(browserHitHighlights).toBe(0);
});

test("highlights the nearest canvas target and edits a movable numbered edge badge", async ({ page }) => {
  await page.goto("/");

  const region = page.locator('[data-entity-kind="group"][data-entity-id="use1"]');
  await expect(region).toHaveCount(1);
  await region.hover({ position: { x: 20, y: 20 } });
  await expect(page.locator('[data-hover-kind="group"][data-hover-id="use1"]')).toHaveCount(1);

  // Use the exposed midpoint of the region's top border. The provider badge
  // occupies the top-left corner, while a deep point can be covered by a
  // nested group hit layer in the SVG stack.
  const regionBox = await region.boundingBox();
  expect(regionBox).not.toBeNull();
  await page.mouse.click(regionBox!.x + regionBox!.width / 2, regionBox!.y + 8);
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
  await expect(numberInput).toHaveAttribute("min", "0");
  await expect(numberInput).toHaveAttribute("max", "99");
  await expect(page.getByText("0–99", { exact: true })).toBeVisible();
  await numberInput.fill("7");
  await numberInput.fill("100");
  await expect(numberInput).toHaveValue("7");
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
  const preview = page.locator('[data-edge-badge-preview]');
  await expect(preview).toHaveCount(1);
  await expect(preview.locator("text")).toHaveText("7");
  await page.mouse.up();

  const after = await badge.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.y).toBeGreaterThan(before!.y + 12);

  await numberInput.focus();
  await numberInput.press("End");
  await numberInput.press("Backspace");
  await expect(numberInput).toHaveValue("");
  await expect(page.getByRole("dialog", { name: "Connector", exact: true })).toHaveCount(1);
  await numberInput.press("Backspace");
  await expect(edge).toHaveCount(1);
  await expect(page.getByRole("dialog", { name: "Connector", exact: true })).toHaveCount(1);
});

test("anchors a group display label at the selected corner", async ({ page }) => {
  await page.goto("/");

  const queues = page.locator('[data-entity-kind="group"][data-entity-id="queues"]');
  await expect(queues).toHaveCount(1);
  const bounds = await queues.boundingBox();
  expect(bounds).not.toBeNull();
  await queues.click({ position: { x: bounds!.width / 2, y: 8 } });

  const inspector = page.getByRole("dialog", { name: "Async Queue Tier", exact: true });
  await expect(inspector).toHaveCount(1);
  const renderedLabel = page.locator("#group-queues text");
  const beforeY = await renderedLabel.getAttribute("y");
  await inspector.locator("#group-label-position").selectOption("bottom-left");

  await expect.poll(() => renderedLabel.getAttribute("y")).not.toBe(beforeY);
  expect(await renderedLabel.getAttribute("text-anchor") ?? "start").toBe("start");
  const labelX = Number(await renderedLabel.getAttribute("x"));
  const groupX = Number(await queues.getAttribute("x"));
  expect(labelX).toBeCloseTo(groupX + 8, 5);
  const labelY = Number(await renderedLabel.getAttribute("y"));
  const groupBottom = Number(await queues.getAttribute("y")) + Number(await queues.getAttribute("height"));
  expect(labelY).toBeGreaterThan(groupBottom - 32);
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
  const movedPoints = (await edge.getAttribute("points"))!
    .trim()
    .split(/\s+/)
    .map((value) => value.split(",").map(Number));
  const expectedPath = movedPoints
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  await expect(page.locator(".diagram-svg #edge-e3 > path").first()).toHaveAttribute(
    "d",
    expectedPath,
  );
  await expect(page.locator(".ghost-route")).toHaveCount(0);
});

test("keeps a single visible route when an automatic edge is pinned", async ({ page }) => {
  await page.goto("/");
  await selectE3(page);

  const connector = page.getByRole("dialog", { name: "Connector", exact: true });
  await expect(connector).toBeVisible();
  await expect(page.locator(".ghost-route")).toHaveCount(0);

  await connector.getByRole("button", { name: "Pin current route" }).click();
  await expect(connector.getByRole("button", { name: "Use automatic route", exact: false })).toBeVisible();
  await expect(page.locator(".ghost-route")).toHaveCount(0);
});

test("keeps the connector inspector open alongside a left drawer", async ({ page }) => {
  await page.goto("/");

  const groups = page.getByRole("dialog", { name: "Boundaries", exact: true });
  await page.getByRole("button", { name: "Boundaries", exact: true }).click();
  await expect(groups).toBeVisible();

  await selectE3(page);

  const connector = page.getByRole("dialog", { name: "Connector", exact: true });
  await expect(groups).toBeVisible();
  await expect(connector).toBeVisible();
  await expect(page.locator(".floating-panel.edge-sheet")).toHaveCount(1);

  const groupsBox = await groups.boundingBox();
  const connectorBox = await connector.boundingBox();
  expect(groupsBox).not.toBeNull();
  expect(connectorBox).not.toBeNull();
  expect(groupsBox!.x + groupsBox!.width).toBeLessThanOrEqual(connectorBox!.x);
});

test("previews resource movement without rerouting the document until release", async ({ page }) => {
  await page.goto("/");
  const hitTarget = page.locator('[data-entity-kind="resource"][data-entity-id="apiA"]');
  const rendered = page.locator("#res-apiA");
  const connectedEdges = page.locator(
    '[data-entity-kind="edge"][data-entity-id="e2"], [data-entity-kind="edge"][data-entity-id="e3"]',
  );
  const targetBox = await hitTarget.boundingBox();
  const beforeBox = await rendered.boundingBox();
  const beforeEdges = await connectedEdges.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("points")),
  );
  expect(targetBox).not.toBeNull();
  expect(beforeBox).not.toBeNull();

  const startX = targetBox!.x + targetBox!.width / 2;
  const startY = targetBox!.y + targetBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 96, startY + 54, { steps: 16 });

  await expect.poll(async () => rendered.getAttribute("transform")).toContain("translate(");
  const previewBox = await rendered.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.x - beforeBox!.x).toBeCloseTo(96, 0);
  expect(previewBox!.y - beforeBox!.y).toBeCloseTo(54, 0);
  expect(await connectedEdges.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("points")),
  )).toEqual(beforeEdges);

  await page.mouse.up();
  await expect.poll(async () => rendered.getAttribute("transform")).toBeNull();
  const afterBox = await rendered.boundingBox();
  expect(afterBox).not.toBeNull();
  expect(afterBox!.x).toBeGreaterThan(beforeBox!.x + 80);
  expect(afterBox!.y).toBeGreaterThan(beforeBox!.y + 40);
});

test("shows a gentle centre guide while aligning icons", async ({ page }) => {
  await page.goto("/");
  const moving = page.locator('[data-entity-kind="resource"][data-entity-id="apiA"]');
  const target = page.locator('[data-entity-kind="resource"][data-entity-id="workerA"]');
  const movingBox = await moving.boundingBox();
  const targetBox = await target.boundingBox();
  expect(movingBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  const startX = movingBox!.x + movingBox!.width / 2;
  const startY = movingBox!.y + movingBox!.height / 2;
  const targetCenterX = targetBox!.x + targetBox!.width / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetCenterX + 3, startY + 82, { steps: 16 });

  await expect(page.locator('[data-alignment-guide="x"][data-alignment-anchor="center"]')).toHaveCount(1);
  await page.mouse.up();

  await expect.poll(async () => (await moving.boundingBox())?.x ?? 0)
    .toBeGreaterThan(movingBox!.x + 50);
  await expect(page.locator("[data-alignment-guide]")).toHaveCount(0);
});

test("keeps a connected resource draggable from beneath its connector endpoint", async ({ page }) => {
  await page.goto("/");
  const resource = page.locator('[data-entity-kind="resource"][data-entity-id="apiA"]');
  const edge = page.locator('[data-entity-kind="edge"][data-entity-id="e2"]');
  await expect(resource).toHaveCount(1);
  await expect(edge).toHaveCount(1);

  const endpoint = await edge.evaluate((element) => {
    const points = (element.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((value) => {
        const [x, y] = value.split(",").map(Number);
        return { x, y };
      });
    const target = points.at(-1)!;
    const matrix = (element as SVGGraphicsElement).getScreenCTM()!;
    return {
      x: matrix.a * target.x + matrix.c * target.y + matrix.e,
      y: matrix.b * target.x + matrix.d * target.y + matrix.f,
    };
  });

  await resource.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    clientX: endpoint.x,
    clientY: endpoint.y,
  });
  await resource.dispatchEvent("pointerup", {
    bubbles: true,
    button: 0,
    clientX: endpoint.x,
    clientY: endpoint.y,
  });

  await expect(resource).toHaveAttribute("aria-selected", "true");
  await expect(edge).toHaveAttribute("aria-selected", "false");
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

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const theme = page.getByRole("button", { name: "Theme", exact: true });
  await expect(theme).toHaveCount(1);
  await expect(page.locator(".studio-tabbar-actions .theme-control")).toHaveCount(1);
  await expect(page.locator(".floating-topbar .theme-control")).toHaveCount(0);
  await theme.click();

  await expect(page.getByRole("menuitem", { name: "System", exact: true })).toHaveCount(0);
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
  expect(colors.atmosphere).toBe("none");
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
  await expect(page.locator(".file-name")).toHaveText("Orders-Platform.dgm");
});

test("keeps the canvas zoom controls ordered and padded", async ({ page }) => {
  await page.goto("/");

  const controls = page.getByRole("toolbar", { name: "Canvas view controls", exact: true });
  await expect(controls).toHaveCount(1);
  await expect(controls.getByRole("button")).toHaveText(["", "100%", "−", "+"]);
  await expect(controls.getByRole("button", { name: "Zoom out", exact: true })).toHaveCount(1);
  await expect(controls.getByRole("button", { name: "Zoom in", exact: true })).toHaveCount(1);
  const initialZoom = Number((await controls.locator(".status-capsule-readout").textContent())?.replace("%", ""));
  expect(initialZoom).toBeGreaterThanOrEqual(80);
  expect(initialZoom).toBeLessThanOrEqual(90);

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

  await expect.poll(async () => edge.getAttribute("points")).toBe(previewPoints);
  const afterPoints = await edge.getAttribute("points");
  expect(afterPoints).not.toBe(beforePoints);
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

  await expect.poll(async () => edge.getAttribute("points")).toBe(previewPoints);
  const afterPoints = await edge.getAttribute("points");
  const first = afterPoints!.trim().split(/\s+/)[0]!.split(",").map(Number);
  expect(first[0]).toBeCloseTo(expectedTop.x, 4);
  expect(first[1]).toBeCloseTo(expectedTop.y, 4);
});
