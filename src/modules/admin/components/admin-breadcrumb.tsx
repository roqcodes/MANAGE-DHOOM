"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AdminBreadcrumbItem = {
  label: string;
  href?: string;
};

function resolveBreadcrumbParents(
  items: AdminBreadcrumbItem[],
  title: string,
): AdminBreadcrumbItem[] {
  if (items.length === 0) return [];
  if (items.length === 1) {
    const only = items[0]!;
    if (only.label === title || !only.href) return [];
    return [only];
  }
  const last = items[items.length - 1]!;
  if (last.label === title) return items.slice(0, -1);
  return items;
}

export function AdminCombinedPageHeading({
  title,
  breadcrumb = [],
  backHref,
  showBack = true,
  info,
  className,
}: {
  title: string;
  breadcrumb?: AdminBreadcrumbItem[];
  backHref?: string;
  showBack?: boolean;
  info?: ReactNode;
  className?: string;
}) {
  const parents = resolveBreadcrumbParents(breadcrumb, title);
  const resolvedBackHref =
    backHref ??
    [...breadcrumb].reverse().find((item) => item.href)?.href ??
    parents[parents.length - 1]?.href ??
    "/admin";
  const showBackButton = showBack && (parents.length > 0 || Boolean(backHref));

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {showBackButton ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8 shrink-0"
          nativeButton={false}
          render={<Link href={resolvedBackHref} />}
          aria-label="Go back"
        >
          <ArrowLeft className="size-4" />
        </Button>
      ) : null}

      <h1 className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-xl font-semibold leading-none tracking-tight text-foreground">
        {parents.map((item, index) => (
          <Fragment key={`${item.href ?? "p"}-${item.label}-${index}`}>
            {index > 0 ? (
              <span
                className="inline-flex items-center self-center text-[11px] font-normal leading-none text-muted-foreground/50"
                aria-hidden
              >
                /
              </span>
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className="inline-flex items-center self-center text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span className="inline-flex items-center self-center text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-muted-foreground">
                {item.label}
              </span>
            )}
          </Fragment>
        ))}
        {parents.length > 0 ? (
          <span
            className="inline-flex items-center self-center text-sm font-normal leading-none text-muted-foreground/45"
            aria-hidden
          >
            /
          </span>
        ) : null}
        <span className="inline-flex min-w-0 items-center self-center truncate leading-none">
          {title}
        </span>
        {info ? <span className="inline-flex shrink-0 items-center self-center">{info}</span> : null}
      </h1>
    </div>
  );
}

type AdminBreadcrumbProps = {
  items: AdminBreadcrumbItem[];
  /** Defaults to the last breadcrumb label. */
  title?: string;
  backHref?: string;
  showBack?: boolean;
  className?: string;
};

/** Breadcrumb trail merged into a single page title row (parents small caps / current full size). */
export function AdminBreadcrumb({
  items,
  title,
  backHref,
  showBack = true,
  className,
}: AdminBreadcrumbProps) {
  if (items.length === 0 && !title) return null;

  const resolvedTitle = title ?? items[items.length - 1]?.label ?? "";

  return (
    <AdminCombinedPageHeading
      title={resolvedTitle}
      breadcrumb={items}
      backHref={backHref}
      showBack={showBack}
      className={className}
    />
  );
}