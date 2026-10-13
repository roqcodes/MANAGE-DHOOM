"use client";

import { useEffect, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";

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
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  adminAppSettingsQueryOptions,
  patchAdminAppSettings,
} from "@/modules/settings/lib/app-settings-query";

export function PaymentSettingsCard() {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [capturePayments, setCapturePayments] = useState(true);

  const {
    data,
    isLoading,
    isError,
    error: loadError,
    refetch,
  } = useQuery({
    ...adminAppSettingsQueryOptions(),
    retry: 1,
  });

  useEffect(() => {
    if (data) setCapturePayments(data.capture_payments);
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
      loadError instanceof Error
        ? loadError.message
        : "Failed to load settings.";
    return (
      <Card className="border border-border py-0 ring-0">
        <CardContent className="flex flex-col gap-3 p-4">
          <FieldError>
            Could not load payment settings. {message}
          </FieldError>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  function handleSave() {
    setError(null);
    setSavedMsg(null);
    startTransition(async () => {
      try {
        const saved = await patchAdminAppSettings({
          ...data,
          capture_payments: capturePayments,
        });
        setCapturePayments(saved.capture_payments);
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.appSettings() });
        setSavedMsg(
          capturePayments
            ? "Payments enabled. Customers will pay via wallet at checkout."
            : "Payments disabled. Customers can place orders without wallet payment.",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <Card className="border border-border py-0 ring-0">
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="size-4 text-muted-foreground" aria-hidden />
          Payments
        </CardTitle>
        <CardDescription className="text-sm">
          Control whether customers pay via wallet at checkout or place orders without payment.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-3">
          <div>
            <p className="text-sm font-medium">Capture payments</p>
            <p className="text-xs text-muted-foreground">
              When on, customers pay from their DHOOM wallet at checkout. When off,
              the wallet tab is hidden and orders are placed with a confirmation only.
              Orders placed while off keep their payment status if you turn this back on.
            </p>
          </div>
          <Switch
            checked={capturePayments}
            onCheckedChange={(checked) => {
              setCapturePayments(checked);
              setSavedMsg(null);
            }}
          />
        </div>

        {error ? <FieldError>{error}</FieldError> : null}
        {savedMsg ? (
          <p className="text-sm text-emerald-700">{savedMsg}</p>
        ) : null}

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
