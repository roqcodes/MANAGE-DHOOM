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
import { Button } from "@/components/ui/button";
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
      <span className="flex h-9 items-center gap-2 px-2 text-xs text-slate-500">
        <Loader2 className="size-3.5 animate-spin" />
        <span className="hidden sm:inline">Store</span>
      </span>
    );
  }

  if (stores.length === 0) return null;

  const activeName = context?.store?.name ?? stores[0]?.name ?? "Store";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            className="h-9 max-w-[9.5rem] gap-1.5 border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 sm:max-w-[11rem] lg:max-w-[12.5rem]"
          />
        }
      >
        <Building2 className="size-3.5 shrink-0 text-slate-500" />
        <span className="truncate">{activeName}</span>
        {isPending ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin opacity-60" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
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
