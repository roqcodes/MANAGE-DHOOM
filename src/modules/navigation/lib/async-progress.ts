import { ADMIN_LOAD_DEBUG_TRACE_STORAGE_KEY } from "@/modules/navigation/lib/admin-load-debug-preference";

type Listener = () => void;

export type AsyncProgressKind = "api" | "navigation";

export type AsyncProgressActivity = {
  id: number;
  kind: AsyncProgressKind;
  label: string;
  path?: string;
  method?: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  status: "active" | "completed" | "failed";
  error?: string;
};

export type BeginAsyncProgressInput = {
  label: string;
  kind?: AsyncProgressKind;
  path?: string;
  method?: string;
};

let nextOpId = 1;
const activeById = new Map<number, AsyncProgressActivity>();
const activeOrder: number[] = [];
let navigationOpId: number | null = null;
const completedTrace: AsyncProgressActivity[] = [];
let traceHydratedFromStorage = false;

function persistCompletedTraceToStorage() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      ADMIN_LOAD_DEBUG_TRACE_STORAGE_KEY,
      JSON.stringify(completedTrace),
    );
  } catch {
    /* quota or SSR */
  }
}

function hydrateCompletedTraceFromStorage() {
  if (traceHydratedFromStorage || typeof window === "undefined") return;
  traceHydratedFromStorage = true;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_LOAD_DEBUG_TRACE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as AsyncProgressActivity[];
    if (!Array.isArray(parsed)) return;
    completedTrace.length = 0;
    for (const entry of parsed) {
      if (entry && typeof entry.id === "number" && entry.label) {
        completedTrace.push(entry);
      }
    }
    rebuildCaches();
  } catch {
    /* ignore corrupt storage */
  }
}

function ensureTraceHydrated() {
  hydrateCompletedTraceFromStorage();
}

const listeners = new Set<Listener>();
let cachedMessages: string[] = [];
let cachedMessagesKey = "";
let cachedActivitiesSnapshot: {
  active: AsyncProgressActivity[];
  completed: AsyncProgressActivity[];
} = { active: [], completed: [] };

function rebuildCaches() {
  const messages: string[] = [];
  const seen = new Set<string>();
  for (const id of activeOrder) {
    const op = activeById.get(id);
    if (!op) continue;
    if (!seen.has(op.label)) {
      seen.add(op.label);
      messages.push(op.label);
    }
  }
  const key = messages.join("\0");
  if (key !== cachedMessagesKey) {
    cachedMessagesKey = key;
    cachedMessages = messages;
  }

  cachedActivitiesSnapshot = {
    active: activeOrder
      .map((id) => activeById.get(id))
      .filter((op): op is AsyncProgressActivity => Boolean(op)),
    completed: [...completedTrace],
  };
}

function notify() {
  rebuildCaches();
  for (const listener of listeners) {
    listener();
  }
}

rebuildCaches();

export function subscribeGlobalProgress(listener: Listener) {
  ensureTraceHydrated();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isGlobalProgressActive() {
  return activeOrder.length > 0;
}

/** Distinct user-facing messages for in-flight work. */
export function getGlobalProgressMessages(): readonly string[] {
  return cachedMessages;
}

export function getAsyncProgressActivities(): {
  active: readonly AsyncProgressActivity[];
  completed: readonly AsyncProgressActivity[];
} {
  ensureTraceHydrated();
  return cachedActivitiesSnapshot;
}

function normalizeBeginInput(
  labelOrDetails?: string | BeginAsyncProgressInput,
): BeginAsyncProgressInput {
  if (typeof labelOrDetails === "string") {
    return { label: labelOrDetails, kind: "api" };
  }
  if (labelOrDetails) {
    return { kind: "api", ...labelOrDetails };
  }
  return { label: "Syncing with database…", kind: "api" };
}

function finalizeActivity(activity: AsyncProgressActivity, error?: string) {
  activity.endedAt = Date.now();
  activity.durationMs = activity.endedAt - activity.startedAt;
  activity.status = error ? "failed" : "completed";
  if (error) activity.error = error;
  completedTrace.push({ ...activity });
  persistCompletedTraceToStorage();
}

/** Tracks in-flight admin API / async DB operations. Returns a token for `endAsyncProgress`. */
export function beginAsyncProgress(labelOrDetails?: string | BeginAsyncProgressInput): number {
  const details = normalizeBeginInput(labelOrDetails);
  const id = nextOpId++;
  const activity: AsyncProgressActivity = {
    id,
    kind: details.kind ?? "api",
    label: details.label,
    path: details.path,
    method: details.method,
    startedAt: Date.now(),
    status: "active",
  };
  activeById.set(id, activity);
  activeOrder.push(id);
  notify();
  return id;
}

export function endAsyncProgress(token: number, error?: string) {
  const activity = activeById.get(token);
  if (!activity) return;
  const idx = activeOrder.indexOf(token);
  if (idx >= 0) activeOrder.splice(idx, 1);
  activeById.delete(token);
  finalizeActivity(activity, error);
  if (navigationOpId === token) navigationOpId = null;
  notify();
}

export async function withAsyncProgress<T>(
  fn: () => Promise<T>,
  labelOrDetails?: string | BeginAsyncProgressInput,
): Promise<T> {
  const token = beginAsyncProgress(labelOrDetails);
  let progressError: string | undefined;
  try {
    return await fn();
  } catch (e) {
    progressError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    endAsyncProgress(token, progressError);
  }
}

export function setNavigationProgressActive(active: boolean) {
  if (active) {
    if (navigationOpId === null) {
      navigationOpId = beginAsyncProgress({
        label: "Opening page…",
        kind: "navigation",
      });
    }
    return;
  }
  if (navigationOpId !== null) {
    endAsyncProgress(navigationOpId);
    navigationOpId = null;
  }
}

export type AsyncProgressDebugExport = {
  exportedAt: string;
  url: string;
  userAgent: string;
  summary: {
    activeCount: number;
    completedCount: number;
    slowestCompletedMs: number | null;
    totalCompletedDurationMs: number;
  };
  active: AsyncProgressActivity[];
  completed: AsyncProgressActivity[];
};

export function buildAsyncProgressDebugExport(
  now = Date.now(),
): AsyncProgressDebugExport {
  const { active, completed } = getAsyncProgressActivities();
  const activeWithElapsed = active.map((op) => ({
    ...op,
    durationMs: now - op.startedAt,
  }));
  const completedDurations = completed
    .map((op) => op.durationMs ?? 0)
    .filter((ms) => ms > 0);
  const totalCompletedDurationMs = completedDurations.reduce((a, b) => a + b, 0);
  const slowestCompletedMs =
    completedDurations.length > 0 ? Math.max(...completedDurations) : null;

  return {
    exportedAt: new Date(now).toISOString(),
    url: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    summary: {
      activeCount: active.length,
      completedCount: completed.length,
      slowestCompletedMs,
      totalCompletedDurationMs,
    },
    active: activeWithElapsed,
    completed: [...completed],
  };
}

export function clearAsyncProgressDebugTrace() {
  completedTrace.length = 0;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(ADMIN_LOAD_DEBUG_TRACE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  notify();
}
