"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { Loader2, Search } from "lucide-react";

import { PAGE_SIZE } from "@/common/admin/types";
import { AdminPageLayout, AdminPageHeader } from "@/modules/admin/ui";
import { cn } from "@/lib/utils";

/* ── Page shell ─────────────────────────────────────────────────────────── */

export function ErpPageShell({
  title,
  breadcrumbs,
  actions,
  children,
  info,
}: {
  title: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
  children: ReactNode;
  info?: ReactNode;
}) {
  return (
    <AdminPageLayout>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav className="text-xs text-muted-foreground" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`}>
              {i > 0 ? <span className="mx-1.5 text-border">/</span> : null}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-foreground hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <AdminPageHeader title={title} info={info} actions={actions} />
      {children}
    </AdminPageLayout>
  );
}

/* ── Buttons ────────────────────────────────────────────────────────────── */

type ErpBtnProps = {
  variant?: "primary" | "secondary" | "outline" | "view" | "destructive" | "ghost";
  size?: "sm" | "md";
  href?: string;
  children: ReactNode;
} & Omit<ComponentProps<"button">, "children">;

const btnVariants: Record<NonNullable<ErpBtnProps["variant"]>, string> = {
  primary:
    "border border-[#1abc9c] bg-[#1abc9c] text-white hover:bg-[#16a085] hover:border-[#16a085]",
  secondary:
    "border border-[#3498db] bg-[#3498db] text-white hover:bg-[#2980b9] hover:border-[#2980b9]",
  outline:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  view:
    "border border-[#1abc9c] bg-[#1abc9c] text-white hover:bg-[#16a085]",
  destructive:
    "border border-rose-500 bg-rose-500 text-white hover:bg-rose-600",
  ghost: "border border-transparent bg-transparent text-slate-600 hover:bg-slate-100",
};

export function ErpBtn({
  variant = "primary",
  size = "md",
  href,
  className,
  children,
  disabled,
  ...rest
}: ErpBtnProps) {
  const cls = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-[12px]" : "h-9 px-4 text-[13px]",
    btnVariants[variant],
    className,
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={cls} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}

export function ErpActionGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

/* ── Filters & search ─────────────────────────────────────────────────────── */

export function ErpSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-[200px] flex-1", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-[13px] text-slate-900 outline-none transition focus:border-[#1abc9c] focus:ring-2 focus:ring-[#1abc9c]/20"
      />
    </div>
  );
}

export function ErpFilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px]">
      {label ? <span className="font-medium text-slate-600">{label}</span> : null}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ── Table ────────────────────────────────────────────────────────────────── */

export function ErpTableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      {children}
    </div>
  );
}

export function ErpTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <table className={cn("w-full min-w-[960px] border-collapse text-[13px]", className)}>
      {children}
    </table>
  );
}

export function ErpThead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-slate-200 bg-slate-50">{children}</thead>;
}

export function ErpTh({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function ErpTbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function ErpTr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn("transition hover:bg-slate-50/80", className)}>{children}</tr>
  );
}

export function ErpTd({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 text-slate-800", className)}>{children}</td>;
}

/* ── Status badges ────────────────────────────────────────────────────────── */

export function ErpStockBadge({ value }: { value: number }) {
  const out = value <= 0;
  return (
    <span
      className={cn(
        "inline-flex min-w-[2.5rem] justify-center rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums",
        out ? "bg-slate-600 text-white" : "bg-[#1abc9c] text-white",
      )}
    >
      {value.toFixed(2)}
    </span>
  );
}

export function ErpEnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full border-2",
        enabled
          ? "border-[#1abc9c] bg-[#1abc9c]/10 text-[#1abc9c]"
          : "border-slate-300 bg-slate-100 text-slate-400",
      )}
      title={enabled ? "Enabled" : "Disabled"}
      aria-label={enabled ? "Enabled" : "Disabled"}
    >
      {enabled ? "✓" : "—"}
    </span>
  );
}

export function ErpStoreBadge({ storeName }: { storeName: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#1abc9c]/40 bg-[#1abc9c]/10 px-3 py-1 text-[12px] font-semibold text-[#148f77]">
      Store: {storeName}
    </span>
  );
}

/* ── Empty / loading ──────────────────────────────────────────────────────── */

export function ErpEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center text-[13px] text-slate-500">
      {message}
    </div>
  );
}

export function ErpLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-500">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {message}
    </div>
  );
}

/* ── Pagination ───────────────────────────────────────────────────────────── */

export function ErpPagination({
  total,
  page,
  basePath,
  extraParams = {},
}: {
  total: number;
  page: number;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;

  function buildUrl(p: number) {
    const params = new URLSearchParams({ ...extraParams, page: String(p) });
    return `${basePath}?${params.toString()}`;
  }

  const pages: (number | "ellipsis")[] = [];
  if (totalPages <= 8) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages - 2, page + 2);
    if (start > 1) pages.push("ellipsis");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 2) pages.push("ellipsis");
    pages.push(totalPages - 1);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-1">
      <ErpBtn
        variant="outline"
        size="sm"
        disabled={page === 0}
        onClick={() => router.push(buildUrl(page - 1))}
      >
        «
      </ErpBtn>
      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e-${i}`} className="px-1 text-slate-400">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildUrl(p)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-[13px] font-medium",
              p === page
                ? "bg-[#1abc9c] text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {p + 1}
          </Link>
        ),
      )}
      <ErpBtn
        variant="outline"
        size="sm"
        disabled={page >= totalPages - 1}
        onClick={() => router.push(buildUrl(page + 1))}
      >
        »
      </ErpBtn>
    </div>
  );
}

/* ── Forms ────────────────────────────────────────────────────────────────── */

export function ErpCard({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      {title ? (
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function ErpField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function ErpInput(props: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-[13px] text-slate-900 outline-none transition focus:border-[#1abc9c] focus:ring-2 focus:ring-[#1abc9c]/20 disabled:bg-slate-50",
        props.className,
      )}
    />
  );
}

export function ErpSelect(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-[13px] text-slate-900 outline-none focus:border-[#1abc9c] focus:ring-2 focus:ring-[#1abc9c]/20",
        props.className,
      )}
    />
  );
}

export function ErpTextarea(props: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[80px] w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:border-[#1abc9c] focus:ring-2 focus:ring-[#1abc9c]/20",
        props.className,
      )}
    />
  );
}

export function ErpFormGrid({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        cols === 1 && "grid-cols-1",
        cols === 2 && "grid-cols-1 sm:grid-cols-2",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

export function ErpSummaryCards({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {item.label}
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function ErpTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "border-b-2 px-4 py-2 text-[13px] font-medium transition",
            active === tab.id
              ? "border-[#1abc9c] text-[#148f77]"
              : "border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
