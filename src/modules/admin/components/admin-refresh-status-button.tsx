"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAdminLoadDebugPreference } from "@/modules/navigation/context/AdminLoadDebugPreferenceContext";
import {
  buildAsyncProgressDebugExport,
  clearAsyncProgressDebugTrace,
  getAsyncProgressActivities,
  getGlobalProgressMessages,
  isGlobalProgressActive,
  subscribeGlobalProgress,
  type AsyncProgressActivity,
} from "@/modules/navigation/lib/async-progress";

function subscribe(callback: () => void) {
  return subscribeGlobalProgress(callback);
}

function getSnapshot() {
  return isGlobalProgressActive();
}

function getServerSnapshot() {
  return false;
}

function getMessagesSnapshot() {
  return getGlobalProgressMessages();
}

function getActivitiesSnapshot() {
  return getAsyncProgressActivities();
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center gap-[3px]", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="kg-refresh-dot size-[5px] rounded-full bg-current"
          style={{ animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </span>
  );
}

function DebugActivityRow({
  op,
  now,
  live,
}: {
  op: AsyncProgressActivity;
  now: number;
  live: boolean;
}) {
  const ms = live ? now - op.startedAt : op.durationMs ?? 0;
  return (
    <li className="rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 text-[10px] leading-snug text-slate-700">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium text-slate-900">{op.label}</span>
        <span className="shrink-0 tabular-nums text-slate-500">{formatDurationMs(ms)}</span>
      </div>
      {op.path ? (
        <p className="mt-0.5 truncate font-mono text-[9px] text-slate-500">
          {op.method ?? "GET"} {op.path}
        </p>
      ) : null}
      {op.error ? <p className="mt-0.5 text-rose-600">{op.error}</p> : null}
    </li>
  );
}

export function AdminRefreshStatusButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { enabled: loadDebugEnabled } = useAdminLoadDebugPreference();
  const [isPending, startTransition] = useTransition();
  const [hoverOpen, setHoverOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const adminFetching = useIsFetching({ queryKey: ["admin"] });

  const globalActive = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const messages = useSyncExternalStore(subscribe, getMessagesSnapshot, () => []);
  const activities = useSyncExternalStore(subscribe, getActivitiesSnapshot, () => ({
    active: [],
    completed: [],
  }));

  const busy = globalActive || isPending || adminFetching > 0;
  const hasActiveOps = activities.active.length > 0;
  const completedNewestFirst = [...activities.completed].reverse();

  useEffect(() => {
    if (!loadDebugEnabled || !hasActiveOps) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [loadDebugEnabled, hasActiveOps]);

  const onRefresh = useCallback(() => {
    if (busy) return;
    startTransition(() => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      router.refresh();
    });
  }, [busy, queryClient, router]);

  const activityMessages =
    messages.length > 0 ? messages : busy ? ["Syncing admin data with the database…"] : [];

  const showDebugPanel =
    loadDebugEnabled && hoverOpen && (busy || completedNewestFirst.length > 0);
  const showSimpleActivityCard =
    !loadDebugEnabled && hoverOpen && busy && activityMessages.length > 0;
  const showIdleHint = hoverOpen && !busy && !showDebugPanel;

  const onClearDebug = useCallback(() => {
    clearAsyncProgressDebugTrace();
    setCopied(false);
  }, []);

  const onCopyDebug = useCallback(async () => {
    const payload = buildAsyncProgressDebugExport(Date.now());
    const extra = {
      ...payload,
      reactQuery: {
        adminQueriesFetching: adminFetching,
        transitionPending: isPending,
      },
    };
    const text = JSON.stringify(extra, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [adminFetching, isPending]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      onFocus={() => setHoverOpen(true)}
      onBlur={() => setHoverOpen(false)}
    >
      <button
        type="button"
        onClick={onRefresh}
        disabled={busy}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-90"
        aria-label={busy ? "Loading data" : "Refresh data"}
        aria-busy={busy}
      >
        <span className="relative flex size-[18px] items-center justify-center">
          <RefreshCw
            className={cn(
              "absolute size-[18px] transition-all duration-300 ease-out",
              busy ? "scale-50 opacity-0 rotate-90" : "scale-100 opacity-100 rotate-0",
            )}
            aria-hidden
          />
          <LoadingDots
            className={cn(
              "absolute transition-all duration-300 ease-out",
              busy ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          />
        </span>
      </button>

      {(showDebugPanel || showSimpleActivityCard || showIdleHint) && (
        <div
          className={cn(
            "absolute right-0 top-[calc(100%+8px)] z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-200",
            loadDebugEnabled ? "pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))]" : "pointer-events-none w-[min(18rem,calc(100vw-1.5rem))]",
          )}
          role="status"
        >
          <div className="rounded-xl border border-slate-200/90 bg-white p-3 text-left shadow-lg ring-1 ring-slate-900/5">
            {showDebugPanel ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-900">Load debug trace</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      Timings for admin API and navigation (newest first). Cleared only with
                      Clear.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-[10px]"
                      onClick={() => void onCopyDebug()}
                    >
                      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                      {copied ? "Copied" : "Copy JSON"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-[10px] text-slate-600"
                      onClick={onClearDebug}
                      disabled={completedNewestFirst.length === 0 && !hasActiveOps}
                    >
                      <Trash2 className="size-3" />
                      Clear
                    </Button>
                  </div>
                </div>

                {hasActiveOps ? (
                  <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      In progress
                    </p>
                    <ul className="max-h-36 space-y-1 overflow-y-auto">
                      {activities.active.map((op) => (
                        <DebugActivityRow key={op.id} op={op} now={now} live />
                      ))}
                    </ul>
                  </div>
                ) : null}

                {completedNewestFirst.length > 0 ? (
                  <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Completed ({completedNewestFirst.length})
                    </p>
                    <ul className="max-h-56 space-y-1 overflow-y-auto">
                      {completedNewestFirst.map((op) => (
                        <DebugActivityRow key={`${op.id}-${op.endedAt}`} op={op} now={now} live={false} />
                      ))}
                    </ul>
                  </div>
                ) : null}

                {adminFetching > 0 ? (
                  <p className="mt-2 text-[10px] text-slate-500">
                    React Query: {adminFetching} admin query
                    {adminFetching === 1 ? "" : "ies"} fetching
                  </p>
                ) : null}
              </>
            ) : showSimpleActivityCard ? (
              <>
                <p className="text-xs font-medium text-slate-900">Working in the background</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                  We&apos;re fetching the latest data from your database.
                </p>
                <ul className="mt-2.5 space-y-1.5 border-t border-slate-100 pt-2.5">
                  {activityMessages.map((msg) => (
                    <li key={msg} className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#2563EB]" aria-hidden />
                      <span>{msg}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-slate-900">Refresh</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                  {loadDebugEnabled
                    ? "Load debug is on. Hover here during sync to see timings and copy a JSON trace."
                    : "Reload this page and sync admin data with the database."}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
