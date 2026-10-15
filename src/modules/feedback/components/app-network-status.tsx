"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shows a top banner when the browser goes offline mid-session (PWA-friendly).
 */
export function AppNetworkStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function sync() {
      setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    }
    sync();
    window.addEventListener("offline", sync);
    window.addEventListener("online", sync);
    return () => {
      window.removeEventListener("offline", sync);
      window.removeEventListener("online", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className={cn(
        "fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 border-b border-sky-200/80 bg-sky-50/95 px-4 py-2.5 shadow-sm backdrop-blur-sm",
      )}
    >
      <WifiOff className="size-4 shrink-0 text-sky-700" aria-hidden />
      <p className="text-center text-sm font-medium text-sky-950">
        You&apos;re offline — changes won&apos;t save until you reconnect.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0 border-sky-300 bg-white text-sky-900"
        onClick={() => window.location.reload()}
      >
        Reload
      </Button>
    </div>
  );
}
