"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { isAdminInvoicePrintPath } from "@/modules/admin/lib/admin-invoice-route";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";

import type { UserProfile } from "@/common/auth/types";
import { AdminHeader } from "@/modules/admin/components/admin-header";
import { AdminGlobalSearchProvider } from "@/modules/admin/components/admin-global-search";
import { AdminDateRangeProvider } from "@/modules/admin/providers/admin-date-range-provider";
import { AdminSidebar } from "@/modules/admin/components/sidebar";
import { useIsMdUp } from "@/modules/admin/hooks/use-is-md-up";
import { ChunkLoadRecovery } from "@/modules/admin/components/chunk-load-recovery";
import { AdminBootstrapProvider } from "@/modules/admin/providers/admin-bootstrap-provider";
import { AdminSessionProvider } from "@/modules/admin/providers/admin-session-provider";
import { CurrencySettingsProvider } from "@/modules/settings/providers/currency-settings-provider";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  erpContextQueryOptions,
  type ErpContextQueryData,
} from "@/modules/erp/components/use-erp-stores";
import {
  canReadAdminPath,
  firstAllowedAdminHref,
} from "@/modules/rbac/lib/permission-catalog";

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
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isMd) setMobileNavOpen(false);
  }, [isMd]);
  const { data, isPending, isError, isSuccess } = useQuery({
    queryKey: adminQueryKeys.session(),
    queryFn: async () => {
      const includeContext = !invoicePrintLayout;
      const res = await adminGet<{
        profile: UserProfile;
        context?: ErpContextQueryData["context"];
        stores?: ErpContextQueryData["stores"];
      }>(includeContext ? "bootstrap" : "bootstrap?includeContext=0");
      if (includeContext) {
        queryClient.setQueryData(adminQueryKeys.erpContext(), {
          context: res.context ?? null,
          stores: res.stores ?? [],
        } satisfies ErpContextQueryData);
      }
      return { profile: res.profile };
    },
    retry: false,
    staleTime: 60_000,
  });
  const { data: erpContextData } = useQuery({
    ...erpContextQueryOptions,
    retry: false,
    enabled: !invoicePrintLayout && isSuccess,
  });
  const activeStoreId = erpContextData?.context?.store_id ?? "";
  const [storeViewKey, setStoreViewKey] = useState("init");

  useEffect(() => {
    if (isError) {
      router.replace(AUTH_ROUTES.signIn);
    }
  }, [isError, router]);

  useEffect(() => {
    const profile = data?.profile;
    if (!profile?.rbac || invoicePrintLayout) return;
    const href = pathname.split("?")[0] ?? pathname;
    if (!href.startsWith("/admin")) return;
    if (href === "/admin" || href === "/admin/") return;
    if (!canReadAdminPath(profile.rbac, href, activeStoreId)) {
      router.replace(firstAllowedAdminHref(profile.rbac, activeStoreId));
    }
  }, [data?.profile, pathname, router, invoicePrintLayout, activeStoreId]);

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
      <ChunkLoadRecovery />
      <AdminBootstrapProvider>
      <CurrencySettingsProvider>
      <AdminGlobalSearchProvider>
      <AdminDateRangeProvider>
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
            <div className="h-[400px] w-[800px] bg-gradient-to-b from-[#EB205F]/5 to-transparent" />
          </div>
          <AdminHeader
            sidebarCollapsed={sidebarCollapsed}
            mobileNavOpen={mobileNavOpen}
            isMdViewport={isMd}
            onToggleSidebar={handleToggleSidebar}
          />
          <div
            data-admin-content
            className="admin-content min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0.5rem)]"
          >
            <div key={storeViewKey}>{children}</div>
          </div>
        </main>
        </div>
      </AdminDateRangeProvider>
      </AdminGlobalSearchProvider>
      </CurrencySettingsProvider>
      </AdminBootstrapProvider>
    </AdminSessionProvider>
  );
}
