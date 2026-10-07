import type { QueryClient } from "@tanstack/react-query";

import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { adminListPath } from "@/modules/admin/lib/use-admin-get-query";
import { getAdminPrimaryGetInFlight } from "@/modules/admin/lib/admin-primary-get";
import type { ErpContextQueryData } from "@/modules/erp/components/use-erp-stores";

const STALE = 90_000;

function activeStoreIdFromCache(qc: QueryClient): string | undefined {
  const storeId = qc.getQueryData<ErpContextQueryData>(adminQueryKeys.erpContext())
    ?.context?.store_id;
  return storeId || undefined;
}

function localYmd() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function prefetchErpGet(qc: QueryClient, path: string) {
  return qc.prefetchQuery({
    queryKey: adminQueryKeys.erpGet(path),
    queryFn: () => adminGet(path),
    staleTime: STALE,
  });
}

/** Default first-page GET matching the destination list’s adminListPath. */
function erpListPrefetchPath(hrefPath: string, storeId: string | undefined): string | null {
  const today = localYmd();
  switch (hrefPath) {
    case "/admin/erp/invoices":
    case "/admin/erp/credit-notes":
    case "/admin/erp/purchase-bills":
    case "/admin/erp/vendor-credits":
      if (!storeId) return null;
      return adminListPath(`erp/${hrefPath.split("/").pop()}`, { page: 0, storeId });
    case "/admin/erp/estimates":
      if (!storeId) return null;
      return adminListPath("erp/estimates", { page: 0, storeId });
    case "/admin/erp/payments":
      if (!storeId) return null;
      return adminListPath("erp/payments", {
        page: 0,
        storeId,
        dateFrom: today,
        dateTo: today,
      });
    case "/admin/erp/customer-bulk-payments":
      if (!storeId) return null;
      return adminListPath("erp/customer-bulk-payments", {
        page: 0,
        storeId,
        period: "this_month",
      });
    case "/admin/erp/expenses":
      if (!storeId) return null;
      return adminListPath("erp/expenses", { page: 0, storeId, period: "this_month" });
    case "/admin/erp/supplier-payments":
      return adminListPath("erp/supplier-payments", { page: 0, isBulk: "false" });
    case "/admin/erp/supplier-bulk-payments":
      return adminListPath("erp/supplier-payments", { view: "bulk", page: 0 });
    case "/admin/erp/store-inventory":
      if (!storeId) return null;
      return adminListPath("erp/stock-details", { page: 0, storeId });
    case "/admin/erp/stock-adjustments":
      if (!storeId) return null;
      return adminListPath("erp/stock-adjustments", { page: 0, storeId });
    case "/admin/erp/item-transactions":
      if (!storeId) return null;
      return adminListPath("erp/item-transactions", { storeId });
    case "/admin/erp/store-transfers":
      if (!storeId) return null;
      return adminListPath("erp/store-transfers", { page: 0, storeId });
    case "/admin/erp/transfer-requests":
      if (!storeId) return null;
      return adminListPath("erp/transfer-requests", { page: 0, storeId });
    case "/admin/erp/transfer-approvals":
      if (!storeId) return null;
      return adminListPath("erp/transfer-requests", {
        page: 0,
        status: "submitted",
        fromStoreId: storeId,
      });
    case "/admin/erp/transfer-statement":
      if (!storeId) return null;
      return adminListPath("erp/transfer-statement", { fromStoreId: storeId });
    case "/admin/erp/transfer-bulk-payments":
      return adminListPath("erp/transfer-payments", {});
    case "/admin/erp/stores":
      return adminListPath("erp/stores", {});
    default:
      return null;
  }
}

/** Warm TanStack cache on sidebar hover. Cache key + URL must match the destination page. */
export function prefetchAdminRoute(
  qc: QueryClient,
  href: string,
  options?: { enabled?: boolean; currentPath?: string },
) {
  if (options?.enabled === false) return Promise.resolve();
  const p = href.split("?")[0];
  const current = (options?.currentPath ?? "").split("?")[0];
  if (current && (current === p || current === p.replace(/\/$/, ""))) {
    return Promise.resolve();
  }
  if (getAdminPrimaryGetInFlight() > 0) return Promise.resolve();
  const storeId = activeStoreIdFromCache(qc);

  if (p === "/admin" || p === "") {
    if (!storeId) return Promise.resolve();
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.dashboard(storeId, undefined, undefined, "month", "core"),
      queryFn: () =>
        adminGet(`dashboard?storeId=${encodeURIComponent(storeId)}&section=core`),
      staleTime: STALE,
    });
  }

  if (p === "/admin/products") {
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.products(0, null),
      queryFn: () => adminGet("products?page=0"),
      staleTime: STALE,
    });
  }

  if (p === "/admin/categories") {
    return qc.prefetchQuery({
      queryKey: ["admin", "categories"],
      queryFn: () => adminGet("categories"),
      staleTime: STALE,
    });
  }

  if (p === "/admin/brands") {
    return qc.prefetchQuery({
      queryKey: ["admin", "brands"],
      queryFn: () => adminGet("brands"),
      staleTime: STALE,
    });
  }

  if (p === "/admin/vendors") {
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.vendors(0),
      queryFn: () => adminGet("vendors?page=0"),
      staleTime: STALE,
    });
  }

  if (p === "/admin/inventory") {
    if (!storeId) return Promise.resolve();
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.inventory(0, storeId),
      queryFn: () =>
        adminGet(`inventory?page=0&storeId=${encodeURIComponent(storeId)}`),
      staleTime: STALE,
    });
  }

  if (p === "/admin/orders") {
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.orders("all", null, 0),
      queryFn: () => adminGet("orders?channel=online"),
      staleTime: STALE,
    });
  }

  if (p === "/admin/erp/sales-orders") {
    if (!storeId) return Promise.resolve();
    const qs = `?storeId=${encodeURIComponent(storeId)}`;
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.salesOrders("all", null, 0, storeId),
      queryFn: () => adminGet(`erp/sales-orders${qs}`),
      staleTime: STALE,
    });
  }

  if (p === "/admin/users") {
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.users("users", "vendor", 0),
      queryFn: () => adminGet("users?tab=users&segment=vendor"),
      staleTime: STALE,
    });
  }

  if (p === "/admin/delivery") {
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.delivery(),
      queryFn: () => adminGet("delivery"),
      staleTime: STALE,
    });
  }

  if (p === "/admin/business") {
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.appSettings(),
      queryFn: () => adminGet("settings"),
      staleTime: STALE,
    });
  }

  if (p === "/admin/config/push") {
    return qc.prefetchQuery({
      queryKey: adminQueryKeys.pushNotifications(),
      queryFn: () => adminGet("push-notifications"),
      staleTime: STALE,
    });
  }

  const erpPath = erpListPrefetchPath(p, storeId);
  if (erpPath) return prefetchErpGet(qc, erpPath);

  return Promise.resolve();
}

const PREFETCH_HOVER_MS = 200;
let hoverPrefetchTimer: number | null = null;

/** Debounce hover so sweeping the sidebar does not start every list GET. */
export function schedulePrefetchAdminRoute(
  qc: QueryClient,
  href: string,
  options?: { enabled?: boolean; currentPath?: string },
) {
  if (options?.enabled === false) return;
  if (hoverPrefetchTimer != null) window.clearTimeout(hoverPrefetchTimer);
  hoverPrefetchTimer = window.setTimeout(() => {
    hoverPrefetchTimer = null;
    void prefetchAdminRoute(qc, href, options);
  }, PREFETCH_HOVER_MS);
}

export function cancelScheduledAdminPrefetch() {
  if (hoverPrefetchTimer == null) return;
  window.clearTimeout(hoverPrefetchTimer);
  hoverPrefetchTimer = null;
}
