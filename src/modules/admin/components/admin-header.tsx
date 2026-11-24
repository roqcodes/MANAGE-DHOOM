"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";

import { AdminRefreshStatusButton } from "@/modules/admin/components/admin-refresh-status-button";
import { AdminQuickCreateMenu } from "@/modules/admin/components/admin-quick-create-menu";
import { AdminProfileMenu } from "@/modules/admin/components/admin-profile-menu";
import { AdminHeaderDateRange } from "@/modules/admin/components/admin-header-date-range";
import { AdminSearchTrigger } from "@/modules/admin/components/admin-global-search";
import { ErpStoreSwitcher } from "@/modules/admin/components/erp-store-switcher";
import { ADMIN_HEADER_ICON_BUTTON } from "@/modules/admin/components/admin-header-chrome";

type AdminHeaderProps = {
  sidebarCollapsed: boolean;
  /** Mobile drawer open (ignored at `md+`). */
  mobileNavOpen: boolean;
  isMdViewport: boolean;
  onToggleSidebar: () => void;
};

function SidebarToggleButton({
  isMdViewport,
  sidebarCollapsed,
  mobileNavOpen,
  onToggleSidebar,
  toggleLabel,
  navExpanded,
}: {
  isMdViewport: boolean;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  onToggleSidebar: () => void;
  toggleLabel: string;
  navExpanded: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggleSidebar}
      className={ADMIN_HEADER_ICON_BUTTON}
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
  );
}

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

  const toggle = (
    <SidebarToggleButton
      isMdViewport={isMdViewport}
      sidebarCollapsed={sidebarCollapsed}
      mobileNavOpen={mobileNavOpen}
      onToggleSidebar={onToggleSidebar}
      toggleLabel={toggleLabel}
      navExpanded={navExpanded}
    />
  );

  return (
    <header
      data-admin-header
      className="sticky top-0 z-30 shrink-0 border-b border-slate-200/70 bg-[#F8FAFC]/85 backdrop-blur-md max-md:border-b-0"
    >
      {/* Mobile: row 1 = nav + create + search; row 2 = store + dates + refresh + profile */}
      <div className="flex flex-col gap-2 px-3 py-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {toggle}
          <div className="shrink-0">
            <AdminQuickCreateMenu />
          </div>
          <div className="min-w-0 flex-1">
            <label className="relative block min-w-0">
              <span className="sr-only">Quick search</span>
              <AdminSearchTrigger />
            </label>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 border-b border-slate-200/80 pb-2 -mx-3 px-3">
          <ErpStoreSwitcher />
          <AdminHeaderDateRange />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <AdminRefreshStatusButton />
            <AdminProfileMenu />
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden h-[52px] flex-nowrap items-center gap-2.5 px-4 md:flex lg:gap-3">
        {toggle}
        <div className="shrink-0">
          <AdminQuickCreateMenu />
        </div>
        <div className="min-w-0 flex-1">
          <label className="relative block min-w-0">
            <span className="sr-only">Quick search</span>
            <AdminSearchTrigger />
          </label>
        </div>
        <div className="shrink-0">
          <ErpStoreSwitcher />
        </div>
        <div className="shrink-0">
          <AdminHeaderDateRange />
        </div>
        <div className="shrink-0">
          <AdminRefreshStatusButton />
        </div>
        <div className="shrink-0">
          <AdminProfileMenu />
        </div>
      </div>
    </header>
  );
}