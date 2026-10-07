"use client";

import { SerwistProvider } from "@serwist/next/react";
import { useEffect, useState } from "react";

import { PwaInstallHint } from "@/modules/pwa/components/pwa-install-hint";
import { PwaUpdateReady } from "@/modules/pwa/components/pwa-update-ready";

function requestPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return;
  }

  void navigator.storage.persist().catch(() => {
    /* optional; quota policies vary by browser */
  });
}

export function BuyHubPwa({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(
      typeof window !== "undefined" && "serviceWorker" in navigator,
    );
    requestPersistentStorage();
  }, []);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <SerwistProvider
      swUrl="/sw.js"
      register
      reloadOnOnline={false}
      cacheOnNavigation={false}
    >
      {children}
      <PwaInstallHint />
      <PwaUpdateReady />
    </SerwistProvider>
  );
}
