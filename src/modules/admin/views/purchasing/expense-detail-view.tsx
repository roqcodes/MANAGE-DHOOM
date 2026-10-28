"use client";

import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Calendar,
  FileText,
  Hash,
  Landmark,
  ExternalLink,
  Percent,
  Store,
  User,
  Wallet,
} from "lucide-react";

import type { ErpExpenseDetail } from "@/common/erp/purchasing-types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "dd MMM yyyy");
  } catch {
    return value;
  }
}

function taxModeLabel(mode: string) {
  if (mode === "inclusive") return "Tax inclusive";
  if (mode === "exclusive") return "Tax exclusive";
  return "No tax";
}

function isLikelyImageAttachment(url: string) {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/.test(path)) return true;
  if (path.includes("/image/upload/")) return true;
  return !/\.pdf$/i.test(path);
}

type AttachmentImageOrientation = "landscape" | "portrait" | "square";

function attachmentOrientationFromSize(width: number, height: number): AttachmentImageOrientation {
  if (width <= 0 || height <= 0) return "landscape";
  const ratio = width / height;
  if (ratio > 1.12) return "landscape";
  if (ratio < 0.88) return "portrait";
  return "square";
}

function ExpenseAttachmentPreview({ url }: { url: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [orientation, setOrientation] = useState<AttachmentImageOrientation | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const showImage = isLikelyImageAttachment(url) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
    setOrientation(null);
    setAspectRatio(null);
  }, [url]);

  function onImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    setOrientation(attachmentOrientationFromSize(naturalWidth, naturalHeight));
    if (naturalWidth > 0 && naturalHeight > 0) {
      setAspectRatio(naturalWidth / naturalHeight);
    }
  }

  function onImageError() {
    setImageFailed(true);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b bg-muted/20 pb-4">
        <CardTitle className="text-base">Attachment</CardTitle>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Open in new tab
          <ExternalLink className="size-3.5" />
        </a>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {showImage ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "block overflow-hidden rounded-lg border border-border bg-muted/30",
              orientation === "portrait" && "mx-auto w-full max-w-[min(100%,440px)]",
              orientation === "square" && "mx-auto w-full max-w-2xl",
              orientation === "landscape" && "w-full",
              !orientation && "w-full",
            )}
            style={
              aspectRatio
                ? {
                    aspectRatio: String(aspectRatio),
                    maxHeight: "min(72vh, 900px)",
                  }
                : { minHeight: 160 }
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary / external receipt URLs */}
            <img
              src={url}
              alt="Expense attachment"
              className="size-full object-contain"
              onLoad={onImageLoad}
              onError={onImageError}
            />
          </a>
        ) : (
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
            <FileText className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Preview is not available for this file type.
            </p>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <a href={url} target="_blank" rel="noopener noreferrer">
                  View attachment
                </a>
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExpenseMetric({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  highlight?: "success" | "muted";
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 sm:px-5">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          highlight === "success" && "bg-emerald-50 text-emerald-600",
          (!highlight || highlight === "muted") && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-0.5 truncate text-lg font-semibold tabular-nums tracking-tight",
            highlight === "success" && "text-emerald-700",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function MetaField({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3", className)}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/80">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-medium text-foreground">{children}</div>
      </div>
    </div>
  );
}

function TotalsRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className={emphasis ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums", emphasis && "text-base font-semibold")}>{value}</span>
    </div>
  );
}

export function ExpenseDetailView({ expenseId }: { expenseId: string }) {
  const [expense, setExpense] = useState<ErpExpenseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminGet<ErpExpenseDetail>(`erp/expenses/${expenseId}`)
      .then(setExpense)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load expense"))
      .finally(() => setLoading(false));
  }, [expenseId]);

  if (loading) {
    return (
      <AdminPageLayout>
        <AdminPageSkeleton />
      </AdminPageLayout>
    );
  }

  if (error || !expense) {
    return (
      <AdminPageLayout>
        <p className="text-sm text-rose-700">{error ?? "Expense not found."}</p>
      </AdminPageLayout>
    );
  }

  const taxAmount = Number(expense.tax_amount ?? 0);
  const subtotal = Number(expense.amount ?? 0);
  const attachmentUrl = expense.attachment_url?.trim() || null;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={expense.expense_number}
        description={`${expense.store_name ?? "No store"} · ${formatDisplayDate(expense.expense_date)}`}
        backHref="/admin/erp/expenses"
        breadcrumb={[
          { label: "Expenses", href: "/admin/erp/expenses" },
          { label: expense.expense_number },
        ]}
        actions={
          <Button
            nativeButton={false}
            size="sm"
            variant="outline"
            render={<Link href={`/admin/erp/expenses/${expenseId}/edit`} />}
          >
            Edit
          </Button>
        }
      />

      <Card className="overflow-hidden border border-border py-0 ring-0">
        <div className="grid divide-y divide-border sm:grid-cols-2 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <ExpenseMetric
            label="Expense total"
            value={formatCurrencyAmount(expense.total_amount)}
            icon={Wallet}
            highlight="success"
          />
          <ExpenseMetric
            label="Subtotal"
            value={formatCurrencyAmount(subtotal)}
            icon={Landmark}
          />
          <ExpenseMetric
            label="Tax"
            value={
              taxAmount > 0
                ? `${formatCurrencyAmount(taxAmount)} (${expense.tax_percent}%)`
                : "—"
            }
            icon={Percent}
            highlight={taxAmount > 0 ? undefined : "muted"}
          />
        </div>
      </Card>

      <ErpDocumentTabsLayout
        detailsLabel="Expense details"
        entityId={expenseId}
        auditEntityType="expense"
        journalSourceType="expense"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
          <Card>
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-base">Expense information</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
              <MetaField icon={Landmark} label="Expense account">
                {expense.account_name ?? "—"}
              </MetaField>
              <MetaField icon={Store} label="Store">
                {expense.store_name ?? "—"}
              </MetaField>
              <MetaField icon={Calendar} label="Expense date">
                {formatDisplayDate(expense.expense_date)}
              </MetaField>
              <MetaField icon={Wallet} label="Paid through">
                {expense.paid_through_name ?? "—"}
              </MetaField>
              <MetaField icon={Hash} label="Reference">
                {expense.reference?.trim() || "—"}
              </MetaField>
              {expense.vendor_id || expense.vendor_name ? (
                <MetaField icon={Building2} label="Vendor">
                  {expense.vendor_id ? (
                    <Link
                      href={`/admin/vendors/${expense.vendor_id}`}
                      className="text-primary hover:underline"
                    >
                      {expense.vendor_name ?? "—"}
                    </Link>
                  ) : (
                    (expense.vendor_name ?? "—")
                  )}
                </MetaField>
              ) : null}
              {expense.user_id || expense.customer_name ? (
                <MetaField icon={User} label="Customer">
                  {expense.user_id ? (
                    <Link
                      href={`/admin/customers/${expense.user_id}`}
                      className="text-primary hover:underline"
                    >
                      {expense.customer_name ?? "—"}
                    </Link>
                  ) : (
                    (expense.customer_name ?? "—")
                  )}
                </MetaField>
              ) : null}
              {expense.notes?.trim() ? (
                <MetaField icon={FileText} label="Notes" className="sm:col-span-2">
                  <span className="font-normal whitespace-pre-wrap text-muted-foreground">
                    {expense.notes.trim()}
                  </span>
                </MetaField>
              ) : null}
            </CardContent>
          </Card>

          {attachmentUrl ? <ExpenseAttachmentPreview url={attachmentUrl} /> : null}
          </div>

          <Card className="h-fit">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <CardTitle className="text-base">Amount summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-5 text-sm">
              <TotalsRow label="Subtotal" value={formatCurrencyAmount(subtotal)} />
              <TotalsRow
                label={`Tax (${expense.tax_percent}%)`}
                value={formatCurrencyAmount(taxAmount)}
              />
              <TotalsRow label="Tax treatment" value={taxModeLabel(expense.tax_mode)} />
              <Separator />
              <TotalsRow
                label="Expense total"
                value={formatCurrencyAmount(expense.total_amount)}
                emphasis
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                nativeButton={false}
                render={<Link href="/admin/erp/expenses" />}
              >
                Back to expenses
              </Button>
            </CardContent>
          </Card>
        </div>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
