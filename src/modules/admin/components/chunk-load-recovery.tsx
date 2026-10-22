"use client";

import { useEffect } from "react";

const STORAGE_PREFIX = "admin-chunk-reload:";

function isChunkLoadMessage(message: string): boolean {
  return (
    message.includes("ChunkLoadError") ||
    message.includes("Loading chunk") ||
    message.includes("Failed to fetch dynamically imported module")
  );
}

/**
 * After HMR or a slow dev compile, the browser may request an old JS chunk hash.
 * One automatic reload per route usually fixes it without a manual hard refresh.
 */
export function ChunkLoadRecovery() {
  useEffect(() => {
    function maybeReload(message: string) {
      if (!isChunkLoadMessage(message)) return;
      const key = STORAGE_PREFIX + window.location.pathname;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      window.location.reload();
    }

    const onError = (event: ErrorEvent) => {
      maybeReload(event.message ?? String(event.error ?? ""));
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "";
      maybeReload(message);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
