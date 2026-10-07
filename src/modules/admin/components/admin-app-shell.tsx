"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { isAdminInvoicePrintPath } from "@/modules/admin/lib/admin-invoice-route";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";

import type { UserProfile } from "@/common/auth/types";
import { AdminHeader } from "@/modules/admin/components/admin-header";
import { AdminGlobalSearchProvider } from "@/modules/admin/components/admin-global-search";
import { AdminAlertProvider } from "@/modules/admin/components/admin-alert-provider";
import { AdminSidebar } from "@/modules/admin/components/sidebar";
import { useIsMdUp } from "@/modules/admin/hooks/use-is-md-up";
import { AdminBootstrapProvider } from "@/modules/admin/providers/admin-bootstrap-provider";
import { AdminSessionProvider } from "@/modules/admin/providers/admin-session-provider";
import { CurrencySettingsProvider } from "@/modules/settings/providers/currency-settings-provider";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { erpContextQueryOptions } from "@/modules/erp/components/use-erp-stores";

function AdminRootSkeleton() {
  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      <div className="w-[232px] shrink-0 animate-pulse border-r border-slate-100 bg-white" />
      <div className="min-h-0 flex-1 animate-pulse bg-slate-100 p-8">
        <div className="h-8 w-48 rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

export function AdminAppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isMd = useIsMdUp();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const invoicePrintLayout = isAdminInvoicePrintPath(pathname);

  useEffect(() => {
    if (isMd) setMobileNavOpen(false);
  }, [isMd]);
  const { data, isPending, isError } = useQuery({
    queryKey: adminQueryKeys.session(),
    queryFn: () => adminGet<{ profile: UserProfile }>("session"),
    retry: false,
    staleTime: 60_000,
  });
  /** Start with session so ERP context is not gated behind the shell paint. */
  useQuery({
    ...erpContextQueryOptions,
    retry: false,
    enabled: !invoicePrintLayout,
  });
  const [storeViewKey, setStoreViewKey] = useState("init");

  useEffect(() => {
    if (isError) {
      router.replace(AUTH_ROUTES.signIn);
    }
  }, [isError, router]);

  useEffect(() => {
    function onStoreChanged(event: Event) {
      const storeId = (event as CustomEvent<string>).detail;
      setStoreViewKey(`${storeId || "store"}-${Date.now()}`);
    }
    window.addEventListener("buyhub:erp-store-changed", onStoreChanged);
    return () =>
      window.removeEventListener("buyhub:erp-store-changed", onStoreChanged);
  }, []);

  if (isPending || !data?.profile) {
    return isError ? null : <AdminRootSkeleton />;
  }

  if (invoicePrintLayout) {
    return (
      <AdminSessionProvider profile={data.profile}>
        <div className="flex min-h-full flex-col bg-slate-50 print:bg-white">
          {children}
        </div>
      </AdminSessionProvider>
    );
  }

  function handleToggleSidebar() {
    if (isMd) {
      setSidebarCollapsed((c) => !c);
    } else {
      setMobileNavOpen((o) => !o);
    }
  }

  return (
    <AdminSessionProvider profile={data.profile}>
      <AdminBootstrapProvider>
      <CurrencySettingsProvider>
      <AdminAlertProvider>
      <AdminGlobalSearchProvider>
        <div className="relative flex h-full overflow-hidden bg-[#F8FAFC]">
        <button
          type="button"
          className={[
            "fixed inset-0 z-30 bg-slate-900/40 md:hidden",
            "transition-[opacity] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:duration-150 motion-reduce:ease-out",
            mobileNavOpen
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
          ].join(" ")}
          aria-label="Close navigation menu"
          aria-hidden={!mobileNavOpen}
          tabIndex={-1}
          onClick={() => setMobileNavOpen(false)}
        />
        <AdminSidebar
          collapsed={sidebarCollapsed}
          mobileOpen={mobileNavOpen}
          onNavigate={() => setMobileNavOpen(false)}
        />
        <main className="relative z-0 grid h-full flex-1 grid-rows-[auto_1fr] overflow-hidden">
          {/* Ambient background glow */}
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 overflow-hidden blur-3xl" aria-hidden>
            <div className="h-[400px] w-[800px] bg-gradient-to-b from-[#2563EB]/5 to-transparent" />
          </div>
          <AdminHeader
            sidebarCollapsed={sidebarCollapsed}
            mobileNavOpen={mobileNavOpen}
            isMdViewport={isMd}
            onToggleSidebar={handleToggleSidebar}
          />
          <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0.5rem)]">
            <div key={storeViewKey}>{children}</div>
          </div>
        </main>
        </div>
      </AdminGlobalSearchProvider>
      </AdminAlertProvider>
      </CurrencySettingsProvider>
      </AdminBootstrapProvider>
    </AdminSessionProvider>
  );
}
