export const AI_ASSISTANT_ENABLED_STORAGE_KEY = "bh-manage:ai-assistant-enabled";

export function readAiAssistantEnabledFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AI_ASSISTANT_ENABLED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAiAssistantEnabledToStorage(enabled: boolean): void {
  try {
    window.localStorage.setItem(
      AI_ASSISTANT_ENABLED_STORAGE_KEY,
      enabled ? "1" : "0",
    );
  } catch {
    // ignore quota / private mode
  }
}
