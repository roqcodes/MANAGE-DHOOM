"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  cacheInstallPrompt,
  clearCachedInstallPrompt,
  getCachedInstallPrompt,
  markInstallPromptAskedThisSession,
  markInstallPromptDismissedThisSession,
  shouldSuppressInstallPrompt,
  type BeforeInstallPromptEvent,
} from "@/modules/pwa/lib/pwa-install-session";

function showPromptFromCache(
  setDeferred: (e: BeforeInstallPromptEvent | null) => void,
  setVisible: (v: boolean) => void,
) {
  const cached = getCachedInstallPrompt();
  if (!cached || shouldSuppressInstallPrompt()) return;
  setDeferred(cached);
  setVisible(true);
  markInstallPromptAskedThisSession();
}

export function PwaInstallHint() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (shouldSuppressInstallPrompt()) {
      return;
    }

    showPromptFromCache(setDeferred, setVisible);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      const installEvent = event as BeforeInstallPromptEvent;
      cacheInstallPrompt(installEvent);

      if (shouldSuppressInstallPrompt()) {
        return;
      }

      setDeferred(installEvent);
      setVisible(true);
      markInstallPromptAskedThisSession();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  if (!visible || !deferred) {
    return null;
  }

  const dismiss = () => {
    markInstallPromptDismissedThisSession();
    clearCachedInstallPrompt();
    setVisible(false);
    setDeferred(null);
  };

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-[200] flex max-w-sm items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
      role="region"
      aria-label="Install DHOOM Trading Manage"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EB205F]/10 text-[#EB205F]">
        <Download className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">Install DHOOM Trading</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Open Manage like a desktop app for faster ERP entry.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void install()}
            className="rounded-lg bg-[#EB205F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D01A54]"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label="Dismiss install prompt"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
