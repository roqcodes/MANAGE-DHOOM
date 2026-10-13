"use client";

import { useMemo } from "react";

import type { AdminNavItem, AdminNavSection } from "@/modules/admin/lib/admin-nav-items";
import {
  ADMIN_DASHBOARD_ITEM,
  ADMIN_NAV_SECTIONS,
} from "@/modules/admin/lib/admin-nav-items";
import { isAdminRouteHidden } from "@/modules/admin/lib/hidden-admin-routes";
import type { RbacSession } from "@/modules/rbac/lib/permission-catalog";
import { canReadPage } from "@/modules/rbac/lib/permission-catalog";

function filterNavItems(
  items: AdminNavItem[],
  rbac: RbacSession | null | undefined,
  storeId?: string | null,
): AdminNavItem[] {
  return items.filter(
    (item) =>
      !isAdminRouteHidden(item.href) &&
      canReadPage(rbac, item.href, storeId),
  );
}

export function useRbacNavSections(
  rbac: RbacSession | null | undefined,
  storeId?: string | null,
): AdminNavSection[] {
  return useMemo(
    () =>
      ADMIN_NAV_SECTIONS.map((section) => ({
        ...section,
        items: filterNavItems(section.items, rbac, storeId),
      })).filter((section) => section.items.length > 0),
    [rbac, storeId],
  );
}

export function useCanReadAdminPage(
  rbac: RbacSession | null | undefined,
  href: string,
  storeId?: string | null,
): boolean {
  return canReadPage(rbac, href, storeId);
}

export function useDashboardNavItem(
  rbac: RbacSession | null | undefined,
  storeId?: string | null,
): AdminNavItem | null {
  return useMemo(() => {
    if (!canReadPage(rbac, ADMIN_DASHBOARD_ITEM.href, storeId)) return null;
    return ADMIN_DASHBOARD_ITEM;
  }, [rbac, storeId]);
}
