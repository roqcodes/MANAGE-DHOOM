"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Building2, Check } from "lucide-react";

import type { ErpContext, Store } from "@/common/erp/types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { refreshAdminAfterStoreChange } from "@/modules/erp/components/use-erp-stores";
import { AdminPanelSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChangeStoreView() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [context, setContext] = useState<ErpContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    adminGet<{ context: ErpContext | null; stores: Store[] }>("erp/context")
      .then((res) => {
        setContext(res.context);
        setStores(res.stores);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load stores"),
      )
      .finally(() => setLoading(false));
  }, []);

  function selectStore(storeId: string) {
    if (storeId === context?.store_id || isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await adminPost<{ context: ErpContext }>("erp/context", {
          storeId,
        });
        setContext(res.context);
        queryClient.setQueryData(adminQueryKeys.erpContext(), {
          context: res.context,
          stores,
        });
        await refreshAdminAfterStoreChange(queryClient, router, storeId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to switch store");
      }
    });
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <AdminPanelSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <AdminBreadcrumb
        items={[
          { label: "Sales", href: "/admin/orders" },
          { label: "Change Store" },
        ]}
        backHref="/admin/orders"
      />

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Active store</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          POS, stock adjustments, and ERP documents use this store context.
          Online orders reserve stock per fulfillment assignment.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {stores.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No active stores. Add stores under Inventory → Stores.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {stores.map((store) => {
            const active = store.id === context?.store_id;
            return (
              <button
                key={store.id}
                type="button"
                disabled={isPending}
                onClick={() => selectStore(store.id)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-white hover:border-primary/40 hover:bg-slate-50",
                  isPending && "opacity-70",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-lg",
                    active ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600",
                  )}
                >
                  <Building2 className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{store.name}</span>
                    {active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        <Check className="size-3" />
                        Active
                      </span>
                    ) : null}
                  </span>
                  {store.code ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Code: {store.code}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {context?.store?.name ? (
        <p className="text-sm text-muted-foreground">
          Current session store:{" "}
          <span className="font-medium text-foreground">{context.store.name}</span>
        </p>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => void queryClient.invalidateQueries({ queryKey: ["admin"] })}
      >
        Refresh context
      </Button>
    </div>
  );
}
