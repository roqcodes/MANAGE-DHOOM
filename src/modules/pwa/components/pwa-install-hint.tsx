"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  markInstallPromptDismissedThisSession,
  shouldSuppressInstallPrompt,
} from "@/modules/pwa/lib/pwa-install-session";
import {
  PWA_WINDOWS_MANUAL_INSTALL,
  usePwaInstall,
} from "@/modules/pwa/lib/use-pwa-install";

type PwaInstallHintProps = {
  /** False when the service worker is not registered (e.g. local dev without ENABLE_PWA_DEV). */
  swActive: boolean;
};

export function PwaInstallHint({ swActive }: PwaInstallHintProps) {
  const { canPromptInstall, isInstalled, promptInstall } = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || isInstalled) return;
    if (shouldSuppressInstallPrompt()) return;
    if (canPromptInstall) setVisible(true);
  }, [canPromptInstall, isInstalled]);

  if (isInstalled || !visible) {
    return null;
  }

  const dismiss = () => {
    markInstallPromptDismissedThisSession();
    setVisible(false);
    setInstallError(null);
  };

  const install = async () => {
    setInstallError(null);
    const outcome = await promptInstall();
    if (outcome === "unavailable") {
      setInstallError(PWA_WINDOWS_MANUAL_INSTALL);
      return;
    }
    if (outcome === "dismissed") {
      dismiss();
      return;
    }
    dismiss();
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-[200] flex max-w-sm items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
      role="region"
      aria-label="Install DHOOM Trading Manage"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#EB205F]/10 text-[#EB205F]">
        <Download className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          Install DHOOM Trading
        </p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {swActive
            ? "Open Manage like a desktop app for faster ERP entry."
            : "Install works on a production build (HTTPS). For local testing, set NEXT_PUBLIC_ENABLE_PWA_DEV=true and restart dev."}
        </p>
        {installError ? (
          <p className="mt-2 text-[11px] leading-snug text-amber-800 dark:text-amber-200/90">
            {installError}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {canPromptInstall ? (
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-lg bg-[#EB205F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#D01A54]"
            >
              Install
            </button>
          ) : null}
          {!canPromptInstall ? (
            <button
              type="button"
              onClick={() => setInstallError(PWA_WINDOWS_MANUAL_INSTALL)}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900 dark:bg-slate-100 dark:text-slate-900"
            >
              How to install on Windows
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10"
        aria-label="Dismiss install prompt"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
