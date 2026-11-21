import { useEffect, useState } from 'react';

/**
 * Real connectivity status for the sidebar "Admin Console" dot.
 *
 * navigator.onLine only says whether a network interface is up — it stays
 * `true` when Wi-Fi is connected but the internet (or Supabase) is down, so
 * the dot never turned red. This hook combines the browser online/offline
 * events with a lightweight reachability probe of the Supabase host:
 *  • instantly red on the browser's `offline` event
 *  • re-checked on `online`, tab focus / visibility, and every POLL_MS
 *  • a probe that fails or takes longer than TIMEOUT_MS counts as offline
 */
const POLL_MS = 15_000;
const TIMEOUT_MS = 5_000;

const PROBE_URL = (() => {
  const base = import.meta.env?.VITE_SUPABASE_URL;
  return base ? `${String(base).replace(/\/+$/, '')}/auth/v1/health` : '';
})();

async function probe() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!PROBE_URL || typeof fetch !== 'function') {
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS);
  try {
    // no-cors: we only need to know the host answered at all (an opaque
    // response still means the network is up); a network failure throws.
    await fetch(`${PROBE_URL}?t=${Date.now()}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller?.signal,
    });
    return true;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine !== false : true);

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function check() {
      if (inFlight) return;
      inFlight = true;
      const ok = await probe();
      inFlight = false;
      if (active) setIsOnline(ok);
    }

    const handleOffline = () => setIsOnline(false);
    const handleOnline = () => { check(); };
    const handleVisible = () => { if (document.visibilityState === 'visible') check(); };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('focus', handleVisible);
    document.addEventListener('visibilitychange', handleVisible);
    const interval = setInterval(check, POLL_MS);
    check();

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('focus', handleVisible);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, []);

  return isOnline;
}
