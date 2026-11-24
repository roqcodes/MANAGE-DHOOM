"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  ADMIN_WORKSPACE_MAX_TABS,
  buildAdminHref,
  createWorkspaceTab,
  normalizeAdminPath,
  resolveAdminWorkspaceRoot,
  type AdminWorkspaceTab,
} from "@/modules/admin/lib/admin-workspace-tabs";
import { suppressWorkspaceNavigationProgress } from "@/modules/admin/lib/admin-workspace-navigation";
import {
  clearPersistedWorkspaceTabs,
  hydrateWorkspaceTabsFromPersistence,
  readPersistedWorkspaceTabs,
  serializeWorkspaceTabsForPersistence,
  writePersistedWorkspaceTabs,
} from "@/modules/admin/lib/admin-workspace-tabs-persistence";

type AdminWorkspaceTabsContextValue = {
  tabs: AdminWorkspaceTab[];
  activeRootHref: string | null;
  visitedRoots: ReadonlySet<string>;
  isWorkspaceTabLoading: boolean;
  openFromSidebar: (navHref: string, event?: { preventDefault(): void }) => void;
  activateTab: (rootHref: string) => void;
  closeTab: (rootHref: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
};

const AdminWorkspaceTabsContext = createContext<AdminWorkspaceTabsContextValue | null>(
  null,
);

function insertTabWithLimit(prev: AdminWorkspaceTab[], tab: AdminWorkspaceTab): AdminWorkspaceTab[] {
  const withoutDup = prev.filter((t) => t.rootHref !== tab.rootHref);
  const next = [...withoutDup, tab];
  if (next.length <= ADMIN_WORKSPACE_MAX_TABS) return next;
  return next.slice(next.length - ADMIN_WORKSPACE_MAX_TABS);
}

function mergeTabsWithPersisted(
  prev: AdminWorkspaceTab[],
  persisted: AdminWorkspaceTab[],
): AdminWorkspaceTab[] {
  const map = new Map<string, AdminWorkspaceTab>();
  for (const tab of persisted) map.set(tab.rootHref, tab);
  for (const tab of prev) map.set(tab.rootHref, tab);
  const merged = [...map.values()];
  if (merged.length <= ADMIN_WORKSPACE_MAX_TABS) return merged;
  return merged.slice(merged.length - ADMIN_WORKSPACE_MAX_TABS);
}

function pushWorkspaceHref(router: ReturnType<typeof useRouter>, href: string) {
  suppressWorkspaceNavigationProgress();
  const path = href.split("?")[0] ?? href;
  try {
    router.prefetch(path);
  } catch {
    /* prefetch optional */
  }
  startTransition(() => {
    router.push(href, { scroll: false });
  });
}

function markVisited(
  setVisitedRoots: Dispatch<SetStateAction<Set<string>>>,
  rootHref: string,
) {
  setVisitedRoots((prev) => {
    if (prev.has(rootHref)) return prev;
    const next = new Set(prev);
    next.add(rootHref);
    return next;
  });
}

const WORKSPACE_TAB_LOADING_MAX_MS = 12_000;

function upsertTabHref(
  prev: AdminWorkspaceTab[],
  root: string,
  fullHref: string,
  mergePersisted: boolean,
  persisted: AdminWorkspaceTab[],
): AdminWorkspaceTab[] {
  const base = mergePersisted ? mergeTabsWithPersisted(prev, persisted) : prev;
  const idx = base.findIndex((t) => t.rootHref === root);
  if (idx >= 0) {
    const next = [...base];
    next[idx] = { ...next[idx]!, href: fullHref };
    return next;
  }
  const tab = createWorkspaceTab(root, fullHref);
  return insertTabWithLimit(base, tab);
}

export function AdminWorkspaceTabsProvider({
  children,
  persistenceScopeId = "",
}: {
  children: ReactNode;
  persistenceScopeId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/admin";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const fullHref = buildAdminHref(pathname, search ? `?${search}` : "");

  const persistedTabsRef = useRef<AdminWorkspaceTab[]>([]);
  const persistenceReady = useRef(false);

  const [tabs, setTabs] = useState<AdminWorkspaceTab[]>([]);
  const [activeRootHref, setActiveRootHref] = useState<string | null>(null);
  const [visitedRoots, setVisitedRoots] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const path = window.location.pathname;
    if (!path.startsWith("/admin")) return new Set();
    return new Set([resolveAdminWorkspaceRoot(path)]);
  });
  const [isWorkspaceTabLoading, setIsWorkspaceTabLoading] = useState(false);
  const pendingNavigationRootRef = useRef<string | null>(null);
  const activeRootHrefRef = useRef<string | null>(null);
  const scopeRef = useRef(persistenceScopeId);
  scopeRef.current = persistenceScopeId;
  activeRootHrefRef.current = activeRootHref;

  useLayoutEffect(() => {
    const stored = readPersistedWorkspaceTabs(persistenceScopeId);
    if (stored?.tabs?.length) {
      const hydrated = hydrateWorkspaceTabsFromPersistence(stored.tabs);
      persistedTabsRef.current = hydrated;
      setTabs(hydrated);
      setVisitedRoots((prev) => {
        const next = new Set(prev);
        for (const tab of hydrated) next.add(tab.rootHref);
        return next;
      });
    }
    persistenceReady.current = true;
  }, [persistenceScopeId]);

  useLayoutEffect(() => {
    const path = normalizeAdminPath(pathname);
    if (!path.startsWith("/admin")) return;
    const root = resolveAdminWorkspaceRoot(path);
    const intent = activeRootHrefRef.current ?? root;
    if (root === intent) {
      setIsWorkspaceTabLoading(false);
      if (pendingNavigationRootRef.current === root) {
        pendingNavigationRootRef.current = null;
      }
    }
  }, [pathname, fullHref]);

  useEffect(() => {
    function onStoreChanged() {
      clearPersistedWorkspaceTabs(scopeRef.current);
      setTabs([]);
      setActiveRootHref(null);
      activeRootHrefRef.current = null;
      pendingNavigationRootRef.current = null;
      setIsWorkspaceTabLoading(false);
      setVisitedRoots(new Set());
      persistedTabsRef.current = [];
    }
    window.addEventListener("buyhub:erp-store-changed", onStoreChanged);
    return () => window.removeEventListener("buyhub:erp-store-changed", onStoreChanged);
  }, []);

  useEffect(() => {
    const path = normalizeAdminPath(pathname);
    if (!path.startsWith("/admin")) return;
    const root = resolveAdminWorkspaceRoot(path);
    const pendingRoot = pendingNavigationRootRef.current;
    const mergePersisted = persistenceReady.current;

    markVisited(setVisitedRoots, root);

    if (pendingRoot) {
      if (root === pendingRoot) {
        pendingNavigationRootRef.current = null;
        setIsWorkspaceTabLoading(false);
        activeRootHrefRef.current = root;
        setActiveRootHref(root);
        setTabs((prev) =>
          upsertTabHref(prev, root, fullHref, mergePersisted, persistedTabsRef.current),
        );
        if (persistenceReady.current) persistedTabsRef.current = [];
        return;
      }
      pendingNavigationRootRef.current = null;
      setIsWorkspaceTabLoading(false);
    }

    activeRootHrefRef.current = root;
    setActiveRootHref(root);
    setIsWorkspaceTabLoading(false);
    setTabs((prev) =>
      upsertTabHref(prev, root, fullHref, mergePersisted, persistedTabsRef.current),
    );
    if (persistenceReady.current) persistedTabsRef.current = [];
  }, [fullHref, pathname]);

  useEffect(() => {
    if (!isWorkspaceTabLoading) return;
    const timeout = window.setTimeout(() => {
      setIsWorkspaceTabLoading(false);
      pendingNavigationRootRef.current = null;
    }, WORKSPACE_TAB_LOADING_MAX_MS);
    return () => window.clearTimeout(timeout);
  }, [isWorkspaceTabLoading]);

  useEffect(() => {
    if (!persistenceReady.current || tabs.length === 0) return;
    writePersistedWorkspaceTabs(scopeRef.current, {
      tabs: serializeWorkspaceTabsForPersistence(tabs),
      activeRootHref,
    });
  }, [tabs, activeRootHref]);

  const beginTabNavigation = useCallback((rootHref: string, href: string) => {
    markVisited(setVisitedRoots, rootHref);
    const routeRoot = resolveAdminWorkspaceRoot(pathname);
    const needsRouteChange = rootHref !== routeRoot || fullHref !== href;
    pendingNavigationRootRef.current = rootHref;
    activeRootHrefRef.current = rootHref;
    setActiveRootHref(rootHref);
    if (needsRouteChange) {
      setIsWorkspaceTabLoading(true);
    } else {
      pendingNavigationRootRef.current = null;
      setIsWorkspaceTabLoading(false);
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.rootHref === rootHref);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx]!, href };
        return next;
      });
      return;
    }
    pushWorkspaceHref(router, href);
  }, [fullHref, pathname, router]);

  const openFromSidebar = useCallback(
    (navHref: string, event?: { preventDefault(): void }) => {
      const root = normalizeAdminPath(navHref);
      const existing = tabs.find((t) => t.rootHref === root);
      if (existing) {
        event?.preventDefault();
        beginTabNavigation(root, existing.href);
      }
    },
    [beginTabNavigation, tabs],
  );

  const activateTab = useCallback(
    (rootHref: string) => {
      const tab = tabs.find((t) => t.rootHref === rootHref);
      if (!tab) return;
      if (activeRootHref === rootHref && resolveAdminWorkspaceRoot(pathname) === rootHref) {
        return;
      }
      beginTabNavigation(rootHref, tab.href);
    },
    [tabs, activeRootHref, pathname, beginTabNavigation],
  );

  const closeTab = useCallback(
    (rootHref: string) => {
      setVisitedRoots((prev) => {
        if (!prev.has(rootHref)) return prev;
        const next = new Set(prev);
        next.delete(rootHref);
        return next;
      });

      let fallbackTab: AdminWorkspaceTab | null = null;

      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const index = prev.findIndex((t) => t.rootHref === rootHref);
        if (index < 0) return prev;
        const next = prev.filter((t) => t.rootHref !== rootHref);
        if (activeRootHref === rootHref && next.length > 0) {
          fallbackTab = next[Math.min(index, next.length - 1)]!;
        }
        return next;
      });

      if (fallbackTab) {
        const { rootHref: nextRoot, href: nextHref } = fallbackTab;
        queueMicrotask(() => beginTabNavigation(nextRoot, nextHref));
      }
    },
    [activeRootHref, beginTabNavigation],
  );

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return prev;
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      tabs,
      activeRootHref,
      visitedRoots,
      isWorkspaceTabLoading,
      openFromSidebar,
      activateTab,
      closeTab,
      reorderTabs,
    }),
    [
      tabs,
      activeRootHref,
      visitedRoots,
      isWorkspaceTabLoading,
      openFromSidebar,
      activateTab,
      closeTab,
      reorderTabs,
    ],
  );

  return (
    <AdminWorkspaceTabsContext.Provider value={value}>
      {children}
    </AdminWorkspaceTabsContext.Provider>
  );
}

export function useAdminWorkspaceTabs() {
  const ctx = useContext(AdminWorkspaceTabsContext);
  if (!ctx) {
    throw new Error("useAdminWorkspaceTabs must be used within AdminWorkspaceTabsProvider");
  }
  return ctx;
}

export function useAdminWorkspaceTabsOptional() {
  return useContext(AdminWorkspaceTabsContext);
}

export function AdminWorkspaceTabsScopeProvider({ children }: { children: ReactNode }) {
  const { activeStoreId } = useErpStores();
  const scope = activeStoreId || "default";
  return (
    <AdminWorkspaceTabsProvider persistenceScopeId={scope} key={scope}>
      {children}
    </AdminWorkspaceTabsProvider>
  );
}