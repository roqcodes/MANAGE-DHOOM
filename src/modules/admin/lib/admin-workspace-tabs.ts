import type { ComponentType } from "react";

import {
  ADMIN_DASHBOARD_ITEM,
  getAllAdminNavItems,
  type AdminNavItem,
} from "@/modules/admin/lib/admin-nav-items";

export const ADMIN_WORKSPACE_MAX_TABS = 5;

export type AdminWorkspaceTab = {
  rootHref: string;
  label: string;
  href: string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

const NAV_HREFS_LONGEST_FIRST = getAllAdminNavItems()
  .map((item) => item.href)
  .sort((a, b) => b.length - a.length);

export function normalizeAdminPath(pathname: string): string {
  const base = pathname.split("?")[0]?.replace(/\/+$/, "") || "/admin";
  if (base === "/admin") return "/admin";
  return base;
}

export function resolveAdminWorkspaceRoot(pathname: string): string {
  const path = normalizeAdminPath(pathname);
  if (path === "/admin") return "/admin";

  for (const href of NAV_HREFS_LONGEST_FIRST) {
    if (href === "/admin") continue;
    if (path === href || path.startsWith(`${href}/`)) return href;
  }

  return "/admin";
}

export function getAdminNavItemForHref(href: string): AdminNavItem {
  const exact = getAllAdminNavItems().find((item) => item.href === href);
  if (exact) return exact;
  return ADMIN_DASHBOARD_ITEM;
}

export function createWorkspaceTab(rootHref: string, href: string): AdminWorkspaceTab {
  const nav = getAdminNavItemForHref(rootHref);
  return {
    rootHref,
    label: nav.name,
    href,
    icon: nav.icon,
  };
}

export function buildAdminHref(pathname: string, search: string): string {
  if (!search) return pathname;
  return `${pathname}${search.startsWith("?") ? search : `?${search}`}`;
}