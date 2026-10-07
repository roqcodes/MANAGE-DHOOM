"use client";

import type { ReactNode } from "react";

import { AdminBreadcrumb } from "@/modules/admin/components/admin-breadcrumb";
import { AdminInfoTip } from "@/modules/admin/ui/admin-info-tip";
import { cn } from "@/lib/utils";
import { RequiredFieldMark, showRequiredMark } from "@/lib/required-field-label";

export function AdminPageLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[min(100%,90rem)] flex-col gap-4 px-3 py-4 sm:px-5 sm:py-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdminPageHeader({
  title,
  description,
  info,
  actions,
  breadcrumb,
  backHref,
}: {
  title: string;
  description?: string;
  info?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  backHref?: string;
}) {
  return (
    <div className="space-y-3">
      {breadcrumb && breadcrumb.length > 0 ? (
        <AdminBreadcrumb items={breadcrumb} backHref={backHref} />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            {info ? <AdminInfoTip title={title}>{info}</AdminInfoTip> : null}
          </div>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminFormLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]", className)}>
      {children}
    </div>
  );
}

export function AdminFormSection({
  title,
  description,
  info,
  children,
  className,
}: {
  title: string;
  description?: string;
  info?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5",
        className,
      )}
    >
      <div className="mb-4 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
            {title}
          </h2>
          {info ? <AdminInfoTip title={title}>{info}</AdminInfoTip> : null}
        </div>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function AdminFormGrid({
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
        cols === 2 && "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
        cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

export function AdminFormField({
  label,
  htmlFor,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const showRequired = showRequiredMark(required, children);

  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
        {label}
        {showRequired ? <RequiredFieldMark /> : null}
      </label>
      <div className="[&_input]:h-10 [&_button]:h-10 [&_select]:h-10 [&_textarea]:min-h-[2.5rem]">
        {children}
      </div>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
