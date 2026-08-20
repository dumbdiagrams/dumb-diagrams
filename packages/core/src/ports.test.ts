import { describe, expect, it } from "vitest";

import {
  DEFAULT_PORT_OFFSET,
  PORT_OFFSETS,
  nearestPortAnchor,
  portAnchors,
  portPoint,
} from "./ports.js";

describe("icon port anchors", () => {
  const rect = { x: 10, y: 20, w: 80, h: 40 };

  it("exposes three deterministic anchors on every face", () => {
    const anchors = portAnchors(rect);

    expect(anchors).toHaveLength(12);
    expect(anchors.map((anchor) => anchor.side)).toEqual([
      "n", "n", "n", "e", "e", "e", "s", "s", "s", "w", "w", "w",
    ]);
    expect(anchors.map((anchor) => anchor.offset)).toEqual([
      ...PORT_OFFSETS,
      ...PORT_OFFSETS,
      ...PORT_OFFSETS,
      ...PORT_OFFSETS,
    ]);
  });

  it("keeps route points exactly on the icon border", () => {
    expect(portPoint(rect, "e", 0.25)).toEqual({ x: 90, y: 30 });
    expect(portPoint(rect, "s", 0.75)).toEqual({ x: 70, y: 60 });
  });

  it("snaps arbitrary endpoint edits to the closest visible anchor", () => {
    const anchor = nearestPortAnchor(rect, { x: 11, y: 39 });

    expect(anchor.side).toBe("w");
    expect(anchor.offset).toBe(DEFAULT_PORT_OFFSET);
    expect(anchor.point).toEqual({ x: 10, y: 40 });
  });
});
