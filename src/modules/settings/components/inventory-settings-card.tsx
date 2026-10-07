"use client";

import { useEffect, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";

import { AdminPanelSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { CurrencySettings } from "@/lib/format-currency";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { updateAppSettingsAction } from "@/modules/settings/actions/app-settings.actions";

export function InventorySettingsCard() {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [allowNegative, setAllowNegative] = useState(false);

  const { data, isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: adminQueryKeys.appSettings(),
    queryFn: () =>
      adminGet<{ settings: CurrencySettings }>("settings").then((r) => r.settings),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (data) setAllowNegative(data.allow_negative_store_stock);
  }, [data]);

  if (isLoading && !data) {
    return (
      <Card className="border border-border py-0 ring-0">
        <CardContent className="p-4">
          <AdminPanelSkeleton rows={3} />
        </CardContent>
      </Card>
    );
  }

  if (isError && !data) {
    const message =
      loadError instanceof Error ? loadError.message : "Failed to load settings.";
    return (
      <Card className="border border-border py-0 ring-0">
        <CardContent className="flex flex-col gap-3 p-4">
          <FieldError>Could not load inventory settings. {message}</FieldError>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  function handleSave() {
    setError(null);
    setSavedMsg(null);
    startTransition(async () => {
      try {
        const saved = await updateAppSettingsAction({
          ...data,
          allow_negative_store_stock: allowNegative,
        });
        setAllowNegative(saved.allow_negative_store_stock);
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.appSettings() });
        setSavedMsg(
          allowNegative
            ? "ERP sales may reduce store stock below zero. POS and app checkout stay strict."
            : "ERP sales require sufficient store stock before issuing.",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <Card className="border border-border py-0 ring-0">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 border-b border-border/60 px-4 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Package className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base">ERP inventory</CardTitle>
          <CardDescription className="mt-1">
            Sales orders and issued invoices use store product stock. Purchase receipts clear
            deficits.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Allow negative store stock (ERP only)</p>
            <p className="text-xs text-muted-foreground">
              POS billing and mobile checkout always require on-hand stock.
            </p>
          </div>
          <Switch checked={allowNegative} onCheckedChange={setAllowNegative} />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        {savedMsg ? <p className="text-sm text-muted-foreground">{savedMsg}</p> : null}
        <div className="flex justify-end">
          <Button size="sm" disabled={isPending} onClick={handleSave}>
            {isPending ? "Saving…" : "Save inventory settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
