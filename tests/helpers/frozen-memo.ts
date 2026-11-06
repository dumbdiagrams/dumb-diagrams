/**
 * Memoizes a pure, expensive compile and deep-freezes the result, so tests can
 * share one compile without being able to affect each other: any mutation of a
 * shared result throws instead of leaking into another test. Entries are filled
 * lazily by whichever test asks first, so results never depend on test order.
 */
export function frozenMemo<K, V>(compute: (key: K) => V): (key: K) => V {
  const cache = new Map<K, V>();
  return (key) => {
    if (!cache.has(key)) cache.set(key, deepFreeze(compute(key)));
    return cache.get(key)!;
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
