/**
 * Tracks in-flight admin GET calls that occupy the browser connection pool.
 * Shell chrome (session/context/settings/badges/search/dashboard-extended) is
 * excluded so bootstrap can wait on real page reads — including useEffect lists
 * that never register with TanStack Query.
 *
 * Does not cache ERP/POS/payment data (docs Class C). Live GET, delayed start only.
 */

const SHELL_GET_PATHS = new Set([
  "session",
  "erp/context",
  "nav-badges",
  "settings",
  "search-index",
]);

function pathOnly(pathAndQuery: string): string {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery.slice(1) : pathAndQuery;
  return path.split("?")[0] ?? path;
}

export function isAdminPrimaryGetPath(pathAndQuery: string): boolean {
  const full = pathAndQuery.startsWith("/") ? pathAndQuery.slice(1) : pathAndQuery;
  const base = pathOnly(full);
  if (SHELL_GET_PATHS.has(base)) return false;
  if (base === "dashboard") {
    const qs = full.includes("?") ? full.slice(full.indexOf("?") + 1) : "";
    if (/(?:^|&)section=extended(?:&|$)/.test(qs)) return false;
  }
  return true;
}

let inFlight = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function beginAdminPrimaryGet(pathAndQuery: string) {
  if (!isAdminPrimaryGetPath(pathAndQuery)) return;
  inFlight += 1;
  notify();
}

export function endAdminPrimaryGet(pathAndQuery: string) {
  if (!isAdminPrimaryGetPath(pathAndQuery)) return;
  inFlight = Math.max(0, inFlight - 1);
  notify();
}

export function subscribeAdminPrimaryGetInFlight(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getAdminPrimaryGetInFlight(): number {
  return inFlight;
}
