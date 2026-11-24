import {
  createWorkspaceTab,
  type AdminWorkspaceTab,
} from "@/modules/admin/lib/admin-workspace-tabs";

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = "buyhub.admin.workspace-tabs";

export type PersistedWorkspaceTab = {
  rootHref: string;
  href: string;
  label: string;
};

export type PersistedWorkspaceState = {
  version: number;
  tabs: PersistedWorkspaceTab[];
  activeRootHref: string | null;
};

function storageKey(scopeId: string) {
  return `${STORAGE_PREFIX}.${scopeId || "default"}`;
}

export function readPersistedWorkspaceTabs(scopeId: string): PersistedWorkspaceState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scopeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedWorkspaceState;
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.tabs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePersistedWorkspaceTabs(
  scopeId: string,
  state: Pick<PersistedWorkspaceState, "tabs" | "activeRootHref">,
) {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedWorkspaceState = {
      version: STORAGE_VERSION,
      tabs: state.tabs,
      activeRootHref: state.activeRootHref,
    };
    window.localStorage.setItem(storageKey(scopeId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function clearPersistedWorkspaceTabs(scopeId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(scopeId));
  } catch {
    /* ignore */
  }
}

export function hydrateWorkspaceTabsFromPersistence(
  persisted: PersistedWorkspaceTab[],
): AdminWorkspaceTab[] {
  const byRoot = new Map<string, AdminWorkspaceTab>();
  for (const row of persisted) {
    if (!row.rootHref?.startsWith("/admin")) continue;
    const tab = createWorkspaceTab(row.rootHref, row.href || row.rootHref);
    byRoot.set(tab.rootHref, { ...tab, label: row.label || tab.label });
  }
  return [...byRoot.values()];
}

export function serializeWorkspaceTabsForPersistence(
  tabs: AdminWorkspaceTab[],
): PersistedWorkspaceTab[] {
  return tabs.map((t) => ({
    rootHref: t.rootHref,
    href: t.href,
    label: t.label,
  }));
}