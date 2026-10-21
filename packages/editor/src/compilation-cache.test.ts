import { describe, expect, it } from "vitest";

import { ByteBudgetLruCache } from "./compilation-cache";

describe("ByteBudgetLruCache", () => {
  it("accounts for replacement and refreshes LRU order", () => {
    const cache = new ByteBudgetLruCache<string, string>(10, 6, (_key, value) => value.length);

    cache.set("a", "aa");
    cache.set("b", "bb");
    cache.set("c", "cc");
    expect(cache.totalBytes).toBe(6);

    expect(cache.get("a")).toBe("aa");
    cache.set("d", "dd");

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("aa");
    expect(cache.get("c")).toBe("cc");
    expect(cache.get("d")).toBe("dd");

    cache.set("a", "a");
    expect(cache.totalBytes).toBe(5);
    expect(cache.get("a")).toBe("a");
  });

  it("removes the previous value when an oversized replacement is rejected", () => {
    const cache = new ByteBudgetLruCache<string, string>(3, 10, (_key, value) => value.length);
    cache.set("same", "small");
    cache.set("other", "ok");

    const result = cache.set("same", "this replacement is too large");

    expect(result.retained).toBe(false);
    expect(cache.get("same")).toBeUndefined();
    expect(cache.get("other")).toBe("ok");
    expect(cache.totalBytes).toBe(2);
  });

  it("rejects an oversized entry without evicting retained entries", () => {
    const cache = new ByteBudgetLruCache<string, string>(3, 4, (_key, value) => value.length);
    cache.set("small", "ok");

    const result = cache.set("large", "too-large");

    expect(result).toEqual({ retained: false, estimatedBytes: 9 });
    expect(cache.get("small")).toBe("ok");
    expect(cache.get("large")).toBeUndefined();
    expect(cache.size).toBe(1);
    expect(cache.totalBytes).toBe(2);
  });
});
