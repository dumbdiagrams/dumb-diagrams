import { expect, test, type Page } from "@playwright/test";
import { getDefaultView, portPoint } from "../packages/runtime/dist/core/index.js";
import { parseDgmResult, printDgm } from "../packages/runtime/dist/dsl/index.js";
import { layoutDocument } from "../packages/runtime/dist/layout/index.js";

import { entityBox, waitForStudioReady } from "./support/helpers";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

const doc = parseDgm(`diagram connector-direction {
  grammar aws
  aws.cloud cloud "AWS Cloud" {
    aws.simple-queue-service queue "Processing jobs"
    aws.aws-lambda worker "Worker"
  }
  queue -> worker { id process label "process job" }
}
view default {
  place queue { x 60 y 60 pin manual }
  place worker { x 320 y 220 pin manual }
}`);
const initial = layoutDocument(doc);
const sourceIcon = initial.nodes.find((node) => node.id === "queue")!.icon;
const targetIcon = initial.nodes.find((node) => node.id === "worker")!.icon;
const start = portPoint(sourceIcon, "e");
const finish = portPoint(targetIcon, "w", 0.25);
getDefaultView(doc).routes.process = {
  pin: true,
  mode: "manual",
  points: [start, { x: finish.x, y: start.y }, finish],
};

async function approach(page: Page) {
  return page.locator(".canvas-artboard .diagram-svg").evaluate((svg) => {
    const icon = svg.querySelector("#res-worker image")!;
    const d = svg.querySelector("#edge-process path")!.getAttribute("d")!;
    const coordinates = d.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    const last = { x: coordinates.at(-2)!, y: coordinates.at(-1)! };
    const neighbor = { x: coordinates.at(-4)!, y: coordinates.at(-3)! };
    const x = Number(icon.getAttribute("x"));
    const y = Number(icon.getAttribute("y"));
    const w = Number(icon.getAttribute("width"));
    const h = Number(icon.getAttribute("height"));
    return {
      x, y, w, h, last, neighbor,
      correct: last.x === x ? neighbor.x < x && neighbor.y === last.y
        : last.x === x + w ? neighbor.x > x + w && neighbor.y === last.y
          : last.y === y ? neighbor.y < y && neighbor.x === last.x
            : last.y === y + h && neighbor.y > y + h && neighbor.x === last.x,
    };
  });
}

test("a saved side-port connector approaches from outside its face and stays correct after moving the icon", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles({
    name: "connector-direction.dgm", mimeType: "text/plain", buffer: Buffer.from(printDgm(doc)),
  });
  await waitForStudioReady(page);
  await expect(page.locator('#edge-process path')).toHaveCount(1);
  await expect.poll(async () => (await approach(page)).correct).toBe(true);
  const before = await approach(page);
  expect(before.last.x).toBe(before.x);
  expect(before.neighbor.x).toBeLessThan(before.x);
  expect(before.neighbor.y).toBe(before.last.y);

  const box = await entityBox(page, "resource", "worker");
  const x = box.x + box.width / 2;
  const y = box.y + 16;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 48, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await approach(page)).x).not.toBe(before.x);
  await expect.poll(async () => (await approach(page)).correct).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => approach(page)).toEqual(before);
});
