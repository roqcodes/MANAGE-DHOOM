"use client";

import Link from "next/link";
import { RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MANAGE_APP_NAME } from "@/modules/brand/lib/brand";

export function OfflinePageContent() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#F8FAFC] px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-sky-200/80 bg-sky-50 text-sky-700 shadow-sm">
        <WifiOff className="size-7" aria-hidden />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
        {MANAGE_APP_NAME}
      </p>
      <h1 className="text-2xl font-black tracking-tight text-slate-900">No connection</h1>
      <p className="max-w-md text-sm leading-relaxed text-slate-600">
        You&apos;re offline. The app shell is saved on this device, but live ERP data and saves need
        the internet. Reconnect, then reload to continue.
      </p>
      <ul className="max-w-sm list-disc space-y-1 pl-5 text-left text-xs text-slate-500">
        <li>Check Wi‑Fi or mobile data</li>
        <li>Tap reload once you&apos;re back online</li>
      </ul>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          className="rounded-xl bg-[#EB205F] hover:bg-[#D01A54]"
          onClick={() => window.location.reload()}
        >
          <RefreshCw data-icon="inline-start" className="size-4" />
          Reload
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          nativeButton={false}
          render={<Link href="/admin" />}
        >
          Admin home
        </Button>
      </div>
    </main>
  );
}
