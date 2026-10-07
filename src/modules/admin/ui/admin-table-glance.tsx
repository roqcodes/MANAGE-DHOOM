"use client";

import type { LucideIcon } from "lucide-react";
import { Building2, ChevronDown, Mail, Phone } from "lucide-react";
import type { ReactNode } from "react";

import type { AdminUser, ProductWithCategoryListItem, Vendor } from "@/common/admin/types";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AdminTableLink } from "@/modules/admin/ui/admin-table-link";
import { formatCustomerId, isCustomerBlocked } from "@/modules/customers/components/customers-ui";
import { formatProductPrice } from "@/modules/products/components/products-ui";

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AdminTableGlanceShell({
  label,
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  label: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <div className="border-b border-border/60 bg-muted/25 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-[13px] font-semibold leading-snug text-foreground">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2">{children}</div>
      {footer ? (
        <div className="border-t border-border/60 bg-muted/10 px-3 py-2">{footer}</div>
      ) : null}
    </div>
  );
}

export function AdminTableGlanceMetaRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
      <Icon className="mt-0.5 size-3 shrink-0 text-muted-foreground/70" aria-hidden />
      <span className="min-w-0 break-all">{children}</span>
    </p>
  );
}

export function AdminTableGlanceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/50 bg-background/80 px-2 py-1.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

export function AdminTableGlanceFooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <AdminTableLink href={href} className="text-[11px]">
      {children}
    </AdminTableLink>
  );
}

function AdminTableGlancePopover({
  triggerLabel,
  triggerClassName,
  shellLabel,
  title,
  subtitle,
  stats,
  meta,
  avatarInitials,
  mutedTrigger,
}: {
  triggerLabel: string;
  triggerClassName?: string;
  shellLabel: string;
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string }[];
  meta?: { icon: LucideIcon; content: ReactNode }[];
  avatarInitials?: string;
  mutedTrigger?: boolean;
}) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle || trimmedTitle === "—") {
    return <span className="text-muted-foreground">—</span>;
  }

  const hasBody =
    Boolean(avatarInitials) ||
    Boolean(meta?.length) ||
    Boolean(stats?.length) ||
    Boolean(subtitle?.trim());

  if (!hasBody) {
    return (
      <span
        className={cn(
          "inline-block max-w-full truncate text-[13px]",
          mutedTrigger ? "text-muted-foreground" : "font-medium text-foreground",
          triggerClassName,
        )}
      >
        {triggerLabel}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex max-w-full items-center gap-1 text-left text-[13px] leading-snug hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              mutedTrigger ? "font-normal text-muted-foreground" : "font-medium text-foreground",
              triggerClassName,
            )}
          />
        }
      >
        <span className="min-w-0 truncate">{triggerLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[17.5rem] gap-0 p-0">
        <AdminTableGlanceShell label={shellLabel} title={trimmedTitle} subtitle={subtitle}>
          {avatarInitials ? (
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {avatarInitials}
              </span>
            </div>
          ) : null}
          {meta?.map((row, i) => (
            <AdminTableGlanceMetaRow key={i} icon={row.icon}>
              {row.content}
            </AdminTableGlanceMetaRow>
          ))}
          {stats && stats.length > 0 ? (
            <div
              className={cn(
                "grid gap-1.5",
                stats.length >= 2 ? "grid-cols-2" : "grid-cols-1",
              )}
            >
              {stats.map((stat) => (
                <AdminTableGlanceStat key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </div>
          ) : null}
        </AdminTableGlanceShell>
      </PopoverContent>
    </Popover>
  );
}

function plainEntityLabel(
  display: string,
  opts?: { muted?: boolean; className?: string },
) {
  if (display === "—") return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-block max-w-full truncate text-[13px]",
        opts?.muted ? "text-muted-foreground" : "font-medium text-foreground",
        opts?.className,
      )}
    >
      {display}
    </span>
  );
}

export function ErpCustomerTableGlance({
  userId,
  name,
  subtitle,
  stats,
  email,
  phone,
  company,
}: {
  userId?: string | null;
  name?: string | null;
  subtitle?: string;
  stats?: { label: string; value: string }[];
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}) {
  const display = name?.trim() || company?.trim() || "—";
  const meta: { icon: LucideIcon; content: ReactNode }[] = [];
  if (company?.trim() && company.trim() !== name?.trim()) {
    meta.push({ icon: Building2, content: company.trim() });
  }
  if (email?.trim()) meta.push({ icon: Mail, content: email.trim() });
  if (phone?.trim()) meta.push({ icon: Phone, content: phone.trim() });

  const hasPopoverContent =
    meta.length > 0 || Boolean(stats?.length) || Boolean(subtitle?.trim());

  if (!hasPopoverContent) {
    if (userId && display !== "—") {
      return (
        <AdminTableLink href={`/admin/customers/${userId}`} className="block max-w-full truncate text-[13px]">
          {display}
        </AdminTableLink>
      );
    }
    return plainEntityLabel(display);
  }

  return (
    <AdminTableGlancePopover
      triggerLabel={display}
      shellLabel="Customer"
      title={display}
      subtitle={subtitle}
      avatarInitials={display !== "—" ? initialsFromName(display) : undefined}
      meta={meta.length > 0 ? meta : undefined}
      stats={stats}
    />
  );
}

export function ErpVendorTableGlance({
  vendorId,
  name,
  contact,
  email,
  subtitle,
  stats,
}: {
  vendorId?: string | null;
  name?: string | null;
  contact?: string | null;
  email?: string | null;
  subtitle?: string;
  stats?: { label: string; value: string }[];
}) {
  const display = name?.trim() || "—";
  const meta: { icon: LucideIcon; content: ReactNode }[] = [];
  if (contact?.trim()) meta.push({ icon: Phone, content: contact.trim() });
  if (email?.trim()) meta.push({ icon: Mail, content: email.trim() });

  const hasPopoverContent =
    meta.length > 0 || Boolean(stats?.length) || Boolean(subtitle?.trim());

  if (!hasPopoverContent) {
    if (vendorId && display !== "—") {
      return (
        <AdminTableLink
          href={`/admin/vendors/${vendorId}/erp`}
          className="block max-w-full truncate text-[13px]"
        >
          {display}
        </AdminTableLink>
      );
    }
    return plainEntityLabel(display);
  }

  return (
    <AdminTableGlancePopover
      triggerLabel={display}
      shellLabel="Vendor"
      title={display}
      subtitle={subtitle}
      avatarInitials={display !== "—" ? initialsFromName(display) : undefined}
      meta={meta.length > 0 ? meta : undefined}
      stats={stats}
    />
  );
}

/** Store name only — list tables already show the branch; no popover. */
export function ErpStoreTableGlance({
  name,
}: {
  storeId?: string | null;
  name?: string | null;
}) {
  return plainEntityLabel(name?.trim() || "—", { muted: true });
}

/** Document reference — row actions and amount columns carry the detail; link to open. */
export function ErpDocumentTableGlance({
  triggerLabel,
  viewHref,
}: {
  triggerLabel: string;
  viewHref: string;
  shellLabel?: string;
  title?: string;
  subtitle?: string;
  viewLabel?: string;
  stats?: { label: string; value: string }[];
}) {
  const label = triggerLabel.trim() || "—";
  if (label === "—") return <span className="text-muted-foreground">—</span>;
  return (
    <AdminTableLink href={viewHref} className="text-[13px]">
      {label}
    </AdminTableLink>
  );
}

export function CatalogCustomerTableGlance({ user }: { user: AdminUser }) {
  const name = user.name ?? user.company_name ?? "Unnamed customer";
  const orderStat =
    user.order_count != null && user.order_count > 0
      ? [{ label: "Lifetime orders", value: user.order_count.toLocaleString("en-IN") }]
      : undefined;

  if (!orderStat) {
    return (
      <AdminTableLink href={`/admin/customers/${user.id}`} className="text-[13px]">
        {name}
      </AdminTableLink>
    );
  }

  const blocked = isCustomerBlocked(user);
  return (
    <AdminTableGlancePopover
      triggerLabel={name}
      shellLabel="Customer"
      title={name}
      subtitle={`${formatCustomerId(user)}${blocked ? " · Blocked" : ""}`}
      avatarInitials={initialsFromName(name)}
      stats={orderStat}
    />
  );
}

export function CatalogVendorTableGlance({ vendor }: { vendor: Vendor }) {
  const name = vendor.name ?? "Unnamed vendor";
  return (
    <AdminTableLink href={`/admin/vendors/${vendor.id}`} className="text-[13px]">
      {name}
    </AdminTableLink>
  );
}

export function CatalogProductTableGlance({
  product,
}: {
  product: ProductWithCategoryListItem;
  storeName?: string | null;
}) {
  const name = product.name ?? "Untitled item";
  const multiSku = product.variant_count > 1;

  if (!multiSku) {
    return (
      <AdminTableLink href={`/admin/products/${product.id}`} className="text-[13px]">
        {name}
      </AdminTableLink>
    );
  }

  return (
    <AdminTableGlancePopover
      triggerLabel={name}
      shellLabel="Product"
      title={name}
      subtitle={product.categories?.name ?? "Uncategorized"}
      stats={[
        {
          label: "SKUs",
          value: product.variant_count.toLocaleString("en-IN"),
        },
        {
          label: "From price",
          value: formatProductPrice(product.price_min),
        },
      ]}
    />
  );
}
