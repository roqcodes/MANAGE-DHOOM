"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";

import type { LastFiledVatReturnSummary, VatReturnPreview } from "@/common/erp/finance-types";
import { adminGet, adminPost } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import {
  resolveVatPeriodPreset,
  VAT_FROM_LAST_FILED_PRESET,
  VAT_QUARTER_MONTH_LABELS,
  vatPresetYears,
  vatQuarterPresetId,
  type VatCalendarQuarter,
  type VatPeriodPresetId,
} from "@/modules/admin/views/finance/vat-return-period-presets";
import { cn } from "@/lib/utils";

export type VatReturnFormViewProps = ErpFormViewBaseProps;

export function VatReturnFormView({
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: VatReturnFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode: "create" });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [activePreset, setActivePreset] = useState<VatPeriodPresetId | null>(null);
  const [lastFiled, setLastFiled] = useState<LastFiledVatReturnSummary>(null);
  const [lastFiledLoading, setLastFiledLoading] = useState(false);
  const [preview, setPreview] = useState<VatReturnPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const isModal = variant === "modal";

  useEffect(() => {
    if (!effectiveStoreId) {
      setLastFiled(null);
      return;
    }

    setLastFiledLoading(true);
    const q = new URLSearchParams({ storeId: effectiveStoreId });
    adminGet<LastFiledVatReturnSummary>(`erp/vat-returns/last-filed?${q.toString()}`)
      .then((data) => setLastFiled(data))
      .catch(() => setLastFiled(null))
      .finally(() => setLastFiledLoading(false));
  }, [effectiveStoreId]);

  useEffect(() => {
    if (!effectiveStoreId || !periodStart || !periodEnd || periodEnd < periodStart) {
      setPreview(null);
      return;
    }

    const q = new URLSearchParams({
      storeId: effectiveStoreId,
      periodStart,
      periodEnd,
    });
    setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      adminGet<VatReturnPreview>(`erp/vat-returns/preview?${q.toString()}`)
        .then((data) => setPreview(data))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [effectiveStoreId, periodStart, periodEnd]);

  function applyPreset(id: VatPeriodPresetId) {
    const range = resolveVatPeriodPreset(id, lastFiled?.period_end ?? null);
    if (!range) return;
    setPeriodStart(range.start);
    setPeriodEnd(range.end);
    setActivePreset(id);
    setError(null);
  }

  function handlePeriodStartChange(value: string) {
    setPeriodStart(value);
    setActivePreset(null);
  }

  function handlePeriodEndChange(value: string) {
    setPeriodEnd(value);
    setActivePreset(null);
  }

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/vat-returns");
    }
  }

  function handleSuccessNavigate() {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.();
      return;
    }
    router.push("/admin/erp/vat-returns");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!effectiveStoreId) return setError(storeRequiredMessage ?? "Store is required.");
    if (!periodStart || !periodEnd) return setError("Period dates are required.");
    if (periodEnd < periodStart) return setError("End date must be on or after start date.");

    startTransition(async () => {
      try {
        await adminPost("erp/vat-returns", {
          storeId: effectiveStoreId,
          periodStart,
          periodEnd,
          notes: notes.trim() || undefined,
        });
        handleSuccessNavigate();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save VAT return.");
      }
    });
  }

  if (isModal && !open) return null;

  const title = "Add VAT return";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save VAT return"
      pending={isPending}
    />
  ) : undefined;

  const lastFiledHint = lastFiled
    ? `Last filed period ended ${format(parseISO(lastFiled.period_end), "dd MMM yyyy")}.`
    : lastFiledLoading
      ? "Checking last filed return…"
      : "No filed return yet for this store.";

  const presetYears = vatPresetYears();
  const fromLastFiledDisabled =
    !effectiveStoreId ||
    !resolveVatPeriodPreset("from_last_filed", lastFiled?.period_end ?? null);

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Create a VAT return for a store and reporting period."
      backHref="/admin/erp/vat-returns"
      breadcrumb={[
        { label: "VAT returns", href: "/admin/erp/vat-returns" },
        { label: title },
      ]}
      size="md"
      formId={formId}
      pending={isPending}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormSection title="Return details">
          <AdminFormGrid cols={3}>
            <AdminFormField label="Store" required>
              <ActiveStoreFormField
                mode="create"
                stores={stores}
                activeStoreId={activeStoreId}
                storeId={storeId}
                onStoreIdChange={setStoreId}
                label=""
              />
            </AdminFormField>
            <AdminFormField label="VAT return start date" required>
              <Input
                type="date"
                value={periodStart}
                onChange={(e) => handlePeriodStartChange(e.target.value)}
                required
              />
            </AdminFormField>
            <AdminFormField label="VAT return end date" required>
              <Input
                type="date"
                value={periodEnd}
                onChange={(e) => handlePeriodEndChange(e.target.value)}
                required
              />
            </AdminFormField>
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Period presets</p>
              <div className="space-y-4">
                {presetYears.map((year) => (
                  <div key={year} className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">{year}</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {([1, 2, 3, 4] as VatCalendarQuarter[]).map((quarter) => {
                        const presetId = vatQuarterPresetId(year, quarter);
                        const months = VAT_QUARTER_MONTH_LABELS[quarter].join(" · ");
                        return (
                          <Button
                            key={presetId}
                            type="button"
                            variant={activePreset === presetId ? "secondary" : "outline"}
                            disabled={!effectiveStoreId}
                            className="h-auto min-h-9 flex-col items-start gap-0.5 px-3 py-2 text-left sm:flex-row sm:items-center sm:gap-2"
                            onClick={() => applyPreset(presetId)}
                          >
                            <span className="text-xs font-semibold">Q{quarter}</span>
                            <span className="text-[11px] font-normal text-muted-foreground">
                              {months}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div>
                  <Button
                    type="button"
                    size="xs"
                    variant={
                      activePreset === VAT_FROM_LAST_FILED_PRESET.id ? "secondary" : "outline"
                    }
                    disabled={fromLastFiledDisabled}
                    onClick={() => applyPreset(VAT_FROM_LAST_FILED_PRESET.id)}
                  >
                    {VAT_FROM_LAST_FILED_PRESET.label}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{lastFiledHint}</p>
            </div>
            <AdminFormField label="Note" className="sm:col-span-2 lg:col-span-3">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>

        {effectiveStoreId && periodStart && periodEnd && periodEnd >= periodStart ? (
          <AdminFormSection title="Tax summary preview">
            {previewLoading ? (
              <p className="text-sm text-muted-foreground">Calculating…</p>
            ) : preview ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <PreviewMetric label="Output tax (sales)" value={preview.output_tax} />
                <PreviewMetric label="Input tax (purchases)" value={preview.input_tax} />
                {preview.carry_forward_credit > 0 ? (
                  <PreviewMetric
                    label="Prior credit applied"
                    value={preview.carry_forward_credit}
                  />
                ) : null}
                <PreviewMetric label="Tax payable" value={preview.total_tax_payable} highlight="payable" />
                <PreviewMetric
                  label="Recoverable credit"
                  value={preview.recoverable_tax}
                  highlight={preview.recoverable_tax > 0 ? "credit" : undefined}
                />
                <PreviewMetric label="Balance due" value={preview.total_tax_payable} highlight="payable" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Could not load preview. Apply the latest database migration if this persists.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Tax payable is output minus input minus any prior filed recoverable credit, floored at
              zero. Excess input becomes recoverable credit to carry forward; balance due follows tax
              payable (no VAT payment when payable is zero).
            </p>
          </AdminFormSection>
        ) : null}

        <ErrorsFeedbackBridge errors={error} />

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/vat-returns" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save VAT return"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}

function PreviewMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: "payable" | "credit";
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-base font-semibold tabular-nums",
          highlight === "credit" && value > 0 && "text-primary",
        )}
      >
        {formatCurrencyAmount(value)}
      </p>
    </div>
  );
}
