export const OUTBOX_ACTIVITY_BAR_STORAGE_KEY = "bh-manage:outbox-activity-bar-enabled";

export function readOutboxActivityBarEnabledFromStorage(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(OUTBOX_ACTIVITY_BAR_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function writeOutboxActivityBarEnabledToStorage(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      OUTBOX_ACTIVITY_BAR_STORAGE_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // ignore
  }
}
