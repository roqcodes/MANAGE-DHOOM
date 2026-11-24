"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import type { AdminNavBadge } from "@/common/admin/types";
import { cn } from "@/lib/utils";
import { INTERACTIVE_SIDEBAR_NAV_INACTIVE_HOVER } from "@/lib/ui/interactive-styles";
import {
  ADMIN_DASHBOARD_ITEM,
  type AdminNavItem,
  type AdminNavSection,
} from "@/modules/admin/lib/admin-nav-items";
import {
  adminNavBadgesQueryOptions,
  fetchAdminNavBadges,
} from "@/modules/admin/lib/admin-nav-badges-query";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { cancelScheduledAdminPrefetch, schedulePrefetchAdminRoute } from "@/modules/admin/lib/admin-prefetch-nav";
import { isAdminRouteHidden } from "@/modules/admin/lib/hidden-admin-routes";
import { useAdminBootstrap } from "@/modules/admin/providers/admin-bootstrap-provider";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";
import { BuyHubLogo } from "@/modules/brand/components/buyhub-logo";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import { useRbacNavSections, useDashboardNavItem } from "@/modules/rbac/hooks/use-rbac-nav";
import { resolveAdminWorkspaceRoot } from "@/modules/admin/lib/admin-workspace-tabs";
import { useAdminWorkspaceTabsOptional } from "@/modules/admin/providers/admin-workspace-tabs-provider";

const DASHBOARD_ITEM = ADMIN_DASHBOARD_ITEM;
/** Expanded sidebar width (was 260px). */
const SIDEBAR_WIDTH_EXPANDED_CLASS = "w-[232px]";
const SIDEBAR_WIDTH_COLLAPSED_CLASS = "md:w-[72px]";
const SIDEBAR_COLLAPSED_ICON_SIZE = 22;
const SIDEBAR_FLYOUT_VIEWPORT_MARGIN = 8;

type NavItem = AdminNavItem;
type NavSection = AdminNavSection;

function isNavOpenInWorkspace(openTabRoots: ReadonlySet<string>, href: string) {
  return openTabRoots.has(href);
}

function sectionHasOpenTab(openTabRoots: ReadonlySet<string>, items: NavItem[]) {
  return items.some((item) => openTabRoots.has(item.href));
}

function formatAlertCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

function alertToneClasses(tone: AdminNavBadge["tone"]) {
  switch (tone) {
    case "critical":
      return "bg-orange-100 text-orange-700";
    case "warning":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-sky-100 text-sky-700";
  }
}

function NavAlertBadge({ alert }: { alert: AdminNavBadge }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums leading-none",
        alertToneClasses(alert.tone),
      )}
      title={`${alert.count} need attention`}
      aria-label={`${alert.count} need attention`}
    >
      {formatAlertCount(alert.count)}
    </span>
  );
}

function sectionAlertCount(items: NavItem[], navAlerts: Record<string, AdminNavBadge>) {
  return items.reduce((sum, item) => sum + (navAlerts[item.href]?.count ?? 0), 0);
}

function NavLink({
  item,
  active,
  current = false,
  collapsed,
  nested = false,
  alert,
  onNavigate,
  onPrefetch,
  onSidebarWorkspace,
}: {
  item: NavItem;
  /** Workspace tab is open for this route. */
  active: boolean;
  /** This item matches the tab currently shown in the main panel. */
  current?: boolean;
  collapsed: boolean;
  nested?: boolean;
  alert?: AdminNavBadge;
  onNavigate?: () => void;
  onPrefetch: () => void;
  onSidebarWorkspace?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.name : undefined}
      onMouseEnter={onPrefetch}
      onClick={(event) => {
        onNavigate?.();
        onSidebarWorkspace?.(item.href, event);
      }}
      className={cn(
        "group relative flex items-center rounded-xl text-[13px] font-semibold transition-colors duration-150",
        nested
          ? collapsed
            ? "justify-center px-0 py-2"
            : "gap-2 py-1.5 pl-6 pr-3 text-[12px] font-medium"
          : collapsed
            ? "justify-center px-0 py-1"
            : "gap-2.5 px-3 py-2",
        active
          ? nested
            ? cn(
                "bg-[#EB205F]/8 text-[#EB205F]",
                current && "bg-[#EB205F]/12 ring-1 ring-[#EB205F]/20",
              )
            : cn(
                "bg-gradient-to-r from-[#EB205F]/10 to-transparent text-[#EB205F] shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset]",
                !current && "from-[#EB205F]/6 opacity-95",
              )
          : nested
            ? cn("text-slate-500", INTERACTIVE_SIDEBAR_NAV_INACTIVE_HOVER)
            : cn("text-slate-500", INTERACTIVE_SIDEBAR_NAV_INACTIVE_HOVER),
      )}
    >
      {!nested && active ? (
        <div
          className={cn(
            "absolute left-0 h-5 w-1 rounded-r-full bg-[#EB205F]",
            current
              ? "shadow-[0_0_8px_rgba(235,32,95,0.35)]"
              : "opacity-60 shadow-none",
          )}
        />
      ) : null}
      {nested && !collapsed ? (
        <span
          className="flex size-4 shrink-0 items-center justify-center transition-colors duration-150"
          aria-hidden
        >
          <Icon
            className={cn(
              "size-3.5 stroke-[1.75]",
              active ? "text-[#EB205F]" : "text-slate-400 group-hover:text-slate-600",
            )}
          />
        </span>
      ) : (
        <Icon
          size={collapsed ? (nested ? 16 : SIDEBAR_COLLAPSED_ICON_SIZE) : 18}
          className={cn(
            "shrink-0 transition-colors duration-150",
            active ? "text-[#EB205F]" : "text-slate-400 group-hover:text-slate-600",
          )}
        />
      )}
      {collapsed ? (
        <span className="sr-only">
          {item.name}
          {alert ? ` (${alert.count} need attention)` : ""}
        </span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          {alert ? <NavAlertBadge alert={alert} /> : null}
          {!alert && item.badge ? (
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                item.badge === "Coming soon"
                  ? "bg-slate-100 text-slate-500"
                  : "bg-[#EB205F]/10 text-[#EB205F]",
              )}
            >
              {item.badge}
            </span>
          ) : null}
        </>
      )}
      {collapsed && alert ? (
        <span className="absolute right-1 top-1">
          <NavAlertBadge alert={alert} />
        </span>
      ) : null}
    </Link>
  );
}

function NavSectionGroup({
  section,
  openTabRoots,
  activeRootHref,
  collapsed,
  navAlerts,
  onNavigate,
  onPrefetch,
  open,
  onToggle,
  flyoutOpen,
  onFlyoutOpen,
  onFlyoutClose,
  onSidebarWorkspace,
}: {
  section: NavSection;
  openTabRoots: ReadonlySet<string>;
  activeRootHref: string | null;
  collapsed: boolean;
  navAlerts: Record<string, AdminNavBadge>;
  onNavigate?: () => void;
  onPrefetch: (href: string) => void;
  open: boolean;
  onToggle: () => void;
  flyoutOpen: boolean;
  onFlyoutOpen: () => void;
  onFlyoutClose: () => void;
  onSidebarWorkspace?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const visibleItems = section.items.filter((item) => !isAdminRouteHidden(item.href));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null);

  const updateFlyoutPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = rect.right;
    let top = rect.top;

    const flyout = flyoutRef.current;
    if (flyout) {
      const flyoutHeight = flyout.getBoundingClientRect().height;
      const maxTop = window.innerHeight - flyoutHeight - SIDEBAR_FLYOUT_VIEWPORT_MARGIN;
      top = Math.min(top, maxTop);
      top = Math.max(SIDEBAR_FLYOUT_VIEWPORT_MARGIN, top);
    }

    setFlyoutPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!flyoutOpen) return;
    updateFlyoutPosition();
  }, [flyoutOpen, visibleItems.length, updateFlyoutPosition]);

  useEffect(() => {
    if (!flyoutOpen) {
      setFlyoutPos(null);
      return;
    }
    updateFlyoutPosition();
    window.addEventListener("resize", updateFlyoutPosition);
    window.addEventListener("scroll", updateFlyoutPosition, true);
    return () => {
      window.removeEventListener("resize", updateFlyoutPosition);
      window.removeEventListener("scroll", updateFlyoutPosition, true);
    };
  }, [flyoutOpen, updateFlyoutPosition]);

  if (visibleItems.length === 0) return null;

  const activeChild = sectionHasOpenTab(openTabRoots, visibleItems);

  const SectionIcon = section.icon;
  const sectionAlerts = sectionAlertCount(visibleItems, navAlerts);

  if (collapsed) {
    return (
      <div
        className="relative"
        onMouseEnter={() => {
          updateFlyoutPosition();
          onFlyoutOpen();
        }}
        onMouseLeave={onFlyoutClose}
      >
        <button
          ref={triggerRef}
          type="button"
          data-bh-nav-section={section.label}
          aria-expanded={flyoutOpen}
          title={section.label}
          onClick={() => {
            updateFlyoutPosition();
            if (flyoutOpen) onFlyoutClose();
            else onFlyoutOpen();
          }}
          className={cn(
            "group relative flex w-full items-center justify-center rounded-xl px-0 py-1 text-[13px] font-semibold transition-colors duration-150",
            activeChild
              ? "bg-gradient-to-r from-[#EB205F]/10 to-transparent text-[#EB205F]"
              : cn("text-slate-500", INTERACTIVE_SIDEBAR_NAV_INACTIVE_HOVER),
          )}
        >
          {activeChild ? (
            <div className="absolute left-0 h-5 w-1 rounded-r-full bg-[#EB205F] shadow-[0_0_8px_rgba(235, 32, 95, 0.35)]" />
          ) : null}
          <SectionIcon
            size={SIDEBAR_COLLAPSED_ICON_SIZE}
            className={cn(
              "shrink-0 transition-colors duration-150",
              activeChild ? "text-[#EB205F]" : "text-slate-400 group-hover:text-slate-600",
            )}
          />
          {sectionAlerts > 0 ? (
            <span className="absolute right-1 top-1">
              <NavAlertBadge alert={{ count: sectionAlerts, tone: "warning" }} />
            </span>
          ) : null}
        </button>

        {flyoutOpen && flyoutPos ? (
          <div
            ref={flyoutRef}
            data-bh-sidebar-flyout="true"
            data-bh-flyout-section={section.label}
            className="fixed z-[100] max-h-[calc(100vh-16px)] pl-2"
            style={{ top: flyoutPos.top, left: flyoutPos.left }}
            onMouseEnter={onFlyoutOpen}
            onMouseLeave={onFlyoutClose}
          >
            <div className="max-h-[inherit] min-w-[220px] overflow-y-auto rounded-xl border border-slate-200/80 bg-white p-2 shadow-lg shadow-slate-900/10">
            <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavOpenInWorkspace(openTabRoots, item.href)}
                  current={activeRootHref === item.href}
                  collapsed={false}
                  nested
                  alert={navAlerts[item.href]}
                  onNavigate={() => {
                    onFlyoutClose();
                    onNavigate?.();
                  }}
                  onPrefetch={() => onPrefetch(item.href)}
                  onSidebarWorkspace={onSidebarWorkspace}
                />
              ))}
            </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="pt-1">
      <button
        type="button"
        data-bh-nav-section={section.label}
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-colors duration-150",
          activeChild
            ? "bg-slate-50 text-slate-900"
            : cn("text-slate-500", INTERACTIVE_SIDEBAR_NAV_INACTIVE_HOVER),
        )}
      >
        <SectionIcon
          size={18}
          className={cn(
            "shrink-0 transition-colors duration-150",
            activeChild ? "text-[#EB205F]" : "text-slate-400 group-hover:text-slate-600",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{section.label}</span>
        {sectionAlerts > 0 ? (
          <NavAlertBadge alert={{ count: sectionAlerts, tone: "warning" }} />
        ) : null}
        <ChevronRight
          size={16}
          className={cn(
            "shrink-0 text-slate-400 transition-transform duration-200",
            open && "rotate-90",
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-0.5 py-0.5">
            {visibleItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isNavOpenInWorkspace(openTabRoots, item.href)}
                current={activeRootHref === item.href}
                collapsed={false}
                nested
                alert={navAlerts[item.href]}
                onNavigate={onNavigate}
                onPrefetch={() => onPrefetch(item.href)}
                onSidebarWorkspace={onSidebarWorkspace}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminSidebar({
  collapsed = false,
  mobileOpen = false,
  onNavigate,
}: {
  collapsed?: boolean;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const profile = useAdminSession();
  const { activeStoreId } = useErpStores();
  const rbac = profile?.rbac;
  const navSections = useRbacNavSections(rbac, activeStoreId);
  const dashboardItem = useDashboardNavItem(rbac, activeStoreId);
  const [userOpenSections, setUserOpenSections] = useState<Set<string>>(() => new Set());
  /** User collapsed a section even though a workspace tab keeps it pinned. */
  const [sectionsCollapsedDespiteTabs, setSectionsCollapsedDespiteTabs] = useState<
    Set<string>
  >(() => new Set());
  const [openFlyoutSection, setOpenFlyoutSection] = useState<string | null>(null);
  const workspaceTabs = useAdminWorkspaceTabsOptional();

  const handleSidebarWorkspace = useCallback(
    (href: string, event: MouseEvent<HTMLAnchorElement>) => {
      workspaceTabs?.openFromSidebar(href, event);
    },
    [workspaceTabs],
  );

  const openTabRoots = useMemo(() => {
    const roots = workspaceTabs?.tabs.map((t) => t.rootHref) ?? [];
    if (roots.length === 0 && pathname.startsWith("/admin")) {
      return new Set([resolveAdminWorkspaceRoot(pathname)]);
    }
    return new Set(roots);
  }, [workspaceTabs?.tabs, pathname]);

  const activeRootHref = workspaceTabs?.activeRootHref ?? null;

  const sectionsPinnedByOpenTabs = useMemo(() => {
    const labels = new Set<string>();
    for (const section of navSections) {
      const visibleItems = section.items.filter((item) => !isAdminRouteHidden(item.href));
      if (visibleItems.length > 0 && sectionHasOpenTab(openTabRoots, visibleItems)) {
        labels.add(section.label);
      }
    }
    return labels;
  }, [navSections, openTabRoots]);

  const effectiveOpenSections = useMemo(() => {
    const next = new Set(userOpenSections);
    for (const label of sectionsPinnedByOpenTabs) {
      if (!sectionsCollapsedDespiteTabs.has(label)) next.add(label);
    }
    return next;
  }, [userOpenSections, sectionsPinnedByOpenTabs, sectionsCollapsedDespiteTabs]);

  const toggleNavSection = useCallback(
    (label: string) => {
      const isOpen = effectiveOpenSections.has(label);
      if (isOpen) {
        setUserOpenSections((current) => {
          const next = new Set(current);
          next.delete(label);
          return next;
        });
        if (sectionsPinnedByOpenTabs.has(label)) {
          setSectionsCollapsedDespiteTabs((current) => {
            const next = new Set(current);
            next.add(label);
            return next;
          });
        }
        return;
      }
      setUserOpenSections((current) => {
        const next = new Set(current);
        next.add(label);
        return next;
      });
      setSectionsCollapsedDespiteTabs((current) => {
        if (!current.has(label)) return current;
        const next = new Set(current);
        next.delete(label);
        return next;
      });
    },
    [effectiveOpenSections, sectionsPinnedByOpenTabs],
  );

  const { secondaryQueriesEnabled } = useAdminBootstrap();
  const { data: navBadgesData } = useQuery({
    queryKey: adminQueryKeys.navBadges(),
    queryFn: fetchAdminNavBadges,
    enabled: secondaryQueriesEnabled,
    ...adminNavBadgesQueryOptions,
  });

  const navAlerts = navBadgesData?.badges ?? {};
  const dashboardActive = dashboardItem
    ? isNavOpenInWorkspace(openTabRoots, dashboardItem.href)
    : false;
  const dashboardCurrent = dashboardItem
    ? activeRootHref === dashboardItem.href
    : false;

  const prefetch = useMemo(
    () => (href: string) =>
      schedulePrefetchAdminRoute(queryClient, href, {
        enabled: secondaryQueriesEnabled,
        currentPath: pathname,
      }),
    [queryClient, secondaryQueriesEnabled, pathname],
  );

  function handleNavigate() {
    cancelScheduledAdminPrefetch();
    onNavigate?.();
  }

  return (
    <aside
      data-bh-admin-sidebar="true"
      data-bh-sidebar-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-slate-200/60 bg-white/80 shadow-[4px_0_24px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xl md:shadow-none",
        "fixed left-0 top-0 z-40 will-change-transform md:relative md:will-change-auto",
        SIDEBAR_WIDTH_EXPANDED_CLASS,
        collapsed ? "md:z-50" : "md:z-0",
        "transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-150 motion-reduce:ease-out",
        "md:transition-[width] md:duration-200 md:ease-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        "md:translate-x-0",
        collapsed ? SIDEBAR_WIDTH_COLLAPSED_CLASS : "md:w-[232px]",
      )}
    >
      <div
        className={cn(
          "flex items-center py-5 transition-[padding] duration-200",
          collapsed ? "justify-center px-2" : "gap-2.5 px-5",
        )}
      >
        <BuyHubLogo
          size={36}
          showWordmark={!collapsed}
          wordmarkSuffix={collapsed ? undefined : "Management"}
          className={collapsed ? "justify-center" : undefined}
        />
      </div>

      <nav
        className={cn(
          "flex-1 overflow-y-auto pb-3 transition-[padding] duration-200",
          collapsed
            ? "flex flex-col justify-evenly px-2"
            : "space-y-1 px-3",
        )}
      >
        {dashboardItem ? (
          <NavLink
            item={dashboardItem}
            active={dashboardActive}
            current={dashboardCurrent}
            collapsed={collapsed}
            alert={navAlerts[dashboardItem.href]}
            onNavigate={handleNavigate}
            onPrefetch={() => prefetch(dashboardItem.href)}
            onSidebarWorkspace={handleSidebarWorkspace}
          />
        ) : null}

        {navSections.map((section) => (
          <NavSectionGroup
            key={section.label}
            section={section}
            openTabRoots={openTabRoots}
            activeRootHref={activeRootHref}
            collapsed={collapsed}
            navAlerts={navAlerts}
            onNavigate={handleNavigate}
            onPrefetch={prefetch}
            onSidebarWorkspace={handleSidebarWorkspace}
            open={effectiveOpenSections.has(section.label)}
            onToggle={() => toggleNavSection(section.label)}
            flyoutOpen={openFlyoutSection === section.label}
            onFlyoutOpen={() => setOpenFlyoutSection(section.label)}
            onFlyoutClose={() => setOpenFlyoutSection(null)}
          />
        ))}
      </nav>
    </aside>
  );
}
