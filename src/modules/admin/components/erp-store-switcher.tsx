"use client";

import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Building2, Check, ChevronDown, Loader2 } from "lucide-react";

import { adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  type ErpContextQueryData,
  refreshAdminAfterStoreChange,
  useErpContextQuery,
} from "@/modules/erp/components/use-erp-stores";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ADMIN_HEADER_ICON_SLOT,
  adminHeaderFieldClassName,
} from "@/modules/admin/components/admin-header-chrome";
import { cn } from "@/lib/utils";

export function ErpStoreSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isPending: loading } = useErpContextQuery();
  const [isPending, startTransition] = useTransition();

  const stores = data?.stores ?? [];
  const context = data?.context ?? null;

  function onChange(storeId: string) {
    if (isPending) return;
    startTransition(async () => {
      try {
        if (storeId !== context?.store_id) {
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
        }
        await refreshAdminAfterStoreChange(
          queryClient,
          router,
          storeId,
        );
      } catch (err) {
        console.error(err);
      }
    });
  }

  if (loading) {
    return (
      <span
        className={cn(
          adminHeaderFieldClassName("max-w-[12.5rem] text-xs text-slate-500"),
          "pointer-events-none",
        )}
      >
        <span className={ADMIN_HEADER_ICON_SLOT}>
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        </span>
        <span className="truncate">Store</span>
      </span>
    );
  }

  if (stores.length === 0) return null;

  const activeName = context?.store?.name ?? stores[0]?.name ?? "Store";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={isPending}
            className={adminHeaderFieldClassName(
              "max-w-[12.5rem] font-medium text-slate-700 disabled:opacity-60",
            )}
          />
        }
      >
        <span className={ADMIN_HEADER_ICON_SLOT}>
          <Building2 className="size-4 shrink-0" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{activeName}</span>
        {isPending ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-slate-400" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-slate-400 opacity-70" aria-hidden />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          {stores.map((store) => {
            const active = store.id === context?.store_id;
            return (
              <DropdownMenuItem
                key={store.id}
                onClick={() => onChange(store.id)}
                className={cn(active && "bg-primary/5 font-medium")}
              >
                <Building2 className="size-3.5 text-slate-500" />
                <span className="min-w-0 flex-1 truncate">{store.name}</span>
                {active ? <Check className="size-3.5 text-primary" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
