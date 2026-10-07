"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useIsFetching, useQuery, type Query } from "@tanstack/react-query";

import {
  getAdminPrimaryGetInFlight,
  subscribeAdminPrimaryGetInFlight,
} from "@/modules/admin/lib/admin-primary-get";
import { erpContextQueryOptions } from "@/modules/erp/components/use-erp-stores";

/**
 * Browsers typically allow ~6 HTTP/1.1 connections per origin. TanStack Query
 * has no query priority (see Query discussion #7526), so secondary shell
 * requests must stay disabled until the current page's primary query has a
 * chance to occupy a socket. Same idea as SAP Fiori (shell first, tile counts
 * later) and TanStack deferred loading (await critical, stream the rest).
 */
const SHELL_ONLY_SEGMENTS = new Set([
  "session",
  "erp-context",
  "nav-badges",
  "app-settings",
  "search-index",
]);

const NO_PRIMARY_QUERY_FALLBACK_MS = 2_500;

export function isAdminPrimaryPageQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key[0] !== "admin") return false;
  const segment = key[1];
  if (typeof segment !== "string") return true;
  if (SHELL_ONLY_SEGMENTS.has(segment)) return false;
  if (segment === "dashboard" && key[key.length - 1] === "extended") return false;
  return true;
}

type AdminBootstrapValue = {
  secondaryQueriesEnabled: boolean;
};

const AdminBootstrapContext = createContext<AdminBootstrapValue>({
  secondaryQueriesEnabled: false,
});

export function useAdminBootstrap() {
  return useContext(AdminBootstrapContext);
}

export function AdminBootstrapProvider({ children }: { children: ReactNode }) {
  const contextQuery = useQuery({
    ...erpContextQueryOptions,
    notifyOnChangeProps: ["isPending"],
  });
  const contextSettled = !contextQuery.isPending;

  const queryPrimaryFetching = useIsFetching({
    predicate: isAdminPrimaryPageQuery,
  });
  const httpPrimaryFetching = useSyncExternalStore(
    subscribeAdminPrimaryGetInFlight,
    getAdminPrimaryGetInFlight,
    () => 0,
  );
  const primaryFetching = queryPrimaryFetching + httpPrimaryFetching;

  const [sawPrimaryFetch, setSawPrimaryFetch] = useState(false);
  const [secondaryQueriesEnabled, setSecondaryQueriesEnabled] = useState(false);

  useEffect(() => {
    if (secondaryQueriesEnabled) return;
    if (primaryFetching > 0) setSawPrimaryFetch(true);
  }, [primaryFetching, secondaryQueriesEnabled]);

  useEffect(() => {
    if (!contextSettled || secondaryQueriesEnabled) return;
    if (sawPrimaryFetch && primaryFetching === 0) {
      setSecondaryQueriesEnabled(true);
    }
  }, [contextSettled, sawPrimaryFetch, primaryFetching, secondaryQueriesEnabled]);

  useEffect(() => {
    if (!contextSettled || secondaryQueriesEnabled || sawPrimaryFetch) return;
    const timer = window.setTimeout(() => {
      setSecondaryQueriesEnabled(true);
    }, NO_PRIMARY_QUERY_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [contextSettled, secondaryQueriesEnabled, sawPrimaryFetch]);

  const value = useMemo(
    () => ({ secondaryQueriesEnabled }),
    [secondaryQueriesEnabled],
  );

  return (
    <AdminBootstrapContext.Provider value={value}>{children}</AdminBootstrapContext.Provider>
  );
}
