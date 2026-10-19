"use client";

import { useCallback, useEffect, useState } from "react";

import {
  cacheInstallPrompt,
  clearCachedInstallPrompt,
  getCachedInstallPrompt,
  isRunningAsInstalledPwa,
  type BeforeInstallPromptEvent,
} from "@/modules/pwa/lib/pwa-install-session";

export type PwaInstallState = {
  canPromptInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export function usePwaInstall(): PwaInstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsInstalled(isRunningAsInstalledPwa());

    const cached = getCachedInstallPrompt();
    if (cached) setDeferred(cached);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      cacheInstallPrompt(installEvent);
      setDeferred(installEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      clearCachedInstallPrompt();
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const event = deferred ?? getCachedInstallPrompt();
    if (!event) return "unavailable";
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      clearCachedInstallPrompt();
      setDeferred(null);
      if (outcome === "accepted") {
        setIsInstalled(true);
      }
      return outcome;
    } catch {
      return "unavailable";
    }
  }, [deferred]);

  return {
    canPromptInstall: Boolean(deferred ?? getCachedInstallPrompt()),
    isInstalled,
    promptInstall,
  };
}

export const PWA_WINDOWS_MANUAL_INSTALL =
  "In Microsoft Edge or Chrome: open the menu (⋯) → Apps → Install this site as an app (or Install DHOOM Trading Manage). Use HTTPS or localhost — install is not offered on plain HTTP.";
