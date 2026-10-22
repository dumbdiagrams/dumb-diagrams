/**
 * A small insertion ordered cache with independent entry-count and byte
 * limits. The byte value is supplied by the owner because it is an estimate,
 * not a measurement of the JavaScript heap.
 */
export type CacheWriteResult = {
  retained: boolean;
  estimatedBytes: number;
};

type CacheEntry<Value> = {
  value: Value;
  estimatedBytes: number;
};

export class ByteBudgetLruCache<Key, Value> {
  private readonly entries = new Map<Key, CacheEntry<Value>>();
  private bytes = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
    private readonly estimateBytes: (key: Key, value: Value) => number,
  ) {}

  get(key: Key): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: Key, value: Value): CacheWriteResult {
    const rawEstimate = this.estimateBytes(key, value);
    const estimatedBytes = Number.isFinite(rawEstimate)
      ? Math.max(0, Math.ceil(rawEstimate))
      : rawEstimate > 0
        ? Number.POSITIVE_INFINITY
        : this.maxBytes + 1;
    this.delete(key);

    // Do not evict useful entries to make room for a value that can never fit.
    if (estimatedBytes > this.maxBytes) {
      return { retained: false, estimatedBytes };
    }

    this.entries.set(key, { value, estimatedBytes });
    this.bytes += estimatedBytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }
    return { retained: this.entries.has(key), estimatedBytes };
  }

  delete(key: Key): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.bytes -= entry.estimatedBytes;
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  get totalBytes(): number {
    return this.bytes;
  }
}
