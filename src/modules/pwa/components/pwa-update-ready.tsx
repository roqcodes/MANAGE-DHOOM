"use client";

import { useSerwist } from "@serwist/next/react";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Holds service worker activation until the user confirms.
 * Future phases can gate this on outbox SYNCING count.
 */
export function PwaUpdateReady() {
  const { serwist } = useSerwist();
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!serwist) {
      return;
    }

    const onWaiting = () => {
      setWaiting(true);
    };

    serwist.addEventListener("waiting", onWaiting);
    return () => {
      serwist.removeEventListener("waiting", onWaiting);
    };
  }, [serwist]);

  if (!waiting || !serwist) {
    return null;
  }

  const applyUpdate = () => {
    void serwist.messageSkipWaiting();
    window.location.reload();
  };

  return (
    <div
      className="fixed bottom-4 left-4 z-[200] flex max-w-sm items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-lg"
      role="status"
    >
      <RefreshCw className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-950">Update available</p>
        <p className="mt-0.5 text-xs text-amber-800/90">
          Reload when you are between tasks. Pending sync will be protected in a
          later phase.
        </p>
        <button
          type="button"
          onClick={applyUpdate}
          className="mt-3 rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900"
        >
          Reload now
        </button>
      </div>
    </div>
  );
}
