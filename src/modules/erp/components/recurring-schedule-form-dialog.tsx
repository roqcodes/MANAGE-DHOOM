"use client";

import { useEffect, useState, useTransition } from "react";

import type { RecurringScheduleRow } from "@/common/erp/types";
import { adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormModal,
  AdminFormSection,
  applyFieldValidation,
  CustomerSearchSelect,
  VendorSearchSelect,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProductLiveSearch, type ProductLiveSearchRow } from "@/modules/admin/ui";
import { SalesmanPinField } from "@/modules/erp/components/salesman-pin-field";
import { StoreSelect, useErpStores } from "@/modules/erp/components/use-erp-stores";
import { nullIfEmptyDate } from "@/lib/format-date";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

const FREQUENCY_OPTIONS: { value: RecurringScheduleRow["frequency"]; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const SELECT_CLS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs";

function lineFromSchedule(schedule: RecurringScheduleRow) {
  const lines =
    (schedule.payload?.lines as Array<{
      productId?: string;
      productName?: string;
      unitPrice?: number;
      purchasePrice?: number;
      taxRatePercent?: number;
    }>) ?? [];
  return lines[0] ?? null;
}

export function RecurringScheduleFormDialog({
  open,
  onOpenChange,
  onSuccess,
  schedule,
  defaultScheduleType,
  lockScheduleType = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  schedule?: RecurringScheduleRow | null;
  defaultScheduleType?: "invoice" | "purchase_bill";
  lockScheduleType?: boolean;
}) {
  const isEdit = Boolean(schedule?.id);
  const { stores, activeStoreId } = useErpStores();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | string[] | null>(null);
  const fieldValidation = useFormFieldValidation();

  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState<"invoice" | "purchase_bill">("purchase_bill");
  const [storeId, setStoreId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorLabel, setVendorLabel] = useState("");
  const [frequency, setFrequency] = useState<RecurringScheduleRow["frequency"]>("monthly");
  const [nextRunDate, setNextRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [amount, setAmount] = useState("");
  const [taxPercent, setTaxPercent] = useState("5");
  const [notes, setNotes] = useState("");
  const [salesmanPin, setSalesmanPin] = useState("");
  const [salesPersonId, setSalesPersonId] = useState<string | null>(null);

  const formId = "recurring-schedule-form";

  useEffect(() => {
    if (!open) return;

    if (schedule) {
      const line = lineFromSchedule(schedule);
      setName(schedule.name);
      setScheduleType(schedule.schedule_type);
      setStoreId(schedule.store_id ?? activeStoreId ?? "");
      setCustomerId(schedule.customer_id ?? "");
      setCustomerLabel(schedule.customer_name ?? "");
      setVendorId(schedule.vendor_id ?? "");
      setVendorLabel(schedule.vendor_name ?? "");
      setFrequency(schedule.frequency);
      setNextRunDate(nullIfEmptyDate(schedule.next_run_date) ?? new Date().toISOString().slice(0, 10));
      setProductId(line?.productId ?? "");
      setProductName(line?.productName ?? "");
      const lineAmount = line?.purchasePrice ?? line?.unitPrice;
      setAmount(lineAmount != null ? String(lineAmount) : "");
      setTaxPercent(line?.taxRatePercent != null ? String(line.taxRatePercent) : "5");
      setNotes(String(schedule.payload?.notes ?? ""));
      setSalesmanPin("");
      setSalesPersonId(
        typeof schedule.payload?.salesPersonId === "string"
          ? schedule.payload.salesPersonId
          : null,
      );
    } else {
      setScheduleType(defaultScheduleType ?? "purchase_bill");
      if (activeStoreId) setStoreId(activeStoreId);
    }
    setError(null);
  }, [open, schedule, activeStoreId, defaultScheduleType]);

  function resetForm() {
    setName("");
    setScheduleType(defaultScheduleType ?? "purchase_bill");
    setStoreId(activeStoreId ?? "");
    setCustomerId("");
    setCustomerLabel("");
    setVendorId("");
    setVendorLabel("");
    setFrequency("monthly");
    setNextRunDate(new Date().toISOString().slice(0, 10));
    setProductId("");
    setProductName("");
    setAmount("");
    setTaxPercent("5");
    setNotes("");
    setSalesmanPin("");
    setSalesPersonId(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const unitPrice = parseFloat(amount);
    const documentDate = nullIfEmptyDate(nextRunDate);
    const validationMessages = applyFieldValidation(
      [
        { key: "name", ok: Boolean(name.trim()), message: "Schedule name is required." },
        { key: "nextRunDate", ok: Boolean(documentDate), message: "Next run date is required." },
        {
          key: "lines",
          ok: Boolean(productName.trim()),
          message: "Line item description is required.",
        },
        {
          key: "lines",
          ok: Boolean(unitPrice && unitPrice > 0),
          message: "Amount must be greater than zero.",
        },
        {
          key: "customer",
          ok: scheduleType !== "invoice" || Boolean(customerId),
          message: "Customer is required for recurring invoices.",
        },
        {
          key: "salesmanPin",
          ok: scheduleType !== "invoice" || Boolean(salesPersonId),
          message: "Salesman PIN is required for recurring invoices.",
        },
        {
          key: "vendor",
          ok: scheduleType !== "purchase_bill" || Boolean(vendorId),
          message: "Vendor is required for recurring bills.",
        },
      ],
      fieldValidation.markFieldValidationFailed,
      fieldValidation.clearFieldValidation,
    );
    if (validationMessages) {
      setError(
        validationMessages.length === 1 ? validationMessages[0] : validationMessages,
      );
      return;
    }

    const linePayload: Record<string, unknown> = {
      productName: productName.trim(),
      quantity: 1,
      unitPrice,
      taxRatePercent: parseFloat(taxPercent) || 0,
    };
    if (scheduleType === "purchase_bill") {
      linePayload.purchasePrice = unitPrice;
      if (productId) linePayload.productId = productId;
    }

    const payload = {
      scheduleType,
      name: name.trim(),
      storeId: storeId || null,
      customerId: scheduleType === "invoice" ? customerId : null,
      vendorId: scheduleType === "purchase_bill" ? vendorId : null,
      frequency,
      nextRunDate: documentDate,
      payload: {
        lines: [linePayload],
        notes: notes.trim() || undefined,
        ...(scheduleType === "invoice" && salesPersonId
          ? { salesPersonId }
          : {}),
      },
    };

    startTransition(async () => {
      try {
        if (isEdit && schedule) {
          await adminPatch("erp/recurring-schedules", { id: schedule.id, ...payload });
        } else {
          await adminPost("erp/recurring-schedules", payload);
        }
        resetForm();
        onOpenChange(false);
        onSuccess();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : isEdit
              ? "Failed to update schedule"
              : "Failed to create schedule",
        );
      }
    });
  }

  const isInvoice = scheduleType === "invoice";
  const dialogTitle = isEdit
    ? isInvoice
      ? "Edit recurring invoice"
      : "Edit recurring bill"
    : isInvoice
      ? "New recurring invoice"
      : "New recurring bill";
  const dialogDescription = isEdit
    ? "Update schedule details, line item, and next run date."
    : isInvoice
      ? "Set up a repeating customer invoice. Run it manually anytime from the list."
      : "Set up a repeating vendor purchase bill. Run it manually anytime from the list.";

  return (
    <AdminFormModal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
      title={dialogTitle}
      description={dialogDescription}
      size="landscape"
      formId={formId}
      footer={
        <AdminFormActions
          formId={formId}
          onCancel={() => onOpenChange(false)}
          submitLabel={isEdit ? "Save changes" : "Create schedule"}
          pending={pending}
          errors={error}
        />
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
        <AdminFormColumns cols={2} columnRatio="1:1">
          <AdminFormSection title="Schedule">
            <AdminFormGrid cols={2}>
              <AdminFormField label="Schedule name" required fieldKey="name" className="sm:col-span-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    isInvoice
                      ? "e.g. Monthly retainer — Acme Corp"
                      : "e.g. Office rent — Global Supplies"
                  }
                  required
                />
              </AdminFormField>
              {!lockScheduleType ? (
                <AdminFormField label="Document type" required>
                  <select
                    className={SELECT_CLS}
                    value={scheduleType}
                    onChange={(e) =>
                      setScheduleType(e.target.value as "invoice" | "purchase_bill")
                    }
                  >
                    <option value="purchase_bill">Purchase bill</option>
                    <option value="invoice">Customer invoice</option>
                  </select>
                </AdminFormField>
              ) : null}
              <AdminFormField
                label="Frequency"
                required
                className={lockScheduleType ? "sm:col-span-2" : undefined}
              >
                <select
                  className={SELECT_CLS}
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as RecurringScheduleRow["frequency"])
                  }
                >
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Store" required>
                <StoreSelect value={storeId} onChange={setStoreId} stores={stores} label="" />
              </AdminFormField>
              <AdminFormField label="Next run date" required fieldKey="nextRunDate">
                <Input
                  type="date"
                  value={nextRunDate}
                  onChange={(e) => setNextRunDate(e.target.value)}
                  required
                />
              </AdminFormField>
              {scheduleType === "invoice" ? (
                <>
                  <AdminFormField label="Customer" required fieldKey="customer" className="sm:col-span-2">
                    <CustomerSearchSelect
                      value={customerId || null}
                      selectedLabel={customerLabel || undefined}
                      invalid={fieldValidation.isFieldInvalid("customer")}
                      onChange={(id, option) => {
                        setCustomerId(id ?? "");
                        setCustomerLabel(option?.label ?? "");
                      }}
                    />
                  </AdminFormField>
                  <AdminFormField label="Salesman PIN" required fieldKey="salesmanPin" className="sm:col-span-2">
                    <SalesmanPinField
                      value={salesmanPin}
                      onChange={setSalesmanPin}
                      onSalesmanChange={(s) => setSalesPersonId(s?.id ?? null)}
                      submitInvalid={fieldValidation.isFieldInvalid("salesmanPin")}
                    />
                  </AdminFormField>
                </>
              ) : (
                <AdminFormField label="Vendor" required fieldKey="vendor" className="sm:col-span-2">
                  <VendorSearchSelect
                    value={vendorId || null}
                    selectedLabel={vendorLabel || undefined}
                    invalid={fieldValidation.isFieldInvalid("vendor")}
                    onChange={(id, option) => {
                      setVendorId(id ?? "");
                      setVendorLabel(option?.label ?? "");
                    }}
                  />
                </AdminFormField>
              )}
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection
            title="Line item"
            className={
              fieldValidation.isFieldInvalid("lines") ? "ring-2 ring-destructive/60" : undefined
            }
          >
            <AdminFormGrid cols={2}>
              {scheduleType === "purchase_bill" ? (
                <AdminFormField
                  label="Link product"
                  optional
                  className="sm:col-span-2"
                  hint="For rent or subscriptions leave blank. Link a product only when each run should increase inventory."
                >
                  <ProductLiveSearch
                    catalog="purchase"
                    storeId={storeId || undefined}
                    placeholder="Search product to receive stock on each run…"
                    onSelect={(row: ProductLiveSearchRow) => {
                      if ("product_name" in row) {
                        setProductId(row.id);
                        setProductName(row.product_name);
                        const price = Number(row.purchase_price ?? 0);
                        if (price > 0) setAmount(String(price));
                        if (row.tax_rate_percent != null) {
                          setTaxPercent(String(row.tax_rate_percent));
                        }
                      }
                    }}
                  />
                  {productId ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Linked: {productName}{" "}
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => {
                          setProductId("");
                        }}
                      >
                        Clear link
                      </button>
                    </p>
                  ) : null}
                </AdminFormField>
              ) : null}
              <AdminFormField label="Description" required fieldKey="lines" className="sm:col-span-2">
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Monthly retainer, Rent, Subscription"
                  required
                />
              </AdminFormField>
              <AdminFormField label="Amount (AED)" required fieldKey="lines">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </AdminFormField>
              <AdminFormField label="Tax %" optional>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>
        </AdminFormColumns>

        <AdminFormSection title="Notes">
          <AdminFormField label="Document notes" optional>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes on generated documents"
              className="min-h-[4rem] resize-y"
            />
          </AdminFormField>
        </AdminFormSection>

        <ErrorsFeedbackBridge errors={error} />
      </form>
    </AdminFormModal>
  );
}
