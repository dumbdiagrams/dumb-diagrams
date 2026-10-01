import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { parseDgm, printDgm } from "../packages/runtime/dist/dsl/index.js";
import { validateDocument } from "../packages/runtime/dist/core/index.js";
import { getCatalogMap } from "../packages/runtime/dist/catalog/index.js";
import { ROOT, MOD, SIMPLE_SERVERLESS, entityBox, waitForStudioReady } from "./support/helpers";

test("opens File actions and creates a fresh document tab", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".workspace-tab.is-active")).toContainText("Untitled Diagram");
  await expect(page.locator(".workspace-tab.is-active")).not.toContainText("Async Docs");

  const wordmark = page.locator(".studio-brand .dd-wordmark");
  await expect(wordmark).toHaveText("dumbdiagrams.");
  await expect(wordmark).toHaveCSS("font-family", /Manrope/);
  await expect(wordmark).toHaveCSS("font-weight", "800");
  await expect(wordmark.locator(".dd-wordmark__light")).toHaveCSS("font-weight", "450");

  const privacyFooter = page.locator(".privacy-footer");
  await expect(privacyFooter).toContainText("© 2026 DumbDiagrams");
  await expect(privacyFooter).toContainText("Your data stays on your device");

  await expect(page.locator(".studio-tabbar > *")).toHaveClass([
    /studio-tabbar-leading/,
    /workspace-tabs/,
    /studio-tabbar-actions/,
  ]);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "New diagram", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Duplicate tab", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Close tab", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Reopen closed tab", exact: true })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "New diagram", exact: true }).click();

  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-active")).toContainText(/Untitled diagram/i);
});

test("protects the final untouched blank untitled draft", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.locator(".workspace-tab-close")).toHaveCount(0);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Untitled Diagram");
  await expect(page.locator(".workspace-tab.is-active")).not.toContainText("Async Docs");
  await expect(page.locator(".workspace-tab-close")).toHaveCount(0);

  await page.locator(".workspace-tab").click({ button: "right" });
  const tabMenu = page.getByRole("menu", { name: "Tab context menu" });
  await expect(tabMenu).toBeVisible();
  await expect(tabMenu.getByRole("menuitem", { name: /Close/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+KeyW");
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Untitled Diagram");
  await expect(page.locator(".workspace-tab-close")).toHaveCount(0);
});

test("duplicates and closes a diagram from its tab context menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const tabs = page.locator(".workspace-tab");
  await expect(tabs).toHaveCount(2);

  await tabs.nth(0).click({ button: "right" });
  const tabMenu = page.getByRole("menu", { name: "Tab context menu" });
  await expect(tabMenu).toBeVisible();
  await expect(tabMenu.getByRole("menuitem", { name: "Duplicate tab", exact: true })).toHaveCount(1);
  await expect(tabMenu.getByRole("menuitem", { name: /Close tab/ })).toHaveCount(1);
  await tabMenu.getByRole("menuitem", { name: "Duplicate tab", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(3);

  const activeTab = page.locator(".workspace-tab.is-active");
  await expect(activeTab).toHaveCount(1);
  await activeTab.click({ button: "right" });
  await page.getByRole("menu", { name: "Tab context menu" }).getByRole("menuitem", { name: /Close tab/ }).click();
  await expect(page.locator(".workspace-tab.is-closing")).toHaveCount(1);
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("bulk closes tabs with visible progress without recovering empty drafts", async ({ page }) => {
  await page.goto("/");
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: "New diagram", exact: true }).click();
  }
  await expect(page.getByRole("tab")).toHaveCount(5);

  await page.locator(".workspace-tab").first().click({ button: "right" });
  await page.getByRole("menu", { name: "Tab context menu" })
    .getByRole("menuitem", { name: "Close all to the right", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", { name: "Close tabs to the right?" });
  await expect(confirmation).toContainText("4 tabs will be closed");
  const sawProgress = page.waitForFunction(() => {
    const status = document.querySelector(".operation-status");
    const progress = status?.querySelector("progress");
    return progress?.getAttribute("max") === "4"
      && (status?.textContent ?? "").includes("Closing diagrams");
  });
  await confirmation.getByRole("button", { name: "Close tabs", exact: true }).click();
  await sawProgress;
  await expect(page.getByRole("tab")).toHaveCount(1);

  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Recycle bin", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Recycle bin" })).toContainText("Recycle bin is empty");
});

test("close all replaces every diagram with one blank untitled tab", async ({ page }) => {
  await page.goto("/");
  const title = page.getByRole("textbox", { name: "Diagram name" });
  await title.fill("Changed Async Docs");
  await title.press("Enter");
  await expect(page.locator(".dirty-pill")).toHaveText("Unsaved");
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "New diagram", exact: true }).click();
  }
  await expect(page.getByRole("tab")).toHaveCount(4);

  await page.locator(".workspace-tab").first().click({ button: "right" });
  await page.getByRole("menu", { name: "Tab context menu" })
    .getByRole("menuitem", { name: "Close all", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", { name: "Close all tabs?" });
  await expect(confirmation).toContainText("4 tabs will be closed");
  await expect(confirmation).toContainText("1 unsaved diagram will be discarded");
  await confirmation.getByRole("button", { name: "Discard and close", exact: true }).click();

  const onlyTab = page.getByRole("tab");
  await expect(onlyTab).toHaveCount(1);
  await expect(onlyTab).toContainText("Untitled Diagram");
  await expect(onlyTab).not.toContainText("Async Docs");
});

test("frames a new diagram artboard with visible canvas surrounding it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();

  const card = page.locator(".diagram-svg svg");
  await expect(card).toBeVisible();
  const metrics = await page.locator(".canvas-stage").evaluate((stage) => {
    const stageRect = stage.getBoundingClientRect();
    const cardRect = stage.querySelector<HTMLElement>(".diagram-svg svg")?.getBoundingClientRect();
    if (!cardRect) throw new Error("Empty diagram artboard is missing");
    return {
      horizontalOffset: Math.abs(
        (cardRect.left + cardRect.width / 2) - (stageRect.left + stageRect.width / 2),
      ),
      verticalOffset: Math.abs(
        (cardRect.top + cardRect.height / 2) - (stageRect.top + stageRect.height / 2),
      ),
      leftMargin: cardRect.left - stageRect.left,
      rightMargin: stageRect.right - cardRect.right,
      topMargin: cardRect.top - stageRect.top,
      bottomMargin: stageRect.bottom - cardRect.bottom,
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
    };
  });

  expect(metrics.horizontalOffset).toBeLessThan(metrics.stageWidth * 0.08);
  expect(metrics.verticalOffset).toBeLessThan(metrics.stageHeight * 0.08);
  expect(metrics.leftMargin).toBeGreaterThan(48);
  expect(metrics.rightMargin).toBeGreaterThan(48);
  expect(metrics.topMargin).toBeGreaterThan(48);
  expect(metrics.bottomMargin).toBeGreaterThan(48);
});

test("caps open diagrams at ten while keeping Chrome-like tab widths", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".workspace-tab")).toHaveCount(1);
  const sparseStripMetrics = await page.locator(".workspace-tab-scroll").evaluate((element) => {
    const tab = element.querySelector<HTMLElement>(".workspace-tab");
    if (!tab) throw new Error("Initial workspace tab is missing");
    return {
      tabWidth: tab.getBoundingClientRect().width,
    };
  });
  expect(sparseStripMetrics.tabWidth).toBeGreaterThanOrEqual(132);
  expect(sparseStripMetrics.tabWidth).toBeLessThanOrEqual(240);

  for (let index = 0; index < 9; index += 1) {
    const newButton = page.getByRole("button", { name: "New diagram", exact: true });
    await expect(newButton).toHaveCount(1);
    await newButton.click();
    await expect(page.getByRole("tab")).toHaveCount(index + 2);
  }

  await expect(page.getByRole("tab")).toHaveCount(10);
  const limitedNewButton = page.locator(".workspace-tab-new");
  await expect(limitedNewButton).toBeDisabled();
  await expect(limitedNewButton).toHaveAttribute(
    "title",
    "Maximum reached: 10 open diagrams. Close a tab to create another.",
  );

  const stripMetrics = await page.locator(".workspace-tab-scroll").evaluate((element) => {
    const style = window.getComputedStyle(element);
    const closeStyles = [...element.querySelectorAll<HTMLElement>(".workspace-tab-close")]
      .map((close) => window.getComputedStyle(close));
    return {
      overflowX: style.overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      closeControlsVisible: closeStyles.every((close) => close.opacity !== "0" && close.pointerEvents !== "none"),
    };
  });
  expect(stripMetrics.overflowX).toBe("auto");
  expect(stripMetrics.scrollWidth).toBeGreaterThan(stripMetrics.clientWidth);
  expect(stripMetrics.closeControlsVisible).toBe(true);

  const limitTooltip = page.locator(".workspace-tab-new-control");
  await limitTooltip.hover();
  await expect(page.locator(".workspace-tab-new-tooltip")).toBeVisible();
  await expect(page.locator(".workspace-tab-new-tooltip")).toContainText("Maximum reached");
  await expect(page.locator(".workspace-tab-new-tooltip")).toContainText("10 open diagrams");
});

test("opens the Help and Examples modals and launches an example in a new tab", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Browse examples", exact: true }).click();
  const examples = page.getByRole("dialog", { name: "Browse examples" });
  await expect(examples).toBeVisible();
  await expect(examples.locator(".examples-progress")).toHaveText(/Preparing previews \d of 10…|Previews ready/);
  await expect(examples.locator(".example-card")).toHaveCount(10);
  await expect(examples.getByText("Prompt · Try this with your agent", { exact: true })).toHaveCount(10);
  await expect(examples.getByText("How DumbDiagrams interprets it", { exact: true })).toHaveCount(10);
  await expect(examples.getByText(".dgm code", { exact: true })).toHaveCount(10);
  await expect(examples.getByText("Advanced · Detailed specification", { exact: true })).toHaveCount(10);
  await expect(examples.getByText("Private Azure App Service", { exact: true })).toBeVisible();
  await expect(examples.getByText("Google Cloud streaming analytics", { exact: true })).toBeVisible();
  await expect(examples.getByText("Cloud-agnostic order processing", { exact: true })).toBeVisible();

  const claims = examples.locator(".example-card").filter({ hasText: "Claims processing with Amazon Bedrock" });
  await expect(claims.locator(".example-prompt pre").first()).toContainText(
    "Design an AWS claims-processing workflow for a web application",
  );
  await claims.getByText("How DumbDiagrams interprets it", { exact: true }).click();
  await expect(claims.locator(".example-prompt pre").nth(1)).toContainText(
    "separate blueprint-creation path",
  );
  await claims.getByText("Advanced · Detailed specification", { exact: true }).click();
  await expect(claims.locator(".example-prompt pre").last()).toContainText(
    'Create a diagram titled "Claims processing with Amazon Bedrock"',
  );

  await expect(examples.locator(".examples-progress")).toHaveText("Previews ready", { timeout: 30_000 });
  await examples.getByRole("button", { name: "Open", exact: true }).first().click();
  await expect(page.getByRole("tab")).toHaveCount(2);

  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "DumbDiagrams Studio help" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "DumbDiagrams Studio help" })).toHaveCount(0);
});

test("keeps the Help menu inside the viewport", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Help", exact: true }).click();

  const menu = page.getByRole("menu", { name: "Help", exact: true });
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  const viewport = page.viewportSize();

  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height);
});

test("opens the format picker and export studio with auto-filled canvas options", async ({ page }) => {
  await page.goto("/");
  const supportsWebp = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  });

  await page.getByRole("button", { name: "More export formats", exact: true }).click();
  const picker = page.getByRole("menu", { name: "Export as", exact: true });
  await expect(picker).toBeVisible();
  await expect(picker.locator(".export-format-option")).toHaveCount(supportsWebp ? 11 : 10);
  await picker.locator(".export-format-option").filter({ hasText: "PNG" }).click();

  const dialog = page.getByRole("dialog", { name: "Export PNG" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Entire diagram/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Selection only/ })).toBeDisabled();
  await expect(dialog.getByText(/Auto-filled from the full canvas/)).toBeVisible();
  await expect(dialog.getByText(/Advanced/)).toBeVisible();

  await dialog.locator("select").first().selectOption("svg");
  const svgDialog = page.getByRole("dialog", { name: "Export SVG" });
  await expect(svgDialog).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await svgDialog.getByRole("button", { name: "Export SVG", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  await expect(svgDialog).toHaveCount(0);
});

test("opens multiple .dgm files as separate tabs", async ({ page }) => {
  await page.goto("/");
  const input = page.locator('input[type="file"]');
  await input.setInputFiles([
    `${ROOT}/examples/diagrams/async-docs.dgm`,
    `${ROOT}/examples/diagrams/transfer-hub.dgm`,
  ]);

  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.locator(".workspace-tab")).toContainText(["Untitled Diagram", "Async Docs", "Transfer Hub"]);
});

test("covers the empty canvas with progress feedback while importing a diagram", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = async function text() {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      return original.call(this);
    };
    const postMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function delayedPostMessage(...args: Parameters<Worker["postMessage"]>) {
      window.setTimeout(() => postMessage.apply(this, args), 400);
    };
  });

  const opening = page.locator('input[type="file"]').setInputFiles(
    `${ROOT}/examples/diagrams/async-docs.dgm`,
  );
  const loading = page.locator(".workspace-loading.operation-loading");
  await expect(loading).toContainText("Opening 1 diagram…");
  await expect(loading).toContainText("Preparing the canvas and diagram layout");
  await expect(page.locator(".app")).toHaveAttribute("aria-busy", "true");
  await opening;

  await expect(loading).toBeVisible();
  await expect(page.locator("#group-use1")).toHaveCount(1);
  await expect(loading).toHaveCount(0);
  await expect(page.locator(".app")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Async Docs");
});

test("updates an imported filename when the diagram is renamed", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(`${ROOT}/examples/diagrams/async-docs.dgm`);

  const title = page.getByRole("textbox", { name: "Diagram name", exact: true });
  await expect(title).toHaveValue("Async Docs");
  await expect(page.locator(".file-name")).toHaveText("async-docs.dgm");

  await title.fill("hhh");
  await title.press("Enter");

  await expect(page.locator(".file-name")).toHaveText("hhh.dgm");
  await expect(page.locator(".workspace-tab.is-active .workspace-tab-filename")).toHaveText("hhh.dgm");

  await page.getByRole("button", { name: "File", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("hhh.dgm");
});

test("prompts before discarding a dirty tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Diagram name" });
  await title.fill("Changed diagram");
  await title.press("Enter");
  await expect(page.locator(".dirty-pill")).toHaveCount(1);

  await page.locator(".workspace-tab.is-active .workspace-tab-close").click();
  const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Changed diagram");
  await expect(page.locator(".dirty-pill")).toHaveCount(1);

  await page.locator(".workspace-tab.is-active .workspace-tab-close").click();
  await page.getByRole("dialog", { name: "Unsaved changes" }).getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(1);
});

test("reopens the most recently closed tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  const title = page.getByRole("textbox", { name: "Diagram name", exact: true });
  await title.fill("Recover me");
  await title.press("Enter");
  await page.locator(".workspace-tab.is-active .workspace-tab-close").click();
  await page.getByRole("dialog", { name: "Unsaved changes" }).getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(1);

  await waitForStudioReady(page);
  await page.keyboard.press(`${MOD}+KeyK`);
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  const search = palette.getByRole("searchbox", { name: "Search commands" });
  await search.fill("reopen closed tab");
  await palette.getByRole("option", { name: /Reopen closed tab/ }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.locator(".workspace-tab.is-active")).toContainText("Recover me");
});

test("restores each tab's viewport when switching tabs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const initialReadout = await page.locator(".status-capsule-readout").textContent();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const customizedReadout = await page.locator(".status-capsule-readout").textContent();
  expect(customizedReadout).not.toBe(initialReadout);
  await page.getByRole("tab").first().click();
  await expect(page.locator(".status-capsule-readout")).not.toHaveText(customizedReadout ?? "");
  await page.getByRole("tab").nth(1).click();
  await expect(page.locator(".status-capsule-readout")).toHaveText(customizedReadout ?? "");
});

test("reorders tabs with drag and preserves the new order after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  const tabs = page.locator(".workspace-tab");
  await expect(tabs).toHaveCount(2);
  await tabs.nth(1).dragTo(tabs.nth(0));
  await expect(page.locator(".workspace-tab.is-active")).toContainText(/Untitled diagram/i);
  await page.reload();
  await expect(page.locator(".workspace-tab.is-active")).toContainText(/Untitled diagram/i);
});

test("downloads the canonical source from Save and clears the dirty marker", async ({ page }) => {
  await page.goto("/");
  const title = page.getByRole("textbox", { name: "Diagram name" });
  await title.fill("Saved diagram");
  await title.press("Enter");
  await expect(page.locator(".dirty-pill")).toHaveCount(1);

  await page.getByRole("button", { name: "File", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/saved-diagram\.dgm$/i);
  await expect(page.locator(".dirty-pill")).toHaveCount(0);
});

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

test("saves a Studio-edited curated example as canonical, valid source that keeps every id", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(SIMPLE_SERVERLESS);
  await waitForStudioReady(page);
  const original = parseDgm(await readFile(SIMPLE_SERVERLESS, "utf8"));

  const handler = await entityBox(page, "resource", "handler");
  const center = { x: handler.x + handler.width / 2, y: handler.y + handler.height / 2 };
  await drag(page, center, { x: center.x, y: center.y + 64 });

  await page.locator('[data-entity-kind="resource"][data-entity-id="gateway"]').click();
  const label = page.getByRole("textbox", { name: "Display label", exact: true });
  await label.fill("Public API");
  await label.press("Enter");

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const layers = page.getByRole("dialog", { name: "Layers", exact: true });
  await layers.locator(".layer-select").filter({ hasText: "api_to_handler" }).click();
  const segment = page.locator('[data-segment-handle^="api_to_handler:"]').first();
  const segmentBox = (await segment.boundingBox())!;
  const horizontal = (await segment.getAttribute("class"))?.includes("is-horizontal");
  const segmentCenter = { x: segmentBox.x + segmentBox.width / 2, y: segmentBox.y + segmentBox.height / 2 };
  await drag(page, segmentCenter, horizontal
    ? { x: segmentCenter.x, y: segmentCenter.y + 24 }
    : { x: segmentCenter.x + 24, y: segmentCenter.y });

  await layers.locator(".layer-select").filter({ hasText: "Request handler" }).click();
  await layers.locator(".layer-select").filter({ hasText: "Application data" }).click({ modifiers: ["Shift"] });
  await layers.getByRole("button", { name: "Group", exact: true }).click();

  await page.getByRole("button", { name: "File", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Save", exact: true }).click();
  const saved = await readFile((await (await downloadPromise).path())!, "utf8");

  const doc = parseDgm(saved);
  expect(printDgm(doc)).toBe(saved);
  expect(validateDocument(doc, getCatalogMap()).filter((issue) => issue.severity === "error")).toEqual([]);
  expect(doc.edges.map((edge) => edge.id)).toEqual(original.edges.map((edge) => edge.id));
  expect(doc.resources.map((resource) => resource.id)).toEqual(original.resources.map((resource) => resource.id));
  expect(doc.groups.map((group) => group.id)).toEqual(expect.arrayContaining(original.groups.map((group) => group.id)));
  expect(doc.groups).toHaveLength(original.groups.length + 1);
  expect(saved).toContain('aws.api-gateway gateway "Public API"');
  expect(saved).toMatch(/place handler \{[^}]*\by \d/);
  expect(saved).toMatch(/route api_to_handler \{/);
  expect(saved).toMatch(/\{\n\s+aws\.aws-lambda handler "Request handler"\n\s+aws\.dynamodb app_data "Application data"\n\s+\}/);
});

test("keeps undo history isolated per tab", async ({ page }) => {
  await page.goto("/");
  await waitForStudioReady(page);
  const title = page.getByRole("textbox", { name: "Diagram name", exact: true });
  await title.fill("First tab edit");
  await title.press("Enter");

  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await waitForStudioReady(page);
  await title.fill("Second tab edit");
  await title.press("Enter");

  await page.getByRole("tab").first().click();
  await expect(title).toHaveValue("First tab edit");
  await page.locator(".canvas-artboard").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press(`${MOD}+KeyZ`);
  await expect(title).toHaveValue("Untitled Diagram");

  await page.getByRole("tab").nth(1).click();
  await expect(title).toHaveValue("Second tab edit");
});

test("imports a real-world SVG export that declares SVG namespaces", async ({ page }) => {
  await page.goto("/");
  await waitForStudioReady(page);
  await page.getByRole("button", { name: "Resources", exact: true }).click();
  await page.locator('input[type="file"][accept=".svg,image/svg+xml"]').setInputFiles({
    name: "inkscape-icon.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="24" height="24" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#36c"/></svg>'),
  });
  await expect(page.getByText("Imported inkscape-icon.svg")).toBeVisible();
  await expect(page.locator('[data-entity-kind="resource"]')).toHaveCount(1);
});

test("restores open tabs after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New diagram", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("opens the command palette with the keyboard shortcut", async ({ page }) => {
  await page.goto("/");
  await waitForStudioReady(page);
  await page.keyboard.press(`${MOD}+KeyK`);
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  expect(await palette.getByRole("option").count()).toBeGreaterThanOrEqual(18);
  await expect(palette.getByRole("option", { name: /Zoom in/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
});

test("contains long unbroken diagram names inside the top bar", async ({ page }) => {
  await page.goto("/");
  const title = page.getByRole("textbox", { name: "Diagram name" });
  await title.fill("x".repeat(120));
  await title.press("Enter");

  const metrics = await page.locator(".floating-topbar").evaluate((topbar) => {
    const fileName = topbar.querySelector<HTMLElement>(".file-name")!;
    const topbarRect = topbar.getBoundingClientRect();
    const fileRect = fileName.getBoundingClientRect();
    return {
      bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      fileInside: fileRect.right <= topbarRect.right,
      fileWidth: fileRect.width,
      fileScrollWidth: fileName.scrollWidth,
    };
  });
  expect(metrics.bodyOverflow).toBe(0);
  expect(metrics.fileInside).toBe(true);
  expect(metrics.fileWidth).toBeLessThanOrEqual(320);
  expect(metrics.fileScrollWidth).toBeGreaterThanOrEqual(metrics.fileWidth);
});

test("selects the warned resource when a provider warning is clicked", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(`${ROOT}/examples/curated/aws-high-availability-web-app/diagram.dgm`);
  await waitForStudioReady(page);
  await page.locator(".issue-journal-trigger").click();
  await page.locator(".issue-journal-item").filter({ hasText: "(table_one)" }).click();
  await expect(page.locator('[data-entity-kind="resource"][data-entity-id="table_one"]').first()).toHaveAttribute("aria-selected", "true");
});
