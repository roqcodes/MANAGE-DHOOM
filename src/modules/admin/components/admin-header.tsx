"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";

import { AdminRefreshStatusButton } from "@/modules/admin/components/admin-refresh-status-button";
import { AdminQuickCreateMenu } from "@/modules/admin/components/admin-quick-create-menu";
import { AdminProfileMenu } from "@/modules/admin/components/admin-profile-menu";
import { AdminRecentActivityMenu } from "@/modules/admin/components/admin-recent-activity-menu";
import { AdminSearchTrigger } from "@/modules/admin/components/admin-global-search";
import { ErpStoreSwitcher } from "@/modules/admin/components/erp-store-switcher";

type AdminHeaderProps = {
  sidebarCollapsed: boolean;
  /** Mobile drawer open (ignored at `md+`). */
  mobileNavOpen: boolean;
  isMdViewport: boolean;
  onToggleSidebar: () => void;
};

export function AdminHeader({
  sidebarCollapsed,
  mobileNavOpen,
  isMdViewport,
  onToggleSidebar,
}: AdminHeaderProps) {
  const navExpanded = isMdViewport ? !sidebarCollapsed : mobileNavOpen;
  const toggleLabel = isMdViewport
    ? sidebarCollapsed
      ? "Expand sidebar"
      : "Collapse sidebar"
    : mobileNavOpen
      ? "Close navigation menu"
      : "Open navigation menu";

  const refreshBtn = <AdminRefreshStatusButton />;

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200/70 bg-[#F8FAFC]/85 backdrop-blur-md">
      <div className="grid grid-cols-1 gap-2 px-3 py-1.5 sm:px-4 md:h-[52px] md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-3 md:py-0 lg:gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-900"
            aria-label={toggleLabel}
            aria-expanded={navExpanded}
          >
            {isMdViewport ? (
              sidebarCollapsed ? (
                <PanelLeft className="size-5" aria-hidden />
              ) : (
                <PanelLeftClose className="size-5" aria-hidden />
              )
            ) : mobileNavOpen ? (
              <PanelLeftClose className="size-5" aria-hidden />
            ) : (
              <PanelLeft className="size-5" aria-hidden />
            )}
          </button>
          <div className="hidden min-w-0 items-center gap-2 md:flex">
            <ErpStoreSwitcher />
            <AdminQuickCreateMenu />
          </div>
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <ErpStoreSwitcher />
            <AdminQuickCreateMenu />
            {refreshBtn}
            <AdminProfileMenu />
          </div>
        </div>

        <div className="min-w-0 w-full justify-self-stretch px-0 md:max-w-2xl md:justify-self-center md:px-1">
          <div className="flex items-center gap-1.5">
            <AdminRecentActivityMenu />
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Quick search</span>
              <AdminSearchTrigger />
            </label>
          </div>
        </div>

        <div className="hidden shrink-0 items-center justify-end gap-2 md:flex">
          {refreshBtn}
          <AdminProfileMenu />
        </div>
      </div>
    </header>
  );
}
