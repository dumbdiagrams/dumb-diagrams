import { expect, test, type Page } from "@playwright/test";

import { waitForStudioReady } from "./support/helpers";

const longNote = "This long annotation should remain fully readable inside its own note background, even when automatic layout measures multiple wrapped lines of content.";

const longNotesSource = `diagram annotation-layout-regressions {
  grammar cloud-agnostic
  flow lr
  cloud-agnostic.server worker "Application worker"
  annotation long_code "${longNote}" { style code font mono size 16 }
  annotation long_paper "${longNote}" { style paper font sans size 16 }
  annotation long_callout "${longNote}" { style callout font sans size 16 }
  annotation long_checklist "${longNote}" { style checklist font sans size 16 }
  annotation narrow_code "${longNote}" { style code font mono size 48 }
}
view default {
  annotation narrow_code { x 40 y 500 w 180 h 40 pin }
}`;

async function importSource(page: Page, source: string) {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.dgm",
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  await waitForStudioReady(page);
}

async function renderedAnnotationBounds(page: Page, id: string) {
  const note = page.locator(`.diagram-svg #annotation-${id}`);
  await expect(note).toHaveCount(1);
  return note.evaluate((group) => {
    const background = group.querySelector("rect");
    const texts = [...group.querySelectorAll("text")];
    if (!background || texts.length === 0) return null;
    const bg = {
      x: Number(background.getAttribute("x")),
      y: Number(background.getAttribute("y")),
      width: Number(background.getAttribute("width")),
      height: Number(background.getAttribute("height")),
    };
    const boxes = texts.map((text) => {
      const box = text.getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    return { bg, boxes };
  });
}

test("long code, paper, callout, and checklist content fits within each annotation background", async ({ page }) => {
  await importSource(page, longNotesSource);

  for (const id of ["long_code", "long_paper", "long_callout", "long_checklist"]) {
    const renderedText = await page.locator(`.diagram-svg #annotation-${id}`).evaluate((group) =>
      (group.textContent ?? "").replace(/\s+/g, ""),
    );
    expect(renderedText).toContain(longNote.replace(/\s+/g, ""));
    const bounds = await renderedAnnotationBounds(page, id);
    expect(bounds, `${id} should render a background and text`).not.toBeNull();
    for (const text of bounds!.boxes) {
      expect(text.x).toBeGreaterThanOrEqual(bounds!.bg.x - 1);
      expect(text.y).toBeGreaterThanOrEqual(bounds!.bg.y - 1);
      expect(text.x + text.width).toBeLessThanOrEqual(bounds!.bg.x + bounds!.bg.width + 1);
      expect(text.y + text.height).toBeLessThanOrEqual(bounds!.bg.y + bounds!.bg.height + 1);
    }
  }
  const narrowBounds = await renderedAnnotationBounds(page, "narrow_code");
  expect(narrowBounds).not.toBeNull();
  for (const text of narrowBounds!.boxes) {
    expect(text.x).toBeGreaterThanOrEqual(narrowBounds!.bg.x - 1);
    expect(text.y).toBeGreaterThanOrEqual(narrowBounds!.bg.y - 1);
    expect(text.x + text.width).toBeLessThanOrEqual(narrowBounds!.bg.x + narrowBounds!.bg.width + 1);
    expect(text.y + text.height).toBeLessThanOrEqual(narrowBounds!.bg.y + narrowBounds!.bg.height + 1);
  }
});

test("code annotation text keeps readable contrast in light and dark themes", async ({ page }) => {
  await importSource(page, `diagram code-contrast {
    grammar cloud-agnostic
    cloud-agnostic.server worker "Worker"
    annotation code_note "Readable code note" { style code font mono size 16 }
  }`);

  const foreground = page.locator("#annotation-code_note text").first();
  const background = page.locator("#annotation-code_note rect").first();
  const contrastRatio = async () => page.evaluate(() => {
    const fg = getComputedStyle(document.querySelector("#annotation-code_note text")!).fill;
    const bg = getComputedStyle(document.querySelector("#annotation-code_note rect")!).fill;
    const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (color: string) => {
      const channels = rgb(color).map((value) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  });

  await expect(foreground).toBeVisible();
  await expect(background).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await page.locator("html").evaluate((html, value) => html.setAttribute("data-theme", value), theme);
    await expect.poll(contrastRatio).toBeGreaterThanOrEqual(4.5);
  }
});

test("annotation resize handle increases the note background dimensions", async ({ page }) => {
  await importSource(page, `diagram annotation-resize {
    grammar cloud-agnostic
    cloud-agnostic.server worker "Worker"
    annotation resizable "A note that can grow" { style callout }
  }`);

  const note = page.locator('[data-entity-kind="annotation"][data-entity-id="resizable"]');
  await note.click();
  await expect(note).toHaveAttribute("aria-selected", "true");
  const background = page.locator("#annotation-resizable rect").first();
  const before = await background.evaluate((rect) => ({
    width: Number(rect.getAttribute("width")),
    height: Number(rect.getAttribute("height")),
  }));
  const handle = page.locator('[data-resize-kind="annotation"][data-resize-handle="se"]');
  await expect(handle).toHaveCount(1);
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  const start = { x: handleBox!.x + handleBox!.width / 2, y: handleBox!.y + handleBox!.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y + 80, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => Number(await background.getAttribute("width"))).toBeGreaterThan(before.width);
  await expect.poll(async () => Number(await background.getAttribute("height"))).toBeGreaterThan(before.height);
});

test("automatic annotations avoid stacking and stay near their anchored resource", async ({ page }) => {
  const source = `diagram annotation-auto-layout {
    grammar cloud-agnostic
    flow lr
    cloud-agnostic.server worker "Application worker"
    annotation note_a "First related note" { anchor worker style callout }
    annotation note_b "Second related note" { anchor worker style code }
    annotation note_c "Third related note" { anchor worker style checklist }
    annotation note_d "Fourth related note" { anchor worker style callout }
    annotation note_e "Fifth related note" { anchor worker style code }
  }`;
  await importSource(page, source);

  const notes = await page.locator('.diagram-svg g[id^="annotation-"]').evaluateAll((groups) =>
    groups.map((group) => {
      const rect = group.querySelector("rect")!;
      const box = rect.getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  expect(notes).toHaveLength(5);
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const horizontalOverlap = Math.min(notes[i].x + notes[i].width, notes[j].x + notes[j].width) - Math.max(notes[i].x, notes[j].x);
      const verticalOverlap = Math.min(notes[i].y + notes[i].height, notes[j].y + notes[j].height) - Math.max(notes[i].y, notes[j].y);
      expect(horizontalOverlap <= 0 || verticalOverlap <= 0, `notes ${i} and ${j} should not overlap`).toBe(true);
    }
  }

  const resource = await page.locator(".diagram-svg #res-worker").evaluate((element) => {
    const box = element.getBBox();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const anchorPoint = { x: resource.x + resource.width, y: resource.y + resource.height / 2 };
  for (let i = 0; i < 5; i++) {
    const note = await page.locator(`.diagram-svg g[id="annotation-note_${String.fromCharCode(97 + i)}"] rect`).first().evaluate((rect) => {
      const box = rect.getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    const dx = Math.max(note.x - anchorPoint.x, 0, anchorPoint.x - (note.x + note.width));
    const dy = Math.max(note.y - anchorPoint.y, 0, anchorPoint.y - (note.y + note.height));
    expect(Math.hypot(dx, dy)).toBeLessThan(500);
  }
});
