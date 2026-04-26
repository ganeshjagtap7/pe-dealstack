// ─── PE OS — Client-Side Cache (Stale-While-Revalidate) ─────
// Simple localStorage cache with TTL. Pages render cached data
// instantly, then refresh in background.

(function () {
  const PREFIX = 'pe-cache-';
  const MAX_BYTES = 4 * 1024 * 1024; // 4MB limit

  function get(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.ts > entry.ttl) {
        localStorage.removeItem(PREFIX + key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  function set(key, data, ttlMs) {
    try {
      evictIfNeeded();
      localStorage.setItem(PREFIX + key, JSON.stringify({
        data,
        ts: Date.now(),
        ttl: ttlMs || 300000, // default 5 min
      }));
    } catch {
      // localStorage full or disabled — silently fail
    }
  }

  function clear(key) {
    localStorage.removeItem(PREFIX + key);
  }

  function clearAll() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
  }

  function evictIfNeeded() {
    let total = 0;
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) {
        const val = localStorage.getItem(k) || '';
        total += val.length * 2; // rough UTF-16 byte estimate
        try {
          const parsed = JSON.parse(val);
          entries.push({ key: k, ts: parsed.ts || 0, size: val.length * 2 });
        } catch {
          entries.push({ key: k, ts: 0, size: val.length * 2 });
        }
      }
    }
    if (total > MAX_BYTES) {
      // Evict oldest first
      entries.sort((a, b) => a.ts - b.ts);
      while (total > MAX_BYTES && entries.length) {
        const oldest = entries.shift();
        localStorage.removeItem(oldest.key);
        total -= oldest.size;
      }
    }
  }

  window.PECache = { get, set, clear, clearAll };
})();
