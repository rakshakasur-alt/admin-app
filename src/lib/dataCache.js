// ---------------------------------------------------------------------------
// Tiny stale-while-revalidate cache for admin data.
//
// Pages read the last known value synchronously with `peekCache()` so moving
// between Dashboard / Menu / Analytics / Reports renders instantly instead of
// showing a skeleton each time, then refresh in the background.
// Concurrent callers of the same key share one in-flight request, so the
// Dashboard, notification bell and sidebar never fire duplicate queries.
// Memory only — never persisted — and wiped on sign-out / user switch.
// ---------------------------------------------------------------------------

const store = new Map();    // key -> { value, ts }
const inflight = new Map(); // key -> Promise

export function peekCache(key) {
  return store.get(key)?.value;
}

export function setCache(key, value) {
  store.set(key, { value, ts: Date.now() });
}

/**
 * cachedFetch(key, fetcher, { maxAgeMs, force })
 * Returns the cached value when it is fresher than maxAgeMs, otherwise runs
 * fetcher once (deduplicated) and caches its result.
 */
export async function cachedFetch(key, fetcher, { maxAgeMs = 30_000, force = false } = {}) {
  const hit = store.get(key);
  if (!force && hit && Date.now() - hit.ts < maxAgeMs) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const value = await fetcher();
      store.set(key, { value, ts: Date.now() });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

export function invalidateCache(prefix = '') {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function clearCache() {
  store.clear();
  inflight.clear();
}
