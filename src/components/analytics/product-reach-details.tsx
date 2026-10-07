"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ShoppingBag, Users } from "lucide-react";

import type { ProductReachCustomer, ProductReachDetail } from "@/common/analytics/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyAmount } from "@/components/currency-amount";
import { useCurrencySettings } from "@/modules/settings/providers/currency-settings-provider";
import { cn } from "@/lib/utils";

function CustomerList({
  title,
  count,
  customers,
  tone,
}: {
  title: string;
  count: number;
  customers: ProductReachCustomer[];
  tone: "view" | "cart" | "order";
}) {
  const toneClass =
    tone === "order"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200/70"
      : tone === "cart"
        ? "bg-amber-50 text-amber-700 border-amber-200/70"
        : "bg-sky-50 text-sky-700 border-sky-200/70";

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <Badge variant="outline" className={cn("border tabular-nums", toneClass)}>
          {count.toLocaleString("en-IN")} unique
        </Badge>
      </div>
      {customers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No customers yet.</p>
      ) : (
        <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {customers.map((c) => (
            <li
              key={`${title}-${c.customerId}-${c.at}`}
              className="flex items-start justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                {c.customerId ? (
                  <Link
                    href={`/admin/customers/${c.customerId}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {c.customerName}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{c.customerName}</span>
                )}
                <p className="truncate text-muted-foreground">
                  {c.phone?.trim() || "No phone"}
                </p>
              </div>
              <div className="shrink-0 text-right tabular-nums text-muted-foreground">
                {c.quantity != null && c.quantity > 0 ? (
                  <p>
                    qty {c.quantity}
                    {c.value != null ? (
                      <>
                        {" · "}
                        <CurrencyAmount
                          amount={c.value}
                          showSymbol={false}
                          className="text-xs"
                        />
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductDetailRow({ row }: { row: ProductReachDetail }) {
  const { label: currencyLabel } = useCurrencySettings();
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-muted/40"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
          <ShoppingBag className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {row.productName}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {row.viewCount} viewed · {row.cartCount} carted · {row.orderCount}{" "}
            ordered
            {row.unitsSold > 0 ? ` · ${row.unitsSold} units` : ""}
          </p>
        </div>
        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-sm font-semibold tabular-nums">
            <CurrencyAmount amount={row.revenue} showSymbol={false} />
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {currencyLabel("Revenue")}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="grid gap-2 border-t border-border bg-muted/20 px-3 py-3 md:grid-cols-3">
          <CustomerList
            title="Viewed (unique)"
            count={row.viewCount}
            customers={row.viewers}
            tone="view"
          />
          <CustomerList
            title="Added to cart (unique)"
            count={row.cartCount}
            customers={row.carters}
            tone="cart"
          />
          <CustomerList
            title="Ordered (unique)"
            count={row.orderCount}
            customers={row.buyers}
            tone="order"
          />
        </div>
      ) : null}
    </div>
  );
}

export function ProductReachDetails({
  rows,
}: {
  rows: ProductReachDetail[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.productName.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <Card className="border border-border bg-card shadow-none ring-0">
      <CardHeader className="border-b border-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              Product-wise customer reach
            </CardTitle>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter products…"
            className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-56"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Unique customers who viewed, carted, or ordered each product. Expand a
          row for names.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No product reach data for this period.
          </div>
        ) : (
          filtered.map((row) => <ProductDetailRow key={row.productId} row={row} />)
        )}
      </CardContent>
    </Card>
  );
}
