"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import type { AdminNavBadge } from "@/common/admin/types";
import { cn } from "@/lib/utils";
import {
  ADMIN_DASHBOARD_ITEM,
  ADMIN_NAV_SECTIONS,
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
import { BuyHubLogo } from "@/modules/brand/components/buyhub-logo";

const DASHBOARD_ITEM = ADMIN_DASHBOARD_ITEM;
const NAV_SECTIONS = ADMIN_NAV_SECTIONS;
/** Expanded sidebar width (was 260px). */
const SIDEBAR_WIDTH_EXPANDED_CLASS = "w-[232px]";
const SIDEBAR_WIDTH_COLLAPSED_CLASS = "md:w-[72px]";

type NavItem = AdminNavItem;
type NavSection = AdminNavSection;

function isNavActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
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

function sectionHasActiveChild(pathname: string, items: NavItem[]) {
  return items.some((item) => isNavActive(pathname, item.href));
}

function sectionAlertCount(items: NavItem[], navAlerts: Record<string, AdminNavBadge>) {
  return items.reduce((sum, item) => sum + (navAlerts[item.href]?.count ?? 0), 0);
}

function NavLink({
  item,
  active,
  collapsed,
  nested = false,
  alert,
  onNavigate,
  onPrefetch,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
  alert?: AdminNavBadge;
  onNavigate?: () => void;
  onPrefetch: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.name : undefined}
      onMouseEnter={onPrefetch}
      onClick={() => onNavigate?.()}
      className={cn(
        "group relative flex items-center rounded-xl text-[13px] font-semibold transition-all duration-200",
        nested
          ? collapsed
            ? "justify-center px-0 py-2"
            : "gap-2 py-1.5 pl-9 pr-3 text-[12px] font-medium"
          : collapsed
            ? "justify-center px-0 py-2"
            : "gap-2.5 px-3 py-2",
        active
          ? nested
            ? "bg-[#2563EB]/8 text-[#2563EB]"
            : "bg-gradient-to-r from-[#2563EB]/10 to-transparent text-[#2563EB] shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset]"
          : nested
            ? "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
      )}
    >
      {!nested && active ? (
        <div className="absolute left-0 h-5 w-1 rounded-r-full bg-[#2563EB] shadow-[0_0_8px_rgba(37,99,235,0.4)]" />
      ) : null}
      {!nested || collapsed ? (
        <Icon
          size={nested ? 16 : 18}
          className={cn(
            "shrink-0 transition-transform duration-200 group-hover:scale-110",
            active ? "text-[#2563EB]" : "text-slate-400 group-hover:text-slate-600",
          )}
        />
      ) : null}
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
                  : "bg-[#2563EB]/10 text-[#2563EB]",
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
  pathname,
  collapsed,
  navAlerts,
  onNavigate,
  onPrefetch,
  open,
  onToggle,
  flyoutOpen,
  onFlyoutOpen,
  onFlyoutClose,
}: {
  section: NavSection;
  pathname: string;
  collapsed: boolean;
  navAlerts: Record<string, AdminNavBadge>;
  onNavigate?: () => void;
  onPrefetch: (href: string) => void;
  open: boolean;
  onToggle: () => void;
  flyoutOpen: boolean;
  onFlyoutOpen: () => void;
  onFlyoutClose: () => void;
}) {
  const visibleItems = section.items.filter((item) => !isAdminRouteHidden(item.href));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number } | null>(null);

  const updateFlyoutPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setFlyoutPos({ top: rect.top, left: rect.right });
  }, []);

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

  const activeChild = sectionHasActiveChild(pathname, visibleItems);

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
            "relative flex w-full items-center justify-center rounded-xl px-0 py-2 text-[13px] font-semibold transition-all duration-200",
            activeChild
              ? "bg-gradient-to-r from-[#2563EB]/10 to-transparent text-[#2563EB]"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
          )}
        >
          {activeChild ? (
            <div className="absolute left-0 h-5 w-1 rounded-r-full bg-[#2563EB] shadow-[0_0_8px_rgba(37,99,235,0.4)]" />
          ) : null}
          <SectionIcon
            size={18}
            className={cn(
              "shrink-0",
              activeChild ? "text-[#2563EB]" : "text-slate-400",
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
            data-bh-sidebar-flyout="true"
            data-bh-flyout-section={section.label}
            className="fixed z-[100] pl-2"
            style={{ top: flyoutPos.top, left: flyoutPos.left }}
            onMouseEnter={onFlyoutOpen}
            onMouseLeave={onFlyoutClose}
          >
            <div className="min-w-[220px] rounded-xl border border-slate-200/80 bg-white p-2 shadow-lg shadow-slate-900/10">
            <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavActive(pathname, item.href)}
                  collapsed={false}
                  nested
                  alert={navAlerts[item.href]}
                  onNavigate={() => {
                    onFlyoutClose();
                    onNavigate?.();
                  }}
                  onPrefetch={() => onPrefetch(item.href)}
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
          "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition-all duration-200",
          activeChild
            ? "bg-slate-50 text-slate-900"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
        )}
      >
        <SectionIcon
          size={18}
          className={cn(
            "shrink-0",
            activeChild ? "text-[#2563EB]" : "text-slate-400 group-hover:text-slate-600",
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
                active={isNavActive(pathname, item.href)}
                collapsed={false}
                nested
                alert={navAlerts[item.href]}
                onNavigate={onNavigate}
                onPrefetch={() => onPrefetch(item.href)}
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
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openFlyoutSection, setOpenFlyoutSection] = useState<string | null>(null);

  const activeSectionLabel = useMemo(() => {
    for (const section of NAV_SECTIONS) {
      const visibleItems = section.items.filter((item) => !isAdminRouteHidden(item.href));
      if (visibleItems.length > 0 && sectionHasActiveChild(pathname, visibleItems)) {
        return section.label;
      }
    }
    return null;
  }, [pathname]);

  useEffect(() => {
    if (activeSectionLabel) {
      setOpenSection(activeSectionLabel);
    }
  }, [activeSectionLabel]);

  const { secondaryQueriesEnabled } = useAdminBootstrap();
  const { data: navBadgesData } = useQuery({
    queryKey: adminQueryKeys.navBadges(),
    queryFn: fetchAdminNavBadges,
    enabled: secondaryQueriesEnabled,
    ...adminNavBadgesQueryOptions,
  });

  const navAlerts = navBadgesData?.badges ?? {};
  const dashboardActive = isNavActive(pathname, DASHBOARD_ITEM.href);

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
          "flex-1 space-y-1 overflow-y-auto pb-3 transition-[padding] duration-200",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <NavLink
          item={DASHBOARD_ITEM}
          active={dashboardActive}
          collapsed={collapsed}
          alert={navAlerts[DASHBOARD_ITEM.href]}
          onNavigate={handleNavigate}
          onPrefetch={() => prefetch(DASHBOARD_ITEM.href)}
        />

        {NAV_SECTIONS.map((section) => (
          <NavSectionGroup
            key={section.label}
            section={section}
            pathname={pathname}
            collapsed={collapsed}
            navAlerts={navAlerts}
            onNavigate={handleNavigate}
            onPrefetch={prefetch}
            open={openSection === section.label}
            onToggle={() =>
              setOpenSection((current) => (current === section.label ? null : section.label))
            }
            flyoutOpen={openFlyoutSection === section.label}
            onFlyoutOpen={() => setOpenFlyoutSection(section.label)}
            onFlyoutClose={() => setOpenFlyoutSection(null)}
          />
        ))}
      </nav>
    </aside>
  );
}
