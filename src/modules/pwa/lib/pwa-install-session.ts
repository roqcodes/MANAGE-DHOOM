export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Cleared when all tabs for this origin are closed. */
const SESSION_DISMISS_KEY = "buyhub-pwa-install-dismissed";
const SESSION_ASKED_KEY = "buyhub-pwa-install-asked";

let cachedDeferred: BeforeInstallPromptEvent | null = null;

export function getCachedInstallPrompt(): BeforeInstallPromptEvent | null {
  return cachedDeferred;
}

export function cacheInstallPrompt(event: BeforeInstallPromptEvent): void {
  cachedDeferred = event;
}

export function clearCachedInstallPrompt(): void {
  cachedDeferred = null;
}

export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
}

export function shouldSuppressInstallPrompt(): boolean {
  if (typeof window === "undefined") return true;
  if (isRunningAsInstalledPwa()) return true;
  try {
    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") return true;
    if (sessionStorage.getItem(SESSION_ASKED_KEY) === "1") return true;
  } catch {
    return false;
  }
  return false;
}

/** User saw the in-app banner this session (including after client navigations). */
export function markInstallPromptAskedThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_ASKED_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function markInstallPromptDismissedThisSession(): void {
  markInstallPromptAskedThisSession();
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  } catch {
    /* private mode */
  }
}
