"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import type { FixedAssetDetail } from "@/common/erp/finance-types";
import {
  parseFixedAssetMaintenance,
  serializeFixedAssetMaintenance,
} from "@/common/erp/finance-types";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys, fixedAssetDetailQueryKey } from "@/modules/admin/lib/admin-query-keys";
import {
  createFixedAssetAction,
  updateFixedAssetAction,
} from "@/modules/erp/actions/fixed-assets.actions";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  VendorSearchSelect,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  storeId: string;
  name: string;
  serialNumber: string;
  brand: string;
  reference: string;
  details: string;
  purchaseDate: string;
  purchaseAmount: string;
  paidThroughAccountId: string;
  taxPercent: string;
  taxMode: "exclusive" | "inclusive";
  vendorId: string;
  vendorLabel: string;
  hasWarranty: boolean;
  warrantyExpiry: string;
  warrantyDetails: string;
  servicePerson: string;
  serviceContact: string;
  serviceAddress: string;
};

function emptyForm(storeId = ""): FormState {
  return {
    storeId,
    name: "",
    serialNumber: "",
    brand: "",
    reference: "",
    details: "",
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchaseAmount: "",
    paidThroughAccountId: "",
    taxPercent: "0",
    taxMode: "exclusive",
    vendorId: "",
    vendorLabel: "",
    hasWarranty: false,
    warrantyExpiry: "",
    warrantyDetails: "",
    servicePerson: "",
    serviceContact: "",
    serviceAddress: "",
  };
}

function formFromAsset(asset: FixedAssetDetail): FormState {
  const maintenance = parseFixedAssetMaintenance(asset.maintenance_info);
  const purchaseAmount = Number(asset.purchase_amount) || 0;
  const taxAmount = Number(asset.tax_amount) || 0;
  const taxPercent =
    purchaseAmount > 0 ? ((taxAmount / purchaseAmount) * 100).toFixed(2) : "0";

  return {
    storeId: asset.store_id ?? "",
    name: asset.name,
    serialNumber: asset.serial_number ?? "",
    brand: asset.brand ?? "",
    reference: asset.reference ?? "",
    details: asset.details ?? "",
    purchaseDate: asset.purchase_date,
    purchaseAmount: String(purchaseAmount),
    paidThroughAccountId: asset.paid_through_account_id ?? "",
    taxPercent,
    taxMode: asset.tax_mode === "inclusive" ? "inclusive" : "exclusive",
    vendorId: asset.vendor_id ?? "",
    vendorLabel: asset.vendors?.name ?? "",
    hasWarranty: Boolean(asset.warranty_expiry || asset.warranty_details),
    warrantyExpiry: asset.warranty_expiry ?? "",
    warrantyDetails: asset.warranty_details ?? "",
    servicePerson: maintenance.servicePerson ?? "",
    serviceContact: maintenance.serviceContact ?? "",
    serviceAddress: maintenance.serviceAddress ?? "",
  };
}

export type FixedAssetFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  assetId?: string;
};

export function FixedAssetFormView({
  mode,
  assetId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: FixedAssetFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeRequiredMessage } = useActiveStoreFormField({ mode });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const isModal = variant === "modal";

  const { data: asset, isPending: loadingAsset } = useQuery({
    queryKey: fixedAssetDetailQueryKey(assetId ?? ""),
    queryFn: () => adminGet<{ asset: FixedAssetDetail }>(`erp/fixed-assets/${assetId}`),
    enabled: mode === "edit" && Boolean(assetId),
  });

  const { data: accountsData } = useQuery({
    queryKey: adminQueryKeys.accountsPicker(form.storeId || activeStoreId),
    queryFn: () => {
      const q = new URLSearchParams({ page: "0", limit: "200" });
      const sid = form.storeId || activeStoreId;
      if (sid) q.set("storeId", sid);
      return adminGet<{ data: Array<{ id: string; name: string; code: string }> }>(
        `erp/accounts?${q.toString()}`,
      );
    },
  });

  const accounts = accountsData?.data ?? [];

  useEffect(() => {
    if (mode === "create" && activeStoreId) {
      setForm((f) => ({ ...f, storeId: activeStoreId }));
    }
  }, [activeStoreId, mode]);

  useEffect(() => {
    if (mode === "edit" && asset?.asset) {
      setForm(formFromAsset(asset.asset));
    }
  }, [mode, asset]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/fixed-assets");
    }
  }

  function handleSuccessNavigate(id?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    router.push(id ? `/admin/erp/fixed-assets/${id}` : "/admin/erp/fixed-assets");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const purchaseAmount = parseFloat(form.purchaseAmount);
    const resolvedStoreId = form.storeId || activeStoreId;
    if (!resolvedStoreId) {
      setError(storeRequiredMessage ?? "Store is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Item name is required.");
      return;
    }
    if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
      setError("Purchase amount must be greater than zero.");
      return;
    }
    if (!form.paidThroughAccountId) {
      setError("Paid through account is required.");
      return;
    }

    const taxPercent = parseFloat(form.taxPercent) || 0;
    const taxAmount = Math.round(((purchaseAmount * taxPercent) / 100) * 100) / 100;

    const payload = {
      name: form.name.trim(),
      purchaseAmount,
      storeId: resolvedStoreId,
      purchaseDate: form.purchaseDate,
      paidThroughAccountId: form.paidThroughAccountId,
      serialNumber: form.serialNumber.trim() || null,
      brand: form.brand.trim() || null,
      reference: form.reference.trim() || null,
      details: form.details.trim() || null,
      taxAmount,
      taxMode: form.taxMode,
      vendorId: form.vendorId || null,
      warrantyExpiry: form.hasWarranty && form.warrantyExpiry ? form.warrantyExpiry : null,
      warrantyDetails:
        form.hasWarranty && form.warrantyDetails.trim() ? form.warrantyDetails.trim() : null,
      maintenanceInfo: serializeFixedAssetMaintenance({
        servicePerson: form.servicePerson,
        serviceContact: form.serviceContact,
        serviceAddress: form.serviceAddress,
      }),
    };

    setError(null);
    startTransition(async () => {
      try {
        if (mode === "create") {
          const id = await createFixedAssetAction(payload);
          handleSuccessNavigate(id);
        } else if (assetId) {
          await updateFixedAssetAction(assetId, payload);
          handleSuccessNavigate(assetId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save asset.");
      }
    });
  }

  if (isModal && !open) return null;
  if (mode === "edit" && loadingAsset && !asset) {
    return (
      <AdminFormShell
        variant={variant}
        open={open}
        onOpenChange={onOpenChange}
        title="Edit fixed asset"
        size="xl"
        loading
        loadingFallback={<AdminPageSkeleton />}
      >
        {null}
      </AdminFormShell>
    );
  }

  const title = mode === "create" ? "Add fixed asset" : "Edit fixed asset";
  const description =
    mode === "edit" && asset?.asset
      ? asset.asset.name
      : "Record capital purchases with warranty and service details.";

  const breadcrumb =
    mode === "edit" && asset?.asset
      ? [
          { label: "Fixed assets", href: "/admin/erp/fixed-assets" },
          { label: asset.asset.name, href: `/admin/erp/fixed-assets/${assetId}` },
          { label: "Edit" },
        ]
      : [
          { label: "Fixed assets", href: "/admin/erp/fixed-assets" },
          { label: "Add new" },
        ];

  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel={mode === "create" ? "Save fixed asset" : "Update asset"}
      pending={isPending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      backHref="/admin/erp/fixed-assets"
      breadcrumb={breadcrumb}
      size="xl"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormSection title="Store">
          <AdminFormGrid cols={3}>
            <AdminFormField label="Select store" required className="sm:col-span-2">
              <ActiveStoreFormField
                mode={mode}
                stores={stores}
                activeStoreId={activeStoreId}
                storeId={form.storeId}
                onStoreIdChange={(value) => update("storeId", value)}
                label=""
              />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>

        <AdminFormColumns cols={2}>
          <AdminFormSection title="Item details">
            <AdminFormGrid cols={2}>
              <AdminFormField label="Item name" required className="sm:col-span-2">
                <Input
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
              </AdminFormField>
              <AdminFormField label="Serial number">
                <Input
                  value={form.serialNumber}
                  onChange={(e) => update("serialNumber", e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Brand name">
                <Input value={form.brand} onChange={(e) => update("brand", e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Reference">
                <Input
                  value={form.reference}
                  onChange={(e) => update("reference", e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Item details" className="sm:col-span-2">
                <Textarea
                  value={form.details}
                  onChange={(e) => update("details", e.target.value)}
                  rows={3}
                />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Purchase details">
            <AdminFormGrid cols={2}>
              <AdminFormField label="Purchase date" required>
                <Input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => update("purchaseDate", e.target.value)}
                  required
                />
              </AdminFormField>
              <AdminFormField label="Purchase amount" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.purchaseAmount}
                  onChange={(e) => update("purchaseAmount", e.target.value)}
                  required
                />
              </AdminFormField>
              <AdminFormField label="Paid through account" required className="sm:col-span-2">
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.paidThroughAccountId}
                  onChange={(e) => update("paidThroughAccountId", e.target.value)}
                  required
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.code})
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Tax %">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.taxPercent}
                  onChange={(e) => update("taxPercent", e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Tax mode">
                <div className="flex flex-wrap gap-4 pt-1 text-sm">
                  {(["exclusive", "inclusive"] as const).map((taxMode) => (
                    <label key={taxMode} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="taxMode"
                        checked={form.taxMode === taxMode}
                        onChange={() => update("taxMode", taxMode)}
                      />
                      {taxMode === "inclusive" ? "Tax inclusive" : "Tax exclusive"}
                    </label>
                  ))}
                </div>
              </AdminFormField>
              <AdminFormField label="Vendor" className="sm:col-span-2">
                <VendorSearchSelect
                  value={form.vendorId || null}
                  selectedLabel={form.vendorLabel || undefined}
                  onChange={(id, option) => {
                    update("vendorId", id ?? "");
                    update("vendorLabel", option?.label ?? "");
                  }}
                />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>
        </AdminFormColumns>

        <AdminFormColumns cols={2}>
          <AdminFormSection title="Warranty details">
            <AdminFormGrid cols={2}>
              <AdminFormField label="Warranty status" className="sm:col-span-2">
                <div className="flex flex-wrap gap-4 pt-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={form.hasWarranty}
                      onChange={() => update("hasWarranty", true)}
                    />
                    Warranty available
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!form.hasWarranty}
                      onChange={() => update("hasWarranty", false)}
                    />
                    No warranty / not applicable
                  </label>
                </div>
              </AdminFormField>
              {form.hasWarranty ? (
                <>
                  <AdminFormField label="Warranty expiry date">
                    <Input
                      type="date"
                      value={form.warrantyExpiry}
                      onChange={(e) => update("warrantyExpiry", e.target.value)}
                    />
                  </AdminFormField>
                  <AdminFormField label="Warranty details" className="sm:col-span-2">
                    <Textarea
                      value={form.warrantyDetails}
                      onChange={(e) => update("warrantyDetails", e.target.value)}
                      rows={2}
                    />
                  </AdminFormField>
                </>
              ) : null}
            </AdminFormGrid>
          </AdminFormSection>

          <AdminFormSection title="Maintenance service details">
            <AdminFormGrid cols={2}>
              <AdminFormField label="Service person name" className="sm:col-span-2">
                <Input
                  value={form.servicePerson}
                  onChange={(e) => update("servicePerson", e.target.value)}
                />
              </AdminFormField>
              <AdminFormField label="Service contact" className="sm:col-span-2">
                <Textarea
                  value={form.serviceContact}
                  onChange={(e) => update("serviceContact", e.target.value)}
                  rows={2}
                />
              </AdminFormField>
              <AdminFormField label="Service centre address" className="sm:col-span-2">
                <Textarea
                  value={form.serviceAddress}
                  onChange={(e) => update("serviceAddress", e.target.value)}
                  rows={2}
                />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>
        </AdminFormColumns>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/fixed-assets" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : mode === "create" ? "Save fixed asset" : "Update asset"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
