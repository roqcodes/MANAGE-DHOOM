"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

/** Stable query string so prefetch and the page share one cache entry. */
export function adminListPath(
  resource: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `${resource}?${qs}` : resource;
}

export function useAdminGetQuery<T>(options: {
  path: string;
  enabled?: boolean;
}) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: adminQueryKeys.erpGet(options.path),
    queryFn: () => adminGet<T>(options.path),
    enabled,
    placeholderData: keepPreviousData,
  });
}
