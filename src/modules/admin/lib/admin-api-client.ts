/** Browser fetch for `/api/admin/*` — cookies sent on same origin. */
import {
  beginAdminPrimaryGet,
  endAdminPrimaryGet,
} from "@/modules/admin/lib/admin-primary-get";
import {
  beginAsyncProgress,
  endAsyncProgress,
} from "@/modules/navigation/lib/async-progress";
import { labelForAdminApiRequest } from "@/modules/navigation/lib/admin-api-progress-label";
function parseAdminApiError(status: number, statusText: string, body: string): string {
  if (body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html")) {
    return `${status} ${statusText} — API route not found`;
  }
  try {
    const j = JSON.parse(body) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* use raw */
  }
  return body || `${status} ${statusText}`;
}

async function adminFetch<T>(
  pathAndQuery: string,
  init?: RequestInit,
): Promise<T> {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery.slice(1) : pathAndQuery;
  const method = init?.method ?? "GET";
  const progressToken = beginAsyncProgress({
    label: labelForAdminApiRequest(path, method),
    kind: "api",
    path: `/api/admin/${path}`,
    method,
  });
  const trackPrimaryGet = method === "GET";
  if (trackPrimaryGet) beginAdminPrimaryGet(path);
  let progressError: string | undefined;
  try {
    const res = await fetch(`/api/admin/${path}`, {
      credentials: "include",
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(parseAdminApiError(res.status, res.statusText, t));
    }
    return (await res.json()) as T;
  } catch (e) {
    progressError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    if (trackPrimaryGet) endAdminPrimaryGet(path);
    endAsyncProgress(progressToken, progressError);
  }
}

export async function adminGet<T>(pathAndQuery: string): Promise<T> {
  return adminFetch<T>(pathAndQuery);
}

export async function adminPost<T>(pathAndQuery: string, body: unknown): Promise<T> {
  return adminFetch<T>(pathAndQuery, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function adminPut<T>(pathAndQuery: string, body: unknown): Promise<T> {
  return adminFetch<T>(pathAndQuery, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function adminPatch<T>(pathAndQuery: string, body: unknown): Promise<T> {
  return adminFetch<T>(pathAndQuery, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function adminDelete<T = { ok: boolean }>(pathAndQuery: string): Promise<T> {
  return adminFetch<T>(pathAndQuery, { method: "DELETE" });
}

/** Returns `null` when the API responds with 404 (e.g. missing entity). */
export async function adminGetNullable<T>(pathAndQuery: string): Promise<T | null> {
  const path = pathAndQuery.startsWith("/") ? pathAndQuery.slice(1) : pathAndQuery;
  const progressToken = beginAsyncProgress({
    label: labelForAdminApiRequest(path, "GET"),
    kind: "api",
    path: `/api/admin/${path}`,
    method: "GET",
  });
  beginAdminPrimaryGet(path);
  let progressError: string | undefined;
  try {
    const res = await fetch(`/api/admin/${path}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const t = await res.text();
      throw new Error(parseAdminApiError(res.status, res.statusText, t));
    }
    return res.json() as Promise<T>;
  } catch (e) {
    progressError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    endAdminPrimaryGet(path);
    endAsyncProgress(progressToken, progressError);
  }
}
