import { expect, test } from "@playwright/test";

test("moves an Azure boundary where a connector crosses its stroke", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("menuitem", { name: "Browse examples", exact: true }).click();
  const examples = page.getByRole("dialog", { name: "Browse examples" });
  const azure = examples.locator(".example-card").filter({ hasText: "Private Azure App Service" });
  await azure.getByRole("button", { name: "Open", exact: true }).click();

  const boundary = page.locator('[data-entity-kind="group"][aria-label="Group Platform services"]');
  await expect(boundary).toHaveCount(1);
  const boundaryId = await boundary.getAttribute("data-entity-id");
  expect(boundaryId).toBeTruthy();

  const crossing = await boundary.evaluate((element) => {
    const rect = {
      x: Number(element.getAttribute("x")),
      y: Number(element.getAttribute("y")),
      w: Number(element.getAttribute("width")),
      h: Number(element.getAttribute("height")),
    };
    const svg = element.ownerSVGElement!;
    const toClient = (x: number, y: number) => {
      const client = svg.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;
      return {
        x: client.left + ((x - viewBox.x) / viewBox.width) * client.width,
        y: client.top + ((y - viewBox.y) / viewBox.height) * client.height,
      };
    };
    const between = (value: number, start: number, end: number) =>
      value >= Math.min(start, end) && value <= Math.max(start, end);
    const edges = Array.from(svg.querySelectorAll<SVGPolylineElement>('[data-entity-kind="edge"]'));
    for (const edge of edges) {
      const points = (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((value) => {
        const [x, y] = value.split(",").map(Number);
        return { x, y };
      });
      for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1]!;
        const b = points[index]!;
        const candidates = a.y === b.y
          ? [
              { x: rect.x, y: a.y },
              { x: rect.x + rect.w, y: a.y },
            ].filter((point) => between(point.x, a.x, b.x) && between(point.y, rect.y, rect.y + rect.h))
          : a.x === b.x
            ? [
                { x: a.x, y: rect.y },
                { x: a.x, y: rect.y + rect.h },
              ].filter((point) => between(point.y, a.y, b.y) && between(point.x, rect.x, rect.x + rect.w))
            : [];
        const point = candidates[0];
        if (point) {
          return {
            edgeId: edge.getAttribute("data-entity-id")!,
            ...toClient(point.x, point.y),
          };
        }
      }
    }
    throw new Error("Expected a connector to cross the Platform services boundary");
  });

  const edge = page.locator(`[data-entity-kind="edge"][data-entity-id="${crossing.edgeId}"]`);
  await edge.dispatchEvent("pointermove", {
    bubbles: true,
    pointerId: 7,
    pointerType: "mouse",
    clientX: crossing.x,
    clientY: crossing.y,
  });
  await expect(page.locator(`[data-hover-kind="group"][data-hover-id="${boundaryId}"]`)).toHaveCount(1);
  await expect.poll(() => edge.evaluate((element) => getComputedStyle(element).cursor)).toBe("move");

  const before = {
    x: Number(await boundary.getAttribute("x")),
    y: Number(await boundary.getAttribute("y")),
  };
  await edge.dispatchEvent("pointerdown", {
    bubbles: true,
    button: 0,
    pointerId: 7,
    clientX: crossing.x,
    clientY: crossing.y,
  });
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent("pointermove", {
      bubbles: true,
      pointerId: 7,
      clientX: x + 48,
      clientY: y + 32,
    }));
    window.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      pointerId: 7,
      clientX: x + 48,
      clientY: y + 32,
    }));
  }, crossing);

  await expect(boundary).toHaveAttribute("aria-selected", "true");
  await expect(edge).toHaveAttribute("aria-selected", "false");
  await expect.poll(async () => ({
    x: Number(await boundary.getAttribute("x")),
    y: Number(await boundary.getAttribute("y")),
  })).not.toEqual(before);
});
