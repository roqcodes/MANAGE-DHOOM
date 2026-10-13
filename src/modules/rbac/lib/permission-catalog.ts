import { Shield } from "lucide-react";

import { UserRole } from "@/common/auth/types";
import {
  ADMIN_DASHBOARD_ITEM,
  ADMIN_EXTRA_NAV_ITEMS,
  ADMIN_NAV_SECTIONS,
  type AdminNavItem,
  type AdminNavSection,
} from "@/modules/admin/lib/admin-nav-items";

export type RbacAccess = { read: boolean; write: boolean };

export type RbacSession = {
  roleId: string | null;
  roleSlug: string;
  roleName: string;
  kind: "system" | "custom";
  isSuperAdmin: boolean;
  canManageRoles: boolean;
  permissions: Record<string, RbacAccess>;
  storeOverrides: Record<string, Record<string, RbacAccess>>;
  storeIds: string[];
};

export const ROLES_HREF = "/admin/settings/roles";
export const USERS_HREF = "/admin/users";

export const RBAC_ROLES_NAV_ITEM: AdminNavItem = {
  name: "Roles & access",
  href: ROLES_HREF,
  icon: Shield,
  keywords: ["rbac", "permissions", "roles", "staff access"],
};

export function permissionKeyForHref(href: string): string {
  const path = href.split("?")[0] ?? href;
  if (path === "/admin" || path === "/admin/") return "page.dashboard";
  if (path === ROLES_HREF) return "page.roles";
  const trimmed = path.replace(/^\/admin\/?/, "").replace(/\/+$/, "");
  if (!trimmed) return "page.dashboard";
  return `page.${trimmed.replace(/\//g, ".")}`;
}

export function hrefForPermissionKey(key: string): string {
  if (key === "page.dashboard") return "/admin";
  if (key === "page.roles") return ROLES_HREF;
  return `/admin/${key.replace(/^page\./, "").replace(/\./g, "/")}`;
}

export function allNavItemsForRbac(): AdminNavItem[] {
  return [
    ADMIN_DASHBOARD_ITEM,
    ...ADMIN_NAV_SECTIONS.flatMap((s) => s.items),
    ...ADMIN_EXTRA_NAV_ITEMS,
    RBAC_ROLES_NAV_ITEM,
  ];
}

export function permissionGroups(): Array<{
  label: string;
  items: AdminNavItem[];
}> {
  const seen = new Set<string>();
  const groups: Array<{ label: string; items: AdminNavItem[] }> = [
    { label: "Home", items: [ADMIN_DASHBOARD_ITEM] },
    ...ADMIN_NAV_SECTIONS.map((s: AdminNavSection) => ({
      label: s.label,
      items: s.items,
    })),
    { label: "Account", items: ADMIN_EXTRA_NAV_ITEMS },
  ];

  const deduped = groups.map((g) => ({
    label: g.label,
    items: g.items.filter((item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    }),
  }));

  if (!seen.has(RBAC_ROLES_NAV_ITEM.href)) {
    deduped.push({ label: "Access control", items: [RBAC_ROLES_NAV_ITEM] });
  }

  return deduped.filter((g) => g.items.length > 0);
}

/** Flat list for permission matrix search. */
export function permissionMatrixEntries(): Array<{
  group: string;
  item: AdminNavItem;
  key: string;
}> {
  return permissionGroups().flatMap((g) =>
    g.items.map((item) => ({
      group: g.label,
      item,
      key: permissionKeyForHref(item.href),
    })),
  );
}

export function resolveRbacAccess(
  session: RbacSession | null | undefined,
  href: string,
  storeId?: string | null,
): RbacAccess {
  if (!session) return { read: false, write: false };
  if (session.isSuperAdmin) return { read: true, write: true };
  const key = permissionKeyForHref(href);
  const base = session.permissions[key] ?? { read: false, write: false };
  if (storeId && session.storeOverrides[storeId]?.[key]) {
    return session.storeOverrides[storeId][key]!;
  }
  return base;
}

export function adminPathPrefixes(pathname: string): string[] {
  const path = pathname.split("?")[0] ?? pathname;
  if (path === "/admin" || path === "/admin/") return ["/admin"];
  const parts = path.replace(/^\/admin\/?/, "").split("/").filter(Boolean);
  const hrefs: string[] = [];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    hrefs.push(`/admin/${acc}`);
  }
  return hrefs.reverse();
}

function permissionDefined(
  session: RbacSession | null | undefined,
  key: string,
  storeId?: string | null,
): boolean {
  if (!session) return false;
  if (session.permissions[key] !== undefined) return true;
  if (storeId && session.storeOverrides[storeId]?.[key] !== undefined) return true;
  return false;
}

/** Child routes inherit the nearest parent path that has an explicit permission row. */
export function canReadAdminPath(
  session: RbacSession | null | undefined,
  pathname: string,
  storeId?: string | null,
): boolean {
  if (session?.isSuperAdmin) return true;
  for (const href of adminPathPrefixes(pathname)) {
    const key = permissionKeyForHref(href);
    if (permissionDefined(session, key, storeId)) {
      return resolveRbacAccess(session, href, storeId).read;
    }
  }
  return canReadPage(session, "/admin", storeId);
}

export function canReadPage(
  session: RbacSession | null | undefined,
  href: string,
  storeId?: string | null,
): boolean {
  if (session?.isSuperAdmin) return true;
  return resolveRbacAccess(session, href, storeId).read;
}

export function canWritePage(
  session: RbacSession | null | undefined,
  href: string,
  storeId?: string | null,
): boolean {
  if (session?.isSuperAdmin) return true;
  return resolveRbacAccess(session, href, storeId).write;
}

export function firstAllowedAdminHref(
  session: RbacSession | null | undefined,
  storeId?: string | null,
): string {
  for (const item of allNavItemsForRbac()) {
    if (canReadPage(session, item.href, storeId)) return item.href;
  }
  return "/admin";
}

/** Used when DB RBAC is not migrated yet — keeps admin usable. */
export function legacyRbacFallback(role: UserRole | null): RbacSession | null {
  if (!role) return null;
  if (role === UserRole.SuperAdmin) {
    return {
      roleId: null,
      roleSlug: "super_admin",
      roleName: "Super Admin",
      kind: "system",
      isSuperAdmin: true,
      canManageRoles: true,
      permissions: {},
      storeOverrides: {},
      storeIds: [],
    };
  }
  if (role === UserRole.Admin || role === UserRole.Manager) {
    const perms: Record<string, RbacAccess> = {};
    for (const item of allNavItemsForRbac()) {
      const key = permissionKeyForHref(item.href);
      if (key === "page.roles") continue;
      perms[key] = { read: true, write: true };
    }
    return {
      roleId: null,
      roleSlug: role,
      roleName: role,
      kind: "system",
      isSuperAdmin: false,
      canManageRoles: false,
      permissions: perms,
      storeOverrides: {},
      storeIds: [],
    };
  }
  return null;
}

export function parseRbacSession(raw: unknown): RbacSession | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    roleId: typeof o.roleId === "string" ? o.roleId : null,
    roleSlug: String(o.roleSlug ?? ""),
    roleName: String(o.roleName ?? o.roleSlug ?? ""),
    kind: o.kind === "custom" ? "custom" : "system",
    isSuperAdmin: o.isSuperAdmin === true,
    canManageRoles: o.canManageRoles === true || o.isSuperAdmin === true,
    permissions: (o.permissions ?? {}) as Record<string, RbacAccess>,
    storeOverrides: (o.storeOverrides ?? {}) as Record<
      string,
      Record<string, RbacAccess>
    >,
    storeIds: Array.isArray(o.storeIds)
      ? o.storeIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}
