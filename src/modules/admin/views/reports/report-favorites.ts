"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { getReportBySlug, type ReportDefinition } from "@/common/erp/report-types";
import { adminGet, adminPost, adminPut } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

const LEGACY_STORAGE_KEY = "dhoom.admin.report-favorites.v1";

function readLegacyLocalSlugs(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string" && s.length > 0);
  } catch {
    return [];
  }
}

function clearLegacyLocalSlugs() {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function fetchReportFavoriteSlugs(): Promise<string[]> {
  const res = await adminGet<{ slugs: string[] }>("erp/report-favorites");
  return res.slugs ?? [];
}

export function useReportFavorites() {
  const queryClient = useQueryClient();
  const queryKey = adminQueryKeys.reportFavorites();

  const query = useQuery({
    queryKey,
    queryFn: fetchReportFavoriteSlugs,
    staleTime: 60_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (slug: string) => {
      const res = await adminPost<{ slugs: string[] }>("erp/report-favorites", { slug });
      return res.slugs ?? [];
    },
    onMutate: async (slug) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<string[]>(queryKey) ?? [];
      const next = new Set(previous);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      queryClient.setQueryData(queryKey, [...next]);
      return { previous };
    },
    onError: (_err, _slug, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess: (slugs) => {
      queryClient.setQueryData(queryKey, slugs);
    },
  });

  const migrateLegacy = useCallback(async () => {
    const legacy = readLegacyLocalSlugs();
    if (legacy.length === 0) return;
    const current = queryClient.getQueryData<string[]>(queryKey) ?? [];
    if (current.length > 0) {
      clearLegacyLocalSlugs();
      return;
    }
    const merged = [...new Set(legacy.filter((s) => getReportBySlug(s)))];
    if (merged.length === 0) {
      clearLegacyLocalSlugs();
      return;
    }
    const res = await adminPut<{ slugs: string[] }>("erp/report-favorites", { slugs: merged });
    queryClient.setQueryData(queryKey, res.slugs ?? merged);
    clearLegacyLocalSlugs();
  }, [queryClient, queryKey]);

  const legacyMigrated = useRef(false);
  useEffect(() => {
    if (!query.isSuccess || legacyMigrated.current) return;
    legacyMigrated.current = true;
    void migrateLegacy();
  }, [query.isSuccess, migrateLegacy]);

  const slugs = query.data ?? [];

  const reports = useMemo(
    () =>
      slugs
        .map((slug) => getReportBySlug(slug))
        .filter((r): r is ReportDefinition => Boolean(r)),
    [slugs],
  );

  const toggle = useCallback(
    (slug: string) => {
      toggleMutation.mutate(slug);
    },
    [toggleMutation],
  );

  const isFavorite = useCallback((slug: string) => slugs.includes(slug), [slugs]);

  return {
    slugs,
    reports,
    toggle,
    isFavorite,
    loading: query.isLoading,
    toggling: toggleMutation.isPending,
  };
}
