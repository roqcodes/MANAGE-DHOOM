"use client";

import { useCallback, useMemo, type ComponentType, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ShoppingCart,
  TrendingUp,
  UserX,
} from "lucide-react";

import type { AnalyticsPayload } from "@/common/analytics/types";
import { AnalyticsDatePicker } from "@/components/analytics/analytics-date-picker";
import { CustomChartBuilder } from "@/components/analytics/custom-chart-builder";
import { CustomerActivityTable } from "@/components/analytics/customer-activity-table";
import { FunnelVisualizer } from "@/components/analytics/funnel-visualizer";
import { ProductReachDetails } from "@/components/analytics/product-reach-details";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyAmount } from "@/components/currency-amount";
import { formatCurrencyCompactAmount } from "@/lib/format-currency";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { useCurrencySettings } from "@/modules/settings/providers/currency-settings-provider";

function defaultFrom() {
  return format(subDays(new Date(), 29), "yyyy-MM-dd");
}

function defaultTo() {
  return format(new Date(), "yyyy-MM-dd");
}

function KpiCard({
  label,
  value,
  hint,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  delta?: number;
  icon: ComponentType<{ className?: string }>;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="border border-border bg-card shadow-none ring-0">
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <span className="flex size-7 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
            <Icon className="size-3.5" />
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {delta != null ? (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${
                up ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {up ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Math.abs(delta).toFixed(1)}% vs prior
            </span>
          ) : null}
          {hint ? (
            <span className="text-xs text-muted-foreground">{hint}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-3 font-sans sm:px-4 sm:py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

export function AnalyticsPage() {
  const { label: currencyLabel, settings } = useCurrencySettings();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? defaultFrom();
  const to = searchParams.get("to") ?? defaultTo();
  const category = searchParams.get("category") ?? "all";
  const tier = searchParams.get("tier") ?? "all";
  const region = searchParams.get("region") ?? "all";
  const product = searchParams.get("product") ?? "all";
  const x = searchParams.get("x") ?? "date_daily";
  const y = searchParams.get("y") ?? "revenue";

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("from", from);
    sp.set("to", to);
    if (category !== "all") sp.set("category", category);
    if (tier !== "all") sp.set("tier", tier);
    if (region !== "all") sp.set("region", region);
    if (product !== "all") sp.set("product", product);
    if (x !== "date_daily") sp.set("x", x);
    if (y !== "revenue") sp.set("y", y);
    return sp.toString();
  }, [from, to, category, tier, region, product, x, y]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: adminQueryKeys.analytics(queryString),
    queryFn: () => adminGet<AnalyticsPayload>(`analytics?${queryString}`),
    placeholderData: keepPreviousData,
  });

  const setProduct = useCallback(
    (value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!value || value === "all") next.delete("product");
      else next.set("product", value);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  if (isPending && !data) return <AnalyticsSkeleton />;

  if (isError) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-3 py-6 font-sans sm:px-4">
        <div className="flex items-start gap-3 rounded-xl border border-rose-200/60 bg-rose-50/40 p-5">
          <AlertTriangle className="size-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-semibold text-rose-900">
              Failed to load analytics.
            </p>
            <p className="mt-1 text-sm text-rose-700">
              {error instanceof Error ? error.message : "Unknown error."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <AnalyticsSkeleton />;

  const { kpis, funnel, chartSeries, activities, productDetails, filterOptions } =
    data;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-3 py-3 font-sans sm:px-4 sm:py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Revenue, funnel conversion, and customer activity intelligence.
          </p>
        </div>
        <AnalyticsDatePicker
          categories={filterOptions.categories}
          tiers={filterOptions.tiers}
          regions={filterOptions.regions}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <KpiCard
          label={currencyLabel("Total Revenue")}
          value={formatCurrencyCompactAmount(kpis.totalRevenue, settings)}
          delta={kpis.revenueChangePct}
          icon={Banknote}
        />
        <KpiCard
          label="Total Orders"
          value={kpis.totalOrders.toLocaleString("en-IN")}
          hint={
            <>
              AOV{" "}
              <CurrencyAmount
                amount={kpis.averageOrderValue}
                className="text-xs"
              />
            </>
          }
          icon={ShoppingCart}
        />
        <KpiCard
          label="Funnel Conversion"
          value={`${kpis.funnelConversionRate.toFixed(1)}%`}
          hint="Viewers → purchase (reach)"
          icon={TrendingUp}
        />
        <KpiCard
          label="Cart Abandonment"
          value={`${kpis.cartAbandonmentRate.toFixed(1)}%`}
          hint="Carted customers without purchase"
          icon={UserX}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="border border-border bg-card shadow-none ring-0">
          <CardHeader className="border-b border-border">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-semibold">
                Product engagement & conversion
              </CardTitle>
              <Select
                value={product}
                onValueChange={(v) => setProduct(v ?? "all")}
              >
                <SelectTrigger size="sm" className="min-w-52 border-border">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All products</SelectItem>
                    {filterOptions.products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <FunnelVisualizer stages={funnel} />
          </CardContent>
        </Card>

        <CustomChartBuilder data={chartSeries} />
      </section>

      <ProductReachDetails rows={productDetails} />

      <CustomerActivityTable rows={activities} />
    </div>
  );
}
