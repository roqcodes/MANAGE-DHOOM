"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { ErpContext } from "@/common/erp/types";
import { RequiredFieldMark } from "@/lib/required-field-label";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

type StoreOption = { id: string; name: string };

export type ErpContextQueryData = {
  context: ErpContext | null;
  stores: StoreOption[];
};

export const ERP_CONTEXT_STALE_MS = 90_000;

export const erpContextQueryOptions = {
  queryKey: adminQueryKeys.erpContext(),
  queryFn: () => adminGet<ErpContextQueryData>("erp/context"),
  staleTime: ERP_CONTEXT_STALE_MS,
} as const;

export function useErpContextQuery() {
  return useQuery({
    ...erpContextQueryOptions,
    placeholderData: keepPreviousData,
  });
}

const ADMIN_QUERY_KEYS_PRESERVED_ON_STORE_SWITCH = new Set([
  "session",
  "erp-context",
  "search-index",
  "app-settings",
]);

export async function refreshAdminAfterStoreChange(
  queryClient: ReturnType<typeof useQueryClient>,
  router: ReturnType<typeof useRouter>,
  storeId?: string | null,
) {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key[0] !== "admin") return false;
      const segment = key[1];
      if (typeof segment === "string" && ADMIN_QUERY_KEYS_PRESERVED_ON_STORE_SWITCH.has(segment)) {
        return false;
      }
      return true;
    },
  });
  router.refresh();
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("buyhub:erp-store-changed", { detail: storeId ?? "" }),
    );
  }
}

export function useErpStores() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data, isPending, refetch } = useErpContextQuery();
  const [isSwitching, startTransition] = useTransition();

  const stores = data?.stores ?? [];
  const activeStoreId = data?.context?.store_id ?? "";

  function switchActiveStore(storeId: string) {
    if (!storeId || storeId === activeStoreId) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        try {
          const res = await adminPost<ErpContextQueryData>("erp/context", {
            storeId,
          });
          queryClient.setQueryData<ErpContextQueryData>(
            adminQueryKeys.erpContext(),
            (prev) => ({
              stores: prev?.stores ?? stores,
              context: res.context,
            }),
          );
          await refreshAdminAfterStoreChange(queryClient, router, res.context?.store_id);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  return {
    stores,
    activeStoreId,
    setActiveStoreId: (_id: string) => {
      /* store id is owned by erp context query */
    },
    switchActiveStore,
    loading: isPending,
    isSwitching,
    reload: () => refetch().then(() => undefined),
  };
}

export function StoreSelect({
  value,
  onChange,
  stores,
  label = "Store",
  allowAll = false,
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  stores: StoreOption[];
  label?: string;
  allowAll?: boolean;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">
        {label}
        {required && label.trim() ? <RequiredFieldMark /> : null}
      </span>
      <select
        className="h-9 rounded-md border border-input px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        {allowAll ? <option value="">All stores</option> : <option value="">Select store</option>}
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
