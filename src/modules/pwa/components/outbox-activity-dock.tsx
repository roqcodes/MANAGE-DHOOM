"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { useOutboxQueueActivity } from "@/lib/sync/hooks/use-outbox-queue-activity";
import { useOutboxSaveFeedback } from "@/lib/sync/hooks/use-outbox-save-feedback";
import {
  formatOutboxOperationLabel,
  formatOutboxOperationState,
} from "@/lib/sync/outbox-operation-label";
import { formatEstimatedDuration } from "@/lib/sync/outbox-queue-estimate";
import { requeueOutboxOperations } from "@/lib/sync/outbox-requeue";
import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
} from "@/lib/sync/outbox-types";
import { useOutboxActivityPreference } from "@/modules/pwa/context/OutboxActivityPreferenceContext";
import { cn } from "@/lib/utils";

function canManualRetry(op: OutboxOperationRecord): boolean {
  return (
    op.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION ||
    op.state === OUTBOX_OPERATION_STATES.DEAD_LETTER ||
    op.state === OUTBOX_OPERATION_STATES.STOCK_CONFLICT ||
    op.state === OUTBOX_OPERATION_STATES.UNCERTAIN
  );
}

function QueueRow({
  op,
  onRetry,
  retrying,
}: {
  op: OutboxOperationRecord;
  onRetry: (id: string) => void;
  retrying: boolean;
}) {
  const failed =
    op.state === OUTBOX_OPERATION_STATES.NEEDS_ATTENTION ||
    op.state === OUTBOX_OPERATION_STATES.DEAD_LETTER ||
    op.state === OUTBOX_OPERATION_STATES.STOCK_CONFLICT;
  const syncing = op.state === OUTBOX_OPERATION_STATES.SYNCING;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]",
        failed && "bg-amber-500/5",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
          syncing
            ? "text-sky-600 dark:text-sky-400"
            : failed
              ? "text-amber-600 dark:text-amber-400"
              : "text-indigo-600 dark:text-indigo-400",
        )}
      >
        {syncing ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : failed ? (
          <AlertCircle className="size-3.5" aria-hidden />
        ) : (
          <CloudUpload className="size-3.5" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold leading-tight text-slate-800 dark:text-slate-100">
          {formatOutboxOperationLabel(op.operationType)}
        </p>
        <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
          {formatOutboxOperationState(op.state)}
          {op.nextAttemptAt &&
          op.state === OUTBOX_OPERATION_STATES.RETRY_WAIT &&
          op.nextAttemptAt > Date.now()
            ? ` · ${formatDistanceToNow(op.nextAttemptAt, { addSuffix: true })}`
            : null}
        </p>
        {op.lastError?.message ? (
          <p className="mt-0.5 line-clamp-2 text-[10px] text-amber-800 dark:text-amber-200/90">
            {op.lastError.message}
          </p>
        ) : null}
      </div>
      {canManualRetry(op) ? (
        <button
          type="button"
          disabled={retrying}
          onClick={() => onRetry(op.operationId)}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-800 disabled:opacity-50 dark:hover:bg-white/10"
          title="Retry sync"
          aria-label="Retry sync"
        >
          <RefreshCw className={cn("size-3.5", retrying && "animate-spin")} />
        </button>
      ) : null}
    </div>
  );
}

function summaryLine(
  queuedCount: number,
  syncingCount: number,
  blockedCount: number,
  estimatedCompletionMs: number,
): string {
  const total = queuedCount + syncingCount + blockedCount;
  if (total === 0) return "Queue empty";

  const parts: string[] = [];
  if (syncingCount > 0) {
    parts.push(
      syncingCount === 1 ? "1 syncing" : `${syncingCount} syncing`,
    );
  }
  if (queuedCount > 0) {
    parts.push(queuedCount === 1 ? "1 queued" : `${queuedCount} queued`);
  }
  if (blockedCount > 0) {
    parts.push(blockedCount === 1 ? "1 needs attention" : `${blockedCount} need attention`);
  }

  const eta =
    blockedCount > 0 && syncingCount === 0 && queuedCount === 0
      ? ""
      : formatEstimatedDuration(estimatedCompletionMs);

  const head = parts.join(" · ");
  return eta && eta !== "—" ? `${head} · ${eta}` : head;
}

/**
 * Top-right sync queue pill (matches AI guide dock acrylic styling).
 */
export function OutboxActivityDock() {
  const { enabled } = useOutboxActivityPreference();
  const saveFeedback = useOutboxSaveFeedback();
  const {
    operations,
    queuedCount,
    syncingCount,
    blockedCount,
    estimatedCompletionMs,
    loading,
    refresh,
  } = useOutboxQueueActivity();
  const [expanded, setExpanded] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isRetrying, startRetry] = useTransition();

  const visibleCount = operations.length;
  const showSavedFlash = Boolean(saveFeedback);
  const show =
    enabled && (!loading || showSavedFlash) && (visibleCount > 0 || showSavedFlash);

  useEffect(() => {
    if (!show) setExpanded(false);
  }, [show]);

  const queueHeadline = summaryLine(
    queuedCount,
    syncingCount,
    blockedCount,
    estimatedCompletionMs,
  );

  const headline = showSavedFlash ? saveFeedback!.message : queueHeadline;
  const subline = showSavedFlash
    ? saveFeedback!.detail ?? (visibleCount > 0 ? queueHeadline : undefined)
    : undefined;
  const savedFlashActive = showSavedFlash;

  function retryOne(operationId: string) {
    setRetryError(null);
    startRetry(async () => {
      try {
        await requeueOutboxOperations([operationId]);
        await refresh();
      } catch (err) {
        setRetryError(err instanceof Error ? err.message : "Retry failed");
      }
    });
  }

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.96, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, scale: 0.96, filter: "blur(6px)" }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="pointer-events-auto fixed right-3 top-[3.35rem] z-[45] max-w-[min(24rem,calc(100vw-1.5rem))] sm:right-4 sm:top-[3.6rem]"
        >
          <div
            className="relative overflow-hidden rounded-[22px] border border-white/80 bg-white/75 p-1.5 shadow-[0_12px_32px_-6px_rgba(30,41,59,0.16),0_0_0_1px_rgba(255,255,255,0.7)_inset,0_4px_14px_rgba(56,189,248,0.1)] backdrop-blur-2xl dark:border-white/20 dark:bg-slate-900/75 dark:shadow-[0_14px_36px_-8px_rgba(0,0,0,0.45),inset_0_1px_2px_rgba(255,255,255,0.2)]"
            role="status"
            aria-live="polite"
            aria-label="Database sync queue"
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-400/10 via-indigo-400/5 to-sky-400/10 opacity-90" />

            <div className="relative flex min-h-[44px] items-center gap-2.5 px-3 py-1">
              <span className="relative flex size-2.5 shrink-0 items-center justify-center">
                {savedFlashActive ? (
                  <span className="relative flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  </span>
                ) : syncingCount > 0 ? (
                  <>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400/70 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-gradient-to-tr from-sky-400 to-indigo-500 shadow-[0_0_8px_rgba(56,189,248,0.75)]" />
                  </>
                ) : blockedCount > 0 ? (
                  <span className="relative inline-flex size-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)]" />
                ) : (
                  <span className="relative inline-flex size-2 rounded-full bg-indigo-500/90" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[9px] font-bold uppercase tracking-wider",
                    savedFlashActive
                      ? "text-emerald-600/90 dark:text-emerald-400/90"
                      : "text-slate-400 dark:text-slate-400/90",
                  )}
                >
                  {savedFlashActive ? "Saved locally" : "DB sync queue"}
                </p>
                <p
                  className={cn(
                    "truncate text-xs font-semibold tracking-tight",
                    savedFlashActive
                      ? "text-emerald-900 dark:text-emerald-50"
                      : "text-slate-800 dark:text-slate-100",
                  )}
                >
                  {headline}
                </p>
                {subline ? (
                  <p className="truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    {subline}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                {operations.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    aria-label={expanded ? "Collapse queue" : "Expand queue"}
                    className="flex size-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                ) : null}
              </div>
            </div>

            <AnimatePresence>
              {expanded ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="overflow-hidden border-t border-slate-200/60 dark:border-white/10"
                >
                  <ul className="max-h-52 space-y-0.5 overflow-y-auto px-1.5 py-1.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-white/10">
                    {operations.map((op) => (
                      <li key={op.operationId}>
                        <QueueRow
                          op={op}
                          onRetry={retryOne}
                          retrying={isRetrying}
                        />
                      </li>
                    ))}
                  </ul>
                  {retryError ? (
                    <p className="border-t border-slate-200/60 px-3 py-1.5 text-[10px] text-rose-600 dark:border-white/10 dark:text-rose-300">
                      {retryError}
                    </p>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
