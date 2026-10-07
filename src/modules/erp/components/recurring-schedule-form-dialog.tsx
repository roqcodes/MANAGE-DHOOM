"use client";

import { useEffect, useState, useTransition } from "react";

import type { RecurringScheduleRow } from "@/common/erp/types";
import { adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import {
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  CustomerSearchSelect,
  VendorSearchSelect,
} from "@/modules/admin/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StoreSelect, useErpStores } from "@/modules/erp/components/use-erp-stores";

const FREQUENCY_OPTIONS: { value: RecurringScheduleRow["frequency"]; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

function lineFromSchedule(schedule: RecurringScheduleRow) {
  const lines =
    (schedule.payload?.lines as Array<{
      productName?: string;
      unitPrice?: number;
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
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [scheduleType, setScheduleType] = useState<"invoice" | "purchase_bill">("purchase_bill");
  const [storeId, setStoreId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerLabel, setCustomerLabel] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [vendorLabel, setVendorLabel] = useState("");
  const [frequency, setFrequency] = useState<RecurringScheduleRow["frequency"]>("monthly");
  const [nextRunDate, setNextRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [productName, setProductName] = useState("");
  const [amount, setAmount] = useState("");
  const [taxPercent, setTaxPercent] = useState("5");
  const [notes, setNotes] = useState("");

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
      setNextRunDate(schedule.next_run_date);
      setProductName(line?.productName ?? "");
      setAmount(line?.unitPrice != null ? String(line.unitPrice) : "");
      setTaxPercent(line?.taxRatePercent != null ? String(line.taxRatePercent) : "5");
      setNotes(String(schedule.payload?.notes ?? ""));
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
    setProductName("");
    setAmount("");
    setTaxPercent("5");
    setNotes("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const unitPrice = parseFloat(amount);
    if (!name.trim()) return setError("Schedule name is required.");
    if (!productName.trim()) return setError("Line item description is required.");
    if (!unitPrice || unitPrice <= 0) return setError("Amount must be greater than zero.");
    if (scheduleType === "invoice" && !customerId) {
      return setError("Customer is required for recurring invoices.");
    }
    if (scheduleType === "purchase_bill" && !vendorId) {
      return setError("Vendor is required for recurring bills.");
    }

    const payload = {
      scheduleType,
      name: name.trim(),
      storeId: storeId || null,
      customerId: scheduleType === "invoice" ? customerId : null,
      vendorId: scheduleType === "purchase_bill" ? vendorId : null,
      frequency,
      nextRunDate,
      payload: {
        lines: [
          {
            productName: productName.trim(),
            quantity: 1,
            unitPrice,
            taxRatePercent: parseFloat(taxPercent) || 0,
          },
        ],
        notes: notes.trim() || undefined,
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          <AdminFormSection title="Schedule">
            <AdminFormGrid cols={2}>
              <AdminFormField label="Schedule name" required className="sm:col-span-2">
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
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
              <AdminFormField label="Next run date" required>
                <Input
                  type="date"
                  value={nextRunDate}
                  onChange={(e) => setNextRunDate(e.target.value)}
                  required
                />
              </AdminFormField>
              {scheduleType === "invoice" ? (
                <AdminFormField label="Customer" required className="sm:col-span-2">
                  <CustomerSearchSelect
                    value={customerId || null}
                    selectedLabel={customerLabel || undefined}
                    onChange={(id, option) => {
                      setCustomerId(id ?? "");
                      setCustomerLabel(option?.label ?? "");
                    }}
                  />
                </AdminFormField>
              ) : (
                <AdminFormField label="Vendor" required className="sm:col-span-2">
                  <VendorSearchSelect
                    value={vendorId || null}
                    selectedLabel={vendorLabel || undefined}
                    onChange={(id, option) => {
                      setVendorId(id ?? "");
                      setVendorLabel(option?.label ?? "");
                    }}
                  />
                </AdminFormField>
              )}
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Line item">
            <AdminFormGrid cols={2}>
              <AdminFormField label="Description" required className="sm:col-span-2">
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Monthly retainer, Rent, Subscription"
                  required
                />
              </AdminFormField>
              <AdminFormField label="Amount (AED)" required>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </AdminFormField>
              <AdminFormField label="Tax %">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Notes" className="sm:col-span-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes on generated documents"
                />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
