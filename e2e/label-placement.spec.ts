import { expect, test } from "@playwright/test";

import { ROOT, waitForStudioReady } from "./support/helpers";

test("keeps the full payment label readable beside a crowded fan-out", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').setInputFiles(
    `${ROOT}/examples/curated/event-driven-order-fulfillment/diagram.dgm`,
  );
  await waitForStudioReady(page);
  const label = page.locator('.canvas-artboard .diagram-svg [data-edge-label="authorize_payment"]');
  await expect(label).toHaveText("authorize payment");
  await page.evaluate(() => document.fonts.ready);

  const geometry = await label.evaluate((element) => {
    const text = element as SVGGraphicsElement;
    const svg = text.ownerSVGElement!;
    const box = text.getBBox();
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const overlaps = (other: DOMRect) => (
      box.x < other.x + other.width && other.x < box.x + box.width &&
      box.y < other.y + other.height && other.y < box.y + box.height
    );
    const content = svg.querySelectorAll<SVGGraphicsElement>(
      'g[id^="res-"] image, g[id^="res-"] text, g[id^="group-"] text, .edge-label',
    );
    const collisions = [...content]
      .filter((other) => other !== text && overlaps(other.getBBox()))
      .map((other) => other.getAttribute("data-edge-label") ?? other.parentElement!.id);
    const distanceToRoute = (route: SVGPathElement) => {
      let distance = Infinity;
      const length = route.getTotalLength();
      for (let position = 0; position <= Math.ceil(length); position++) {
        const point = route.getPointAtLength(Math.min(position, length));
        distance = Math.min(distance, Math.hypot(centre.x - point.x, centre.y - point.y));
      }
      return distance;
    };
    const routes = [...svg.querySelectorAll<SVGPathElement>('g[id^="edge-"] > path[stroke]:not([stroke="transparent"])')];
    const own = routes.find((route) => route.parentElement!.id === "edge-authorize_payment")!;
    return {
      collisions,
      ownDistance: distanceToRoute(own),
      otherDistances: routes.filter((route) => route !== own).map((route) => ({
        id: route.parentElement!.id,
        distance: distanceToRoute(route),
      })),
    };
  });

  expect(geometry.collisions).toEqual([]);
  expect(geometry.ownDistance).toBeLessThanOrEqual(20);
  expect(geometry.otherDistances.length).toBeGreaterThan(0);
  for (const other of geometry.otherDistances) {
    expect(other.distance, `label is closer to ${other.id}`).toBeGreaterThan(geometry.ownDistance);
  }
});
