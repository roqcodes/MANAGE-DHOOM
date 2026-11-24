"use client";

import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ErpPartySummaryMetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "muted";
}) {
  return (
    <Card size="sm" className="border border-border ring-0">
      <CardContent className="flex flex-col gap-0.5 px-3 py-3 sm:gap-1 sm:px-4 sm:pt-4">
        <p className="text-[11px] font-medium leading-tight text-muted-foreground sm:text-xs">
          {label}
        </p>
        <p
          className={cn(
            "text-lg font-semibold tabular-nums tracking-tight sm:text-2xl",
            tone === "primary" && "text-primary",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function ErpPartyDetailMetricGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">{children}</div>
  );
}

export function ErpPartyDetailTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      className="-mx-1 flex gap-0.5 overflow-x-auto border-b px-1 [scrollbar-width:thin]"
      role="tablist"
      aria-label="Record sections"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            active === tab.id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Main column + sidebar; on mobile, sidebar (e.g. financial summary) appears first. */
export function ErpPartyDetailPageGrid({
  main,
  aside,
}: {
  main: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
      <aside className="order-1 min-w-0 lg:order-2 lg:col-start-2">{aside}</aside>
      <div className="order-2 min-w-0 space-y-4 lg:order-1 lg:col-start-1">{main}</div>
    </div>
  );
}

export function ErpPartyProfileHeaderCard({
  identity,
  actions,
}: {
  identity: ReactNode;
  actions: ReactNode;
}) {
  return (
    <Card className="border border-border ring-0">
      <CardContent className="flex flex-col gap-0 p-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-6">
        <div className="min-w-0 p-4 sm:flex-1 sm:p-0">{identity}</div>
        {actions ? (
          <div className="border-t border-border bg-muted/25 p-4 sm:ml-auto sm:w-auto sm:shrink-0 sm:border-t-0 sm:bg-transparent sm:p-0">
            {actions}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ErpPartyFinancialAsideCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "h-fit border border-border ring-0 lg:sticky lg:top-4",
        "border-primary/15 bg-primary/[0.02] lg:border-border lg:bg-card",
        className,
      )}
    >
      {children}
    </Card>
  );
}