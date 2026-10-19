"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AdminPanelSkeleton } from "@/modules/admin/components/admin-page-skeleton";

import type { LineProductContext } from "@/common/erp/line-product-context";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { rpcLineProductContext } from "@/modules/erp/lib/line-product-context-rpc.client";
import { ERP_PRODUCT_SEARCH_STALE_MS } from "@/modules/erp/lib/erp-product-live-search.client";
import { Button } from "@/components/ui/button";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

function formatStock(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPrice(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return formatCurrencyAmount(value);
}

function MetricBlock({
  label,
  labelSubline,
  value,
  emphasize = false,
}: {
  label: string;
  labelSubline?: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div
        className="flex w-full min-h-[2.25rem] flex-col items-center justify-center rounded-md bg-muted/80 px-1.5 py-1 text-[10px] font-medium leading-tight text-muted-foreground"
      >
        <span>{label}</span>
        {labelSubline ? (
          <span className="mt-0.5 text-[9px] font-normal leading-tight">{labelSubline}</span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-1.5 w-full text-center text-sm tabular-nums",
          emphasize ? "font-semibold text-foreground" : "text-foreground/90",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function LineProductDetailsToggle({
  open,
  onToggle,
  disabled,
  disabledReason,
}: {
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 gap-1 px-2 text-xs"
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={onToggle}
    >
      {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      {open ? "Hide" : "Details"}
    </Button>
  );
}

type LineProductDetailsVariant = "sales" | "purchase";

type MetricDef = {
  label: string;
  labelSubline?: string;
  value: string;
  emphasize?: boolean;
};

export function LineProductDetailsPanel({
  productId,
  storeId,
  customerId,
  vendorId,
  counterpartyKind = "customer",
  variant = "sales",
  enabled = true,
}: {
  productId: string;
  storeId?: string;
  customerId?: string;
  vendorId?: string;
  counterpartyKind?: "customer" | "vendor";
  /** Purchase bills/PO modals use vendor-focused last column ordering. */
  variant?: LineProductDetailsVariant;
  enabled?: boolean;
}) {
  const counterpartyId = counterpartyKind === "customer" ? customerId : vendorId;

  const { data, isPending, isError } = useQuery({
    queryKey: [
      "admin",
      "line-product-context",
      storeId,
      productId,
      customerId ?? "",
      vendorId ?? "",
    ],
    queryFn: async () => {
      if (!storeId || !productId) return null;
      const rpc = await rpcLineProductContext({
        storeId,
        productIds: [productId],
        customerId,
        vendorId,
      });
      if (rpc?.[productId]) return rpc[productId];

      const params = new URLSearchParams({
        storeId,
        productIds: productId,
      });
      if (customerId) params.set("customerId", customerId);
      if (vendorId) params.set("vendorId", vendorId);
      const res = await adminGet<{ data: Record<string, LineProductContext> }>(
        `erp/line-product-context?${params.toString()}`,
      );
      return res.data[productId] ?? null;
    },
    enabled: enabled && Boolean(storeId && productId),
    staleTime: ERP_PRODUCT_SEARCH_STALE_MS,
  });

  if (!storeId || !productId) {
    return (
      <p className="text-xs text-muted-foreground">
        Select a store and link a catalog product to view details.
      </p>
    );
  }

  if (isPending) {
    return <AdminPanelSkeleton rows={3} />;
  }

  if (isError || !data) {
    return (
      <p className="text-xs text-muted-foreground">
        Could not load product details for this line.
      </p>
    );
  }

  const stockValue =
    data.onHandStock < 0
      ? `${formatStock(data.onHandStock)} (short)`
      : formatStock(data.onHandStock);

  const counterpartyValue = formatPrice(
    counterpartyId ? data.counterpartyLastPrice : null,
  );

  const metrics: MetricDef[] =
    variant === "purchase"
      ? [
          {
            label: "On-hand stock",
            labelSubline: "(store)",
            value: stockValue,
            emphasize: true,
          },
          {
            label: "Avg inventory cost",
            labelSubline: "(WAC)",
            value: formatPrice(data.avgPurchasePrice),
          },
          {
            label: "Last purchase unit",
            labelSubline: "(loaded)",
            value: formatPrice(data.lastPurchasePrice),
          },
          {
            label: "Last bill rate",
            labelSubline: "(this vendor)",
            value: counterpartyValue,
          },
          {
            label: "Avg selling price",
            value: formatPrice(data.avgSellingPrice),
          },
          {
            label: "Last selling price",
            value: formatPrice(data.lastSellingPrice),
          },
        ]
      : [
          {
            label: "On-hand stock",
            labelSubline: "(store)",
            value: stockValue,
            emphasize: true,
          },
          {
            label: "Avg inventory cost",
            labelSubline: "(WAC)",
            value: formatPrice(data.avgPurchasePrice),
          },
          {
            label: "Last purchase unit",
            labelSubline: "(loaded)",
            value: formatPrice(data.lastPurchasePrice),
          },
          {
            label: "Avg selling price",
            value: formatPrice(data.avgSellingPrice),
          },
          {
            label: "Last selling price",
            value: formatPrice(data.lastSellingPrice),
          },
          {
            label: "Last selling price",
            labelSubline: "(this customer)",
            value: counterpartyValue,
          },
        ];

  return (
    <div
      className="grid w-full grid-cols-6 gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-3"
      role="group"
      aria-label="Line product metrics"
    >
      {metrics.map((metric) => (
        <MetricBlock
          key={`${metric.label}-${metric.labelSubline ?? ""}`}
          label={metric.label}
          labelSubline={metric.labelSubline}
          value={metric.value}
          emphasize={metric.emphasize}
        />
      ))}
    </div>
  );
}
