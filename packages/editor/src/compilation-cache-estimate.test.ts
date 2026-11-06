import { describe, expect, it } from "vitest";

import type { DiagramCompilation } from "./diagram-compiler";
import { estimateCompilationCacheEntryBytes, MAX_CACHED_COMPILATION_BYTES } from "./diagram-compiler";
import { ByteBudgetLruCache } from "./compilation-cache";

describe("diagram compilation cache size estimates", () => {
  it("retains failed compilations while rejecting an oversized successful result", () => {
    const failed: DiagramCompilation = {
      ok: false,
      issues: [{ level: "error", code: "compilation", message: "failed" }],
      svg: null,
      invariantFailures: [],
      layout: null,
    };
    const oversized = {
      ok: true,
      issues: [],
      svg: "x".repeat(MAX_CACHED_COMPILATION_BYTES),
      invariantFailures: [],
      doc: {},
      layout: {},
    } as unknown as DiagramCompilation;
    const cache = new ByteBudgetLruCache<string, DiagramCompilation>(
      12,
      MAX_CACHED_COMPILATION_BYTES,
      estimateCompilationCacheEntryBytes,
    );

    const failedResult = cache.set("failed", failed);
    const oversizedResult = cache.set("oversized", oversized);

    expect(failedResult.retained).toBe(true);
    expect(cache.get("failed")).toBe(failed);
    expect(estimateCompilationCacheEntryBytes("oversized", oversized)).toBeGreaterThan(MAX_CACHED_COMPILATION_BYTES);
    expect(oversizedResult.retained).toBe(false);
    expect(cache.get("oversized")).toBeUndefined();
  });
});
