import { expect, test, type Locator, type Page } from "@playwright/test";

import { ASYNC_DOCS, MOD, entityBox, waitForStudioReady } from "./support/helpers";

async function openAsyncDocs(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(ASYNC_DOCS);
  await waitForStudioReady(page);
  await expect(page.locator('[data-entity-kind="edge"][data-entity-id="e1"]')).toHaveCount(1);
}

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
    const viewBox = svg.viewBox.baseVal;
    const scaleX = rect.width / viewBox.width;
    const scaleY = rect.height / viewBox.height;
    return routePoints.slice(0, -1).map((a, index) => {
      const b = routePoints[index + 1]!;
      return {
        x: rect.left + ((a.x + b.x) / 2 - viewBox.x) * scaleX,
        y: rect.top + ((a.y + b.y) / 2 - viewBox.y) * scaleY,
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

type ScreenBox = { x: number; y: number; width: number; height: number };

function boxCenter(box: ScreenBox): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dispatchPointerClick(
  locator: Locator,
  point: { x: number; y: number },
  modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
) {
  const event = {
    bubbles: true,
    button: 0,
    buttons: 1,
    pointerId: 1,
    clientX: point.x,
    clientY: point.y,
    ...modifiers,
  };
  await locator.dispatchEvent("pointerdown", event);
  await locator.dispatchEvent("pointerup", { ...event, buttons: 0 });
  await locator.dispatchEvent("click", { ...event, buttons: 0 });
}

test("keeps rendered arrow numbers readable in light and dark themes", async ({ page }) => {
  await openAsyncDocs(page);

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
  await openAsyncDocs(page);

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
  await openAsyncDocs(page);

  const badge = page.locator('[data-edge-badge-hit="e1"]');
  await expect(badge).toHaveCount(1);
  await badge.hover();

  await expect(page.locator('[data-hover-kind="edge"][data-hover-id="e1"]')).toHaveCount(1);
  await expect(page.locator('[data-hover-kind="edge-badge"][data-hover-id="e1"]')).toHaveCount(1);
});

test("keeps label dragging attached to the active diagram when another SVG repeats the edge id", async ({ page }) => {
  await openAsyncDocs(page);

  await selectEdge(page, "e3");
  const labelInput = page.locator("#edge-panel-label");
  await labelInput.fill("enqueue work");
  await labelInput.blur();

  const renderedLabel = page.locator('.canvas-artboard .diagram-svg [data-edge-label="e3"]');
  const labelHandle = page.locator('[data-edge-label-handle="e3"]');
  await expect(renderedLabel).toHaveText("enqueue work");
  await expect(labelHandle).toHaveCount(1);
  const beforeX = Number(await renderedLabel.getAttribute("x"));

  await page.evaluate(() => {
    const decoy = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    decoy.setAttribute("data-label-drag-decoy", "true");
    decoy.innerHTML = '<g id="edge-e3"><text class="edge-label" data-edge-label="e3" x="-999" y="-999">decoy</text></g>';
    document.body.prepend(decoy);
  });

  const handleBounds = await labelHandle.boundingBox();
  expect(handleBounds).not.toBeNull();
  const centerX = handleBounds!.x + handleBounds!.width / 2;
  const centerY = handleBounds!.y + handleBounds!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 48, centerY + 20, { steps: 6 });
  await page.mouse.up();

  await expect.poll(async () => Number(await renderedLabel.getAttribute("x"))).not.toBe(beforeX);
  await expect(page.locator('[data-label-drag-decoy] text')).toHaveAttribute("x", "-999");
});

test("shows only the resolved connector hover when wide hit strokes overlap", async ({ page }) => {
  await openAsyncDocs(page);

  const edge = page.locator('[data-entity-kind="edge"][data-entity-id="e3"]');
  const hover = page.locator(".hover-edge");
  for (const point of await canvasPointsForE3(page)) {
    await edge.dispatchEvent("pointermove", {
      bubbles: true,
      clientX: point.x,
      clientY: point.y,
    });
    if (await hover.count()) break;
  }

  await expect.poll(async () => hover.count()).toBe(1);
  const browserHitHighlights = await page.locator(".hit-edge").evaluateAll((elements) =>
    elements.filter((element) => {
      const stroke = getComputedStyle(element).stroke;
      return stroke !== "none" && stroke !== "rgba(0, 0, 0, 0)" && stroke !== "transparent";
    }).length
  );
  expect(browserHitHighlights).toBe(0);
});

test("highlights the nearest canvas target and edits a movable numbered edge badge", async ({ page }) => {
  await openAsyncDocs(page);

  const region = page.locator('[data-entity-kind="group"][data-entity-id="use1"]');
  await expect(region).toHaveCount(1);
  const regionBox = await region.boundingBox();
  expect(regionBox).not.toBeNull();
  // Use the exposed midpoint of the region's top border. The provider badge
  // occupies the top-left corner, while a deep point can be covered by a
  // nested group hit layer in the SVG stack.
  await page.mouse.move(regionBox!.x + regionBox!.width / 2, regionBox!.y + 8);
  await expect(page.locator('[data-hover-kind="group"][data-hover-id="use1"]')).toHaveCount(1);

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
  await expect(page.locator('#edge-e3 .edge-badge-circle')).toHaveAttribute("visibility", "hidden");
  await expect(page.locator('#edge-e3 .edge-badge-text')).toHaveAttribute("visibility", "hidden");
  await page.mouse.up();

  const after = await badge.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.y).toBeGreaterThan(before!.y + 12);
  await expect(preview).toHaveCount(0);
  await expect(page.locator('[data-edge-badge="e3"]')).toHaveCount(1);
  await expect(page.locator('#edge-e3 .edge-badge-circle')).not.toHaveAttribute("visibility", "hidden");

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
  await openAsyncDocs(page);

  const queues = page.locator('[data-entity-kind="group"][data-entity-id="queues"]');
  await expect(queues).toHaveCount(1);
  const bounds = await queues.boundingBox();
  expect(bounds).not.toBeNull();
  await queues.click({ position: { x: bounds!.width / 2, y: 8 } });

  const inspector = page.getByRole("dialog", { name: "Async Queue Tier", exact: true });
  await expect(inspector).toHaveCount(1);
  await expect(inspector.locator("#group-label-position option")).toHaveText([
    "Top left",
    "Top right",
  ]);
  const renderedLabel = page.locator("#group-queues text");
  const beforeX = await renderedLabel.getAttribute("x");
  await inspector.locator("#group-label-position").selectOption("top-right");

  await expect.poll(() => renderedLabel.getAttribute("x")).not.toBe(beforeX);
  expect(await renderedLabel.getAttribute("text-anchor")).toBe("end");
  const labelX = Number(await renderedLabel.getAttribute("x"));
  const groupX = Number(await queues.getAttribute("x"));
  const groupRight = groupX + Number(await queues.getAttribute("width"));
  expect(labelX).toBeCloseTo(groupRight - 8, 5);
});

test("offers only above and below for resource display labels", async ({ page }) => {
  await openAsyncDocs(page);

  await page.locator('[data-entity-kind="resource"][data-entity-id="apiA"]').click();

  await expect(page.locator("#resource-label-position option")).toHaveText([
    "Above icon",
    "Below icon",
  ]);
});

test("uses a custom branded boundary picker", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Boundaries", exact: true }).click();

  const drawer = page.getByRole("dialog", { name: "Boundaries", exact: true });
  await expect(drawer.locator(".provider-tabs .provider-mark")).toHaveCount(5);
  await expect(drawer.locator(".category-picker select")).toHaveCount(0);
  await expect(drawer.locator(".category-picker")).toHaveCount(0);
  await expect(drawer.locator(".palette-card.is-group .provider-mark").first()).toBeVisible();
  await expect(drawer.locator(".palette-card.is-group").first()).toHaveCSS("min-height", "136px");
  await expect(drawer.getByRole("tab", { name: "Cloud", exact: true })).toBeVisible();
});

test("supports category typeahead and aligned resource artwork", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Resources", exact: true }).click();

  const drawer = page.getByRole("dialog", { name: "Resources", exact: true });
  const categoryTrigger = drawer.locator(".category-picker__trigger");
  await categoryTrigger.focus();
  await categoryTrigger.press("c");
  await expect(categoryTrigger).toContainText(/^c/i);
  await expect(drawer).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Connector", exact: true })).toHaveCount(0);

  const cards = drawer.locator(".palette-card:not(.is-group)");
  await expect(cards.first()).toBeVisible();
  const artworkRows = await cards.locator(".palette-thumb").evaluateAll((thumbs) =>
    thumbs.slice(0, 2).map((thumb) => {
      const thumbBox = thumb.getBoundingClientRect();
      const cardBox = thumb.closest(".palette-card")!.getBoundingClientRect();
      return {
        top: Math.round(thumbBox.top),
        centerDelta: Math.round((thumbBox.left + thumbBox.width / 2) - (cardBox.left + cardBox.width / 2)),
      };
    }),
  );
  expect(new Set(artworkRows.map(({ top }) => top)).size).toBe(1);
  expect(artworkRows.every(({ centerDelta }) => Math.abs(centerDelta) <= 1)).toBe(true);
});

test("loads the next catalog page automatically at the bottom", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Resources", exact: true }).click();

  const drawer = page.getByRole("dialog", { name: "Resources", exact: true });
  await drawer.getByRole("tab", { name: "AWS", exact: true }).click();
  const cards = drawer.locator(".palette-card:not(.is-group)");
  await expect(cards).toHaveCount(80);
  await expect(drawer.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);

  await drawer.locator(".asset-browser-body").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    const grid = element.querySelector<HTMLElement>(".asset-grid");
    if (grid) grid.scrollTop = grid.scrollHeight;
  });
  await expect.poll(() => cards.count()).toBeGreaterThan(80);
});

test("keeps all left creation drawers the same width", async ({ page }) => {
  await page.goto("/");
  for (const tool of ["Resources", "Boundaries", "Text", "Layers"] as const) {
    await page.getByRole("button", { name: tool, exact: true }).click();
    const drawer = page.locator(".floating-panel.drawer-sheet:not(.edge-sheet)");
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS("width", "420px");
  }
});

test("opens the board menu anywhere and pastes a clipboard image", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read: async () => [{
          types: ["image/png"],
          getType: async () => new Promise<Blob>((resolve, reject) => {
            const canvas = document.createElement("canvas");
            canvas.width = 2;
            canvas.height = 2;
            canvas.getContext("2d")!.fillRect(0, 0, 2, 2);
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png");
          }),
        }],
        readText: async () => "",
        writeText: async () => undefined,
      },
    });
  });
  await page.goto("/");

  const stage = page.getByTestId("canvas-stage");
  await stage.click({
    button: "right",
    position: { x: 80, y: 220 },
    force: true,
  });
  const menu = page.getByRole("menu", { name: "Canvas context menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Paste image or selection" }).click();

  await expect(page.getByRole("status")).toHaveText("Pasted image");
  await expect(page.locator('.diagram-svg g[id^="res-custom"] use[href^="#asset-"]')).toHaveCount(1);
});

test("exposes draggable turn points and moves a connector bend", async ({ page }) => {
  await openAsyncDocs(page);
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
  await openAsyncDocs(page);
  await selectE3(page);

  const connector = page.getByRole("dialog", { name: "Connector", exact: true });
  await expect(connector).toBeVisible();
  await expect(page.locator(".ghost-route")).toHaveCount(0);

  await connector.getByRole("button", { name: "Pin current route" }).click();
  await expect(connector.getByRole("button", { name: "Use automatic route", exact: false })).toBeVisible();
  await expect(page.locator(".ghost-route")).toHaveCount(0);
});

test("keeps the connector inspector open alongside a left drawer", async ({ page }) => {
  await openAsyncDocs(page);

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

test("moves a resource with live preview and undo", async ({ page }) => {
  await openAsyncDocs(page);
  const hitTarget = page.locator('[data-entity-kind="resource"][data-entity-id="client"]');
  const rendered = page.locator("#res-client");
  const connectedEdges = page.locator('[data-entity-kind="edge"][data-entity-id="e1"]');
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await expect(undo).toBeDisabled();

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
  await page.mouse.move(startX - 96, startY + 54, { steps: 16 });

  await expect.poll(async () => rendered.getAttribute("transform")).toContain("translate(");
  const previewBox = await rendered.boundingBox();
  expect(previewBox).not.toBeNull();
  expect(Math.abs(previewBox!.x - beforeBox!.x + 96)).toBeLessThan(2);
  expect(Math.abs(previewBox!.y - beforeBox!.y - 54)).toBeLessThan(6);
  expect(await connectedEdges.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("points")),
  )).toEqual(beforeEdges);

  await page.mouse.up();
  await expect.poll(async () => rendered.getAttribute("transform")).toBeNull();
  const afterBox = await rendered.boundingBox();
  expect(afterBox).not.toBeNull();
  expect(afterBox!.x).toBeLessThan(beforeBox!.x - 80);
  expect(afterBox!.y).toBeGreaterThan(beforeBox!.y + 40);
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect.poll(async () => {
    const box = await rendered.boundingBox();
    return box ? { x: Math.round(box.x), y: Math.round(box.y) } : null;
  }).toEqual({ x: Math.round(beforeBox!.x), y: Math.round(beforeBox!.y) });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
});

test("moves a group when dragging from its empty center", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "group-center.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(`diagram group-center {
  grammar aws
  flow lr

  aws.cloud cloud "Cloud" {
    cloud-agnostic.boundary group "Group" { aws.simple-storage-service bucket "Bucket" }
  }
}

view default {
  place cloud { x 40 y 40 w 640 h 400 pin manual }
  place group { x 120 y 100 w 440 h 300 pin manual }
  place bucket { x 180 y 170 pin manual }
}`),
  });

  const group = page.locator('[data-entity-kind="group"][data-entity-id="group"]');
  const rendered = page.locator("#group-group");
  const before = await rendered.boundingBox();
  expect(before).not.toBeNull();

  const center = await group.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const point = {
      x: box.left + box.width * 0.75,
      y: box.top + box.height * 0.75,
    };
    const target = document.elementFromPoint(point.x, point.y);
    return target?.getAttribute("data-entity-kind") === "group" &&
      target.getAttribute("data-entity-id") === "group"
      ? point
      : null;
  });
  expect(center).not.toBeNull();

  await page.mouse.move(center!.x, center!.y);
  await page.mouse.down();
  await page.mouse.move(center!.x + 32, center!.y + 24, { steps: 16 });

  await expect.poll(async () => rendered.getAttribute("transform")).toContain("translate(");
  const preview = await rendered.boundingBox();
  expect(preview).not.toBeNull();
  expect(preview!.x).toBeGreaterThan(before!.x + 20);
  expect(preview!.y).toBeGreaterThan(before!.y + 12);

  await page.mouse.up();
  await expect.poll(async () => rendered.getAttribute("transform")).toBeNull();
  const after = await rendered.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x).toBeGreaterThan(before!.x + 20);
  expect(after!.y).toBeGreaterThan(before!.y + 12);
});

test("shows a gentle centre guide while aligning icons", async ({ page }) => {
  await openAsyncDocs(page);
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
  await openAsyncDocs(page);
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
  await openAsyncDocs(page);
  const edge = await selectEdge(page, "e2");
  const bend = page.locator('[data-bend-handle="e2:2"]');
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
  await openAsyncDocs(page);
  await selectEdge(page, "e2");
  const bendHandles = page.locator('[data-bend-handle^="e2:"]');
  const beforeCount = await bendHandles.count();
  expect(beforeCount).toBeGreaterThan(1);

  const moving = page.locator('[data-bend-handle="e2:1"]');
  const neighbor = page.locator('[data-bend-handle="e2:2"]');
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
  await openAsyncDocs(page);
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
  await openAsyncDocs(page);
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
  await openAsyncDocs(page);
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

test("keeps Layers open for selection and exposes grouping controls", async ({ page }) => {
  await openAsyncDocs(page);

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const layersPanel = page.getByRole("dialog", { name: "Layers", exact: true });
  await expect(layersPanel).toBeVisible();

  const api = layersPanel.locator(".layer-select").filter({ hasText: "Document API" }).nth(1);
  const worker = layersPanel.locator(".layer-select").filter({ hasText: "Document worker" }).first();
  await api.click();
  await expect(layersPanel).toBeVisible();
  await worker.click({ modifiers: ["Shift"] });

  const groupButton = layersPanel.getByRole("button", { name: "Group", exact: true });
  const ungroupButton = layersPanel.getByRole("button", { name: "Ungroup", exact: true });
  await expect(groupButton).toBeEnabled();
  await expect(ungroupButton).toBeDisabled();
  await groupButton.click();
  await expect(layersPanel).toBeVisible();
  await expect(ungroupButton).toBeEnabled();

  await ungroupButton.click();
  await expect(layersPanel).toBeVisible();
  await expect(ungroupButton).toBeDisabled();
  await expect(groupButton).toBeEnabled();
});

test("hides the legacy Connector dock button while retaining direct quick-connect", async ({ page }) => {
  await openAsyncDocs(page);

  await expect(page.getByRole("button", { name: "Connector", exact: true })).toHaveCount(0);
  await page.locator('[data-entity-kind="resource"][data-entity-id="client"]').click();
  await expect(page.locator('[data-quick-connect="client"]')).toHaveCount(1);
});

test("supports selection modifiers, regrouping, and undo round-trip", async ({ page }) => {
  await openAsyncDocs(page);

  const queues = page.locator('[data-entity-kind="group"][data-entity-id="queues"]');
  const jobs = page.locator('[data-entity-kind="resource"][data-entity-id="jobs"]');
  const dlq = page.locator('[data-entity-kind="resource"][data-entity-id="jobs_dlq"]');
  const queuesBefore = await entityBox(page, "group", "queues");
  const jobsBefore = await entityBox(page, "resource", "jobs");
  const dlqBefore = await entityBox(page, "resource", "jobs_dlq");

  // Delete group removes only the boundary. Child geometry is expected to
  // remain stable as the hierarchy is flattened.
  await queues.click({
    button: "right",
    position: { x: 4, y: queuesBefore.height / 2 },
    force: true,
  });
  const menu = page.getByRole("menu", { name: "Canvas context menu" });
  await expect(menu).toBeVisible();
  await menu.locator('[data-menu-item="delete-group"]').click();
  await expect(queues).toHaveCount(0);
  await expect(jobs).toHaveCount(1);
  await expect(dlq).toHaveCount(1);
  const jobsAfterUngroup = await entityBox(page, "resource", "jobs");
  const dlqAfterUngroup = await entityBox(page, "resource", "jobs_dlq");
  expect(Math.abs(jobsAfterUngroup.x - jobsBefore.x)).toBeLessThan(4);
  expect(Math.abs(jobsAfterUngroup.y - jobsBefore.y)).toBeLessThan(4);
  expect(Math.abs(dlqAfterUngroup.x - dlqBefore.x)).toBeLessThan(4);
  expect(Math.abs(dlqAfterUngroup.y - dlqBefore.y)).toBeLessThan(4);

  // Plain click replaces; Shift adds; Cmd/Ctrl toggles.
  await dispatchPointerClick(jobs, boxCenter(jobsAfterUngroup));
  await expect(jobs).toHaveAttribute("aria-selected", "true");
  await expect(dlq).toHaveAttribute("aria-selected", "false");
  await dispatchPointerClick(dlq, boxCenter(dlqAfterUngroup), { shiftKey: true });
  await expect(jobs).toHaveAttribute("aria-selected", "true");
  await expect(dlq).toHaveAttribute("aria-selected", "true");
  await dispatchPointerClick(jobs, boxCenter(jobsAfterUngroup), { ctrlKey: true });
  await expect(jobs).toHaveAttribute("aria-selected", "false");
  await expect(dlq).toHaveAttribute("aria-selected", "true");
  await dispatchPointerClick(dlq, boxCenter(dlqAfterUngroup), { ctrlKey: true });
  await expect(page.locator('[data-entity-kind="resource"][aria-selected="true"]')).toHaveCount(0);

  // Rebuild a valid multi-selection after exercising toggle removal.
  await dispatchPointerClick(jobs, boxCenter(jobsAfterUngroup));
  await dispatchPointerClick(dlq, boxCenter(dlqAfterUngroup), { shiftKey: true });
  await expect(jobs).toHaveAttribute("aria-selected", "true");
  await expect(dlq).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-entity-kind="group"][aria-selected="true"]')).toHaveCount(0);

  await page.keyboard.press(`${MOD}+G`);
  const regrouped = page.locator('[data-entity-kind="group"][aria-selected="true"]');
  await expect(regrouped).toHaveCount(1);
  const regroupedId = await regrouped.getAttribute("data-entity-id");
  expect(regroupedId).toBeTruthy();
  await expect(jobs).toHaveCount(1);
  await expect(dlq).toHaveCount(1);

  // Undo/redo restores the same hierarchy without losing the child resources.
  // DSL serialization is covered deterministically in the runtime parse tests;
  // CodeMirror virtualizes off-screen source lines in this large fixture.
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator(`[data-entity-kind="group"][data-entity-id="${regroupedId}"]`)).toHaveCount(0);
  await expect(jobs).toHaveCount(1);
  await expect(dlq).toHaveCount(1);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(page.locator(`[data-entity-kind="group"][data-entity-id="${regroupedId}"]`)).toHaveCount(1);
});

test("adopts enclosed siblings into an existing selected boundary", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "enclosing-group.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(`diagram enclosing-group {
  grammar aws
  flow lr

  aws.cloud cloud "AWS Cloud" { }
  cloud-agnostic.boundary uploads "Uploads" { aws.simple-storage-service bucket "Upload bucket" }
  cloud-agnostic.boundary processing "Processing" { aws.aws-lambda worker "Worker" }
}

view default {
  place cloud { x 40 y 40 w 760 h 440 pin manual }
  place uploads { x 120 y 140 w 240 h 180 pin manual }
  place bucket { x 200 y 220 pin manual }
  place processing { x 440 y 140 w 240 h 180 pin manual }
  place worker { x 520 y 220 pin manual }
}`),
  });

  const cloud = page.locator('[data-entity-kind="group"][data-entity-id="cloud"]');
  const uploads = page.locator('[data-entity-kind="group"][data-entity-id="uploads"]');
  const processing = page.locator('[data-entity-kind="group"][data-entity-id="processing"]');
  const cloudBox = await entityBox(page, "group", "cloud");
  const uploadsBox = await entityBox(page, "group", "uploads");
  const processingBox = await entityBox(page, "group", "processing");

  await dispatchPointerClick(cloud, { x: cloudBox.x + cloudBox.width / 2, y: cloudBox.y + 8 });
  await dispatchPointerClick(uploads, { x: uploadsBox.x + uploadsBox.width / 2, y: uploadsBox.y + 8 }, { shiftKey: true });
  await dispatchPointerClick(processing, { x: processingBox.x + processingBox.width / 2, y: processingBox.y + 8 }, { shiftKey: true });
  await page.keyboard.press(`${MOD}+G`);

  await expect(page.locator('[data-entity-kind="group"]')).toHaveCount(3);
  await expect(page.locator('[data-entity-kind="group"][aria-label="Group Group"]')).toHaveCount(0);
  await expect(cloud).toHaveAttribute("aria-selected", "true");
  await expect(uploads).toHaveCount(1);
  await expect(processing).toHaveCount(1);
});

test("selects children inside a group with an empty-canvas marquee", async ({ page }) => {
  await openAsyncDocs(page);

  const group = page.locator('[data-entity-kind="group"][data-entity-id="appA"]');
  const api = page.locator('[data-entity-kind="resource"][data-entity-id="apiA"]');
  const worker = page.locator('[data-entity-kind="resource"][data-entity-id="workerA"]');
  const groupBox = await entityBox(page, "group", "appA");
  const apiBox = await entityBox(page, "resource", "apiA");
  const workerBox = await entityBox(page, "resource", "workerA");
  const artboardBox = await page.locator(".canvas-artboard").boundingBox();
  expect(artboardBox).not.toBeNull();

  // Start on genuinely empty canvas outside the artboard, then finish just
  // beyond the children. The rectangle intersects the children without
  // containing the group's full boundary, so the parent stays out.
  const start = {
    x: artboardBox!.x - 24,
    y: Math.max(groupBox.y + 32, Math.min(apiBox.y, workerBox.y) - 10),
  };
  const finish = {
    x: Math.max(apiBox.x + apiBox.width, workerBox.x + workerBox.width) + 10,
    y: Math.max(apiBox.y + apiBox.height, workerBox.y + workerBox.height) + 10,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 8 });
  await expect(page.locator(".marquee")).toBeVisible();
  await expect(page.locator('[data-drag-overlay-kind="resource"][data-drag-overlay-id="apiA"] .selection-outline')).toBeVisible();
  await expect(page.locator('[data-drag-overlay-kind="resource"][data-drag-overlay-id="workerA"] .selection-outline')).toBeVisible();
  await expect(page.locator('[data-drag-overlay-kind="group"][data-drag-overlay-id="appA"] .selection-outline')).toHaveCount(0);
  await page.mouse.up();

  await expect(api).toHaveAttribute("aria-selected", "true");
  await expect(worker).toHaveAttribute("aria-selected", "true");
  await expect(group).toHaveAttribute("aria-selected", "false");
});

test("starts a marquee outside the artboard and selects across the full canvas", async ({ page }) => {
  await openAsyncDocs(page);

  const stageBox = await page.getByTestId("canvas-stage").boundingBox();
  const artboardBox = await page.locator(".canvas-artboard").boundingBox();
  expect(stageBox).not.toBeNull();
  expect(artboardBox).not.toBeNull();
  const start = {
    x: Math.max(stageBox!.x + 8, artboardBox!.x - 48),
    y: artboardBox!.y + 64,
  };
  const end = {
    x: Math.min(stageBox!.x + stageBox!.width - 8, artboardBox!.x + artboardBox!.width + 32),
    y: Math.min(stageBox!.y + stageBox!.height - 8, artboardBox!.y + artboardBox!.height + 32),
  };
  expect(start.x).toBeLessThan(artboardBox!.x);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(page.locator(".marquee")).toBeVisible();
  await expect(page.locator('[data-drag-overlay-kind="resource"][data-drag-overlay-id="client"] .selection-outline')).toBeVisible();
  await expect(page.locator('[data-drag-overlay-kind="group"] .selection-outline').first()).toBeVisible();
  await page.mouse.up();

  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="client"]').first()).toHaveAttribute("aria-selected", "true");
});

test("exposes safe and destructive group actions in the context menu", async ({ page }) => {
  await openAsyncDocs(page);

  const queues = page.locator('[data-entity-kind="group"][data-entity-id="queues"]');
  const jobs = page.locator('[data-entity-kind="resource"][data-entity-id="jobs"]');
  const dlq = page.locator('[data-entity-kind="resource"][data-entity-id="jobs_dlq"]');
  const jobsBefore = await entityBox(page, "resource", "jobs");
  const dlqBefore = await entityBox(page, "resource", "jobs_dlq");
  const queuesBox = await entityBox(page, "group", "queues");

  await queues.click({
    button: "right",
    position: { x: 4, y: queuesBox.height / 2 },
    force: true,
  });
  const menu = page.getByRole("menu", { name: "Canvas context menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /^Ungroup/ })).toBeVisible();
  await expect(menu.locator('[data-menu-item="delete-group"]')).toBeVisible();
  await expect(menu.locator('[data-menu-item="delete-group-and-contents"]')).toBeVisible();
  await menu.locator('[data-menu-item="delete-group"]').click();

  await expect(queues).toHaveCount(0);
  await expect(jobs).toHaveCount(1);
  await expect(dlq).toHaveCount(1);
  const jobsAfter = await entityBox(page, "resource", "jobs");
  const dlqAfter = await entityBox(page, "resource", "jobs_dlq");
  expect(Math.abs(jobsAfter.x - jobsBefore.x)).toBeLessThan(4);
  expect(Math.abs(jobsAfter.y - jobsBefore.y)).toBeLessThan(4);
  expect(Math.abs(dlqAfter.x - dlqBefore.x)).toBeLessThan(4);
  expect(Math.abs(dlqAfter.y - dlqBefore.y)).toBeLessThan(4);

  const storage = page.locator('[data-entity-kind="group"][data-entity-id="storage"]');
  const artifacts = page.locator('[data-entity-kind="resource"][data-entity-id="artifacts"]');
  const storageBox = await entityBox(page, "group", "storage");
  await storage.click({
    button: "right",
    position: { x: 4, y: storageBox.height / 2 },
    force: true,
  });
  await page.getByRole("menu", { name: "Canvas context menu" })
    .locator('[data-menu-item="delete-group-and-contents"]')
    .dispatchEvent("click", { bubbles: true });
  await expect(storage).toHaveCount(0);
  await expect(artifacts).toHaveCount(0);
});

test("applies the dark palette to the canvas and grid", async ({ page }) => {
  await openAsyncDocs(page);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const theme = page.getByRole("button", { name: "Theme", exact: true });
  await expect(theme).toHaveCount(1);
  await expect(page.locator(".studio-tabbar-actions .theme-control")).toHaveCount(1);
  await expect(page.locator(".floating-topbar .theme-control")).toHaveCount(0);
  await theme.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const colors = await page.locator('[data-testid="canvas-stage"]').evaluate((stage) => {
    const artboard = stage.querySelector<HTMLElement>(".diagram-svg");
    const firstText = stage.querySelector<SVGTextElement>(".diagram-svg svg text:not(.edge-badge-text):not(.group-badge-text)");
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
  expect(colors.artboard).toBe("rgb(16, 32, 51)");
  expect(colors.artboard).not.toBe("rgb(255, 255, 255)");
  expect(colors.grid).toContain("linear-gradient");
  expect(colors.text).toBe("rgb(230, 235, 240)");
});

test("shows a friendly editable diagram name", async ({ page }) => {
  await openAsyncDocs(page);

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
  expect(initialZoom).toBeGreaterThanOrEqual(50);
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
  await openAsyncDocs(page);

  const resources = page.locator('[data-entity-kind="resource"]');
  const beforeCount = await resources.count();
  const client = page.locator('[data-entity-kind="resource"][data-entity-id="client"]');
  await expect(client).toHaveCount(1);
  await client.click();
  await expect(client).toHaveAttribute("aria-selected", "true");

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

test("creates a connector via quick-connect ports with a live route preview", async ({ page }) => {
  await openAsyncDocs(page);

  const edges = page.locator('[data-entity-kind="edge"]');
  const beforeEdgeCount = await edges.count();
  await page.locator('[data-entity-kind="resource"][data-entity-id="client"]').click();

  const quickControls = page.locator('[data-quick-connect="client"]');
  await expect(quickControls).toHaveCount(1);
  await expect(quickControls.locator(".port-hit-area")).toHaveCount(12);
  await expect(quickControls.locator("[data-port-visual]")).toHaveCount(12);
  await expect(quickControls.locator('[data-port-side="e"]')).toHaveCount(3);

  const sourcePort = quickControls.locator('[data-port-side="e"][data-port-offset="0.5"]');
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
  await openAsyncDocs(page);
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
    const viewBox = svg.viewBox.baseVal;
    return {
      x: viewBox.x + ((circleBox.left + circleBox.width / 2 - svgBox.left) / svgBox.width) * viewBox.width,
      y: viewBox.y + ((circleBox.top + circleBox.height / 2 - svgBox.top) / svgBox.height) * viewBox.height,
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
  await openAsyncDocs(page);
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
    const viewBox = svg.viewBox.baseVal;
    return {
      x: viewBox.x + ((circleBox.left + circleBox.width / 2 - svgBox.left) / svgBox.width) * viewBox.width,
      y: viewBox.y + ((circleBox.top + circleBox.height / 2 - svgBox.top) / svgBox.height) * viewBox.height,
    };
  });
  const targetX = topPortBox!.x + topPortBox!.width / 2;
  // Deliberately miss the small port circle and drop inside the icon's top
  // region. The interaction layer should still infer the north face.
  const targetY = topPortBox!.y + topPortBox!.height / 2 + 8;

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

test("preserves marquee multi-selection on right-click and groups siblings", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "marquee-group.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(`diagram marquee-group {
  grammar cloud-agnostic
  cloud-agnostic.database left "Left"
  cloud-agnostic.database right "Right"
}
`),
  });

  const left = page.locator('[data-entity-kind="resource"][data-entity-id="left"]');
  const right = page.locator('[data-entity-kind="resource"][data-entity-id="right"]');
  const leftBox = await entityBox(page, "resource", "left");
  const rightBox = await entityBox(page, "resource", "right");
  const stageBox = await page.getByTestId("canvas-stage").boundingBox();
  expect(stageBox).not.toBeNull();

  const start = {
    x: Math.min(leftBox.x, rightBox.x) - 24,
    y: Math.min(leftBox.y, rightBox.y) - 24,
  };
  const finish = {
    x: Math.max(leftBox.x + leftBox.width, rightBox.x + rightBox.width) + 24,
    y: Math.max(leftBox.y + leftBox.height, rightBox.y + rightBox.height) + 24,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(finish.x, finish.y, { steps: 8 });
  await page.mouse.up();

  await expect(left).toHaveAttribute("aria-selected", "true");
  await expect(right).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-entity-kind="resource"][aria-selected="true"]')).toHaveCount(2);

  const leftCenter = boxCenter(leftBox);
  await left.click({
    button: "right",
    position: { x: leftCenter.x - leftBox.x, y: leftCenter.y - leftBox.y },
    force: true,
  });
  const menu = page.getByRole("menu", { name: "Canvas context menu" });
  await expect(menu).toBeVisible();
  await expect(left).toHaveAttribute("aria-selected", "true");
  await expect(right).toHaveAttribute("aria-selected", "true");
  await expect(menu.locator('[data-menu-item="group"]')).toBeVisible();
  await menu.locator('[data-menu-item="group"]').click();

  await expect(page.locator('[data-entity-kind="group"][aria-selected="true"]')).toHaveCount(1);
  await expect(left).toHaveAttribute("aria-selected", "false");
  await expect(right).toHaveAttribute("aria-selected", "false");
});

test("preserves select-all selection on right-click and groups projected roots", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "mixed-select.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(`diagram mixed-select {
  grammar cloud-agnostic
  cloud-agnostic.database alpha "Alpha"
  cloud-agnostic.database beta "Beta"
  alpha -> beta { id link }
}
`),
  });

  const alpha = page.locator('[data-entity-kind="resource"][data-entity-id="alpha"]');
  const beta = page.locator('[data-entity-kind="resource"][data-entity-id="beta"]');
  const edge = page.locator('[data-entity-kind="edge"][data-entity-id="link"]');
  await expect(alpha).toHaveCount(1);
  await expect(beta).toHaveCount(1);
  await expect(edge).toHaveCount(1);

  const selectAll = process.platform === "darwin" ? "Meta+A" : "Control+A";
  await page.keyboard.press(selectAll);
  await expect(alpha).toHaveAttribute("aria-selected", "true");
  await expect(beta).toHaveAttribute("aria-selected", "true");
  await expect(edge).toHaveAttribute("aria-selected", "true");

  const alphaBox = await entityBox(page, "resource", "alpha");
  await alpha.click({
    button: "right",
    position: { x: 12, y: alphaBox.height / 2 },
    force: true,
  });
  const menu = page.getByRole("menu", { name: "Canvas context menu" });
  await expect(menu).toBeVisible();
  await expect(alpha).toHaveAttribute("aria-selected", "true");
  await expect(beta).toHaveAttribute("aria-selected", "true");
  await expect(edge).toHaveAttribute("aria-selected", "true");
  await expect(menu.locator('[data-menu-item="group"]')).toBeVisible();
  await menu.locator('[data-menu-item="group"]').click();

  await expect(page.locator('[data-entity-kind="group"][aria-selected="true"]')).toHaveCount(1);
  await expect(alpha).toHaveAttribute("aria-selected", "false");
  await expect(beta).toHaveAttribute("aria-selected", "false");
});

test("replaces selection on right-click of an unselected entity and clears on empty canvas click", async ({ page }) => {
  await openAsyncDocs(page);

  const jobs = page.locator('[data-entity-kind="resource"][data-entity-id="jobs"]');
  const dlq = page.locator('[data-entity-kind="resource"][data-entity-id="jobs_dlq"]');
  const jobsBox = await entityBox(page, "resource", "jobs");
  const dlqBox = await entityBox(page, "resource", "jobs_dlq");
  await dispatchPointerClick(jobs, boxCenter(jobsBox));
  await dispatchPointerClick(dlq, boxCenter(dlqBox), { shiftKey: true });
  await expect(jobs).toHaveAttribute("aria-selected", "true");
  await expect(dlq).toHaveAttribute("aria-selected", "true");

  const client = page.locator('[data-entity-kind="resource"][data-entity-id="client"]');
  const clientBox = await entityBox(page, "resource", "client");
  await client.click({ button: "right", position: { x: 12, y: clientBox.height / 2 }, force: true });
  await expect(page.getByRole("menu", { name: "Canvas context menu" })).toBeVisible();
  await expect(client).toHaveAttribute("aria-selected", "true");
  await expect(jobs).toHaveAttribute("aria-selected", "false");
  await expect(dlq).toHaveAttribute("aria-selected", "false");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Canvas context menu" })).toHaveCount(0);

  const artboardBox = await page.locator(".canvas-artboard").boundingBox();
  expect(artboardBox).not.toBeNull();
  await page.mouse.click(artboardBox!.x - 32, artboardBox!.y - 32);
  await expect(page.locator('[data-entity-kind="resource"][aria-selected="true"]')).toHaveCount(0);
});
