import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error Build tooling is native JavaScript.
import { importBoundaryError } from "../../scripts/lib/import-boundaries.mjs";

const root = resolve(".");
const check = (path: string, specifier: string) => importBoundaryError(root, resolve(root, path), specifier);

describe("production import boundaries", () => {
  it("rejects reverse workspace dependencies and relative export bypasses", () => {
    expect(check("packages/runtime/src/dsl/parse.ts", "@dumb-diagrams/editor")).toMatch(/must not depend/);
    expect(check("packages/editor/src/model/clipboard.ts", "../../../runtime/src/core/types")).toMatch(/public exports/);
    expect(check("packages/editor/src/model/clipboard.ts", "../panels/Inspector")).toMatch(/model must not depend/);
  });
  it("keeps runtime and editor browser source free of Node and runtime free of React", () => {
    expect(check("packages/runtime/src/render/svg.ts", "node:fs")).toMatch(/Node built-ins/);
    expect(check("packages/editor/src/state/workspace.ts", "fs/promises")).toMatch(/Node built-ins/);
    expect(check("packages/runtime/src/dsl/parse.ts", "react/jsx-runtime")).toMatch(/React/);
  });
  it("permits public lower-layer imports and test-only platform utilities", () => {
    expect(check("packages/editor/src/main.tsx", "@dumb-diagrams/runtime/core")).toBeUndefined();
    expect(check("packages/cli/src/index.ts", "node:fs")).toBeUndefined();
    expect(check("packages/editor/src/state/workspace.test.ts", "node:fs")).toBeUndefined();
  });
});
