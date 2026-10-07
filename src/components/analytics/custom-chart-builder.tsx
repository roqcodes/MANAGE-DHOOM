"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartDataPoint } from "@/common/analytics/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrencyAmount, type CurrencySettings } from "@/lib/format-currency";
import { useCurrencySettings } from "@/modules/settings/providers/currency-settings-provider";

const X_OPTIONS = [
  { id: "date_daily", label: "Date (Daily)" },
  { id: "date_weekly", label: "Date (Weekly)" },
  { id: "category", label: "Product Category" },
  { id: "tier", label: "Customer Tier" },
  { id: "payment_method", label: "Payment Method" },
  { id: "delivery_route", label: "Delivery Route" },
] as const;

const Y_OPTION_DEFS: { id: string; label?: string; revenue?: boolean }[] = [
  { id: "revenue", revenue: true },
  { id: "order_count", label: "Order Count" },
  { id: "product_views", label: "Product Reach" },
  { id: "add_to_carts", label: "Cart Reach" },
  { id: "units_sold", label: "Units Sold" },
  { id: "conversion", label: "Conversion %" },
];

type ChartType = "area" | "bar" | "line";

function ChartTooltip({
  active,
  payload,
  label,
  yAxis,
  settings,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
  yAxis: string;
  settings: CurrencySettings;
}) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0]?.value ?? 0);
  const formatted =
    yAxis === "revenue"
      ? formatCurrencyAmount(value, undefined, settings)
      : yAxis === "conversion"
        ? `${value.toFixed(1)}%`
        : value.toLocaleString(settings.locale);

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-none">
      <p className="font-medium text-foreground">{label}</p>
      <p className="tabular-nums text-muted-foreground">{formatted}</p>
    </div>
  );
}

export function CustomChartBuilder({ data }: { data: ChartDataPoint[] }) {
  const { label: currencyLabel, settings } = useCurrencySettings();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const xAxis = searchParams.get("x") ?? "date_daily";
  const yAxis = searchParams.get("y") ?? "revenue";
  const chartType = (searchParams.get("chart") as ChartType) || "area";

  const yOptions = Y_OPTION_DEFS.map((o) => ({
    id: o.id,
    label: o.revenue ? currencyLabel("Revenue") : (o.label ?? o.id),
  }));

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const stroke = "var(--primary)";
  const fillId = "analyticsChartFill";

  return (
    <Card className="border border-border bg-card shadow-none ring-0">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="text-sm font-semibold">Custom report builder</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={xAxis} onValueChange={(v) => v && setParam("x", v)}>
              <SelectTrigger size="sm" className="min-w-40 border-border">
                <SelectValue placeholder="X-Axis" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {X_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select value={yAxis} onValueChange={(v) => v && setParam("y", v)}>
              <SelectTrigger size="sm" className="min-w-40 border-border">
                <SelectValue placeholder="Y-Axis" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {yOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Tabs
              value={chartType}
              onValueChange={(v) => v && setParam("chart", v)}
            >
              <TabsList variant="default">
                <TabsTrigger value="area">Area</TabsTrigger>
                <TabsTrigger value="bar">Bar</TabsTrigger>
                <TabsTrigger value="line">Line</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "bar" ? (
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" width={48} />
                <Tooltip content={<ChartTooltip yAxis={yAxis} settings={settings} />} />
                <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : chartType === "line" ? (
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" width={48} />
                <Tooltip content={<ChartTooltip yAxis={yAxis} settings={settings} />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={stroke}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            ) : (
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" width={48} />
                <Tooltip content={<ChartTooltip yAxis={yAxis} settings={settings} />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={stroke}
                  strokeWidth={2}
                  fill={`url(#${fillId})`}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
