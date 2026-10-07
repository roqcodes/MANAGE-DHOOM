const ERP_TERMINAL_STORAGE_KEY = "buyhub-erp-terminal-id";

/** Stable browser terminal id for ERP client operations (not POS). */
export function getOrCreateErpTerminalId(): string {
  if (typeof window === "undefined") {
    return "server";
  }
  try {
    const existing = window.localStorage.getItem(ERP_TERMINAL_STORAGE_KEY);
    if (existing && existing.length > 0) {
      return existing;
    }
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `term-${Date.now()}`;
    window.localStorage.setItem(ERP_TERMINAL_STORAGE_KEY, id);
    return id;
  } catch {
    return `term-${Date.now()}`;
  }
}
