export const ADMIN_LOAD_DEBUG_STORAGE_KEY = "bh-manage:admin-load-debug-enabled";

/** Completed load-debug trace entries (session tab); cleared only via Clear in UI. */
export const ADMIN_LOAD_DEBUG_TRACE_STORAGE_KEY = "bh-manage:admin-load-debug-trace";

export function readAdminLoadDebugEnabledFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ADMIN_LOAD_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAdminLoadDebugEnabledToStorage(enabled: boolean): void {
  try {
    window.localStorage.setItem(ADMIN_LOAD_DEBUG_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}
