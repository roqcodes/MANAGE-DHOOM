"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { STORE_TYPES } from "@/common/erp/inventory-types";
import type { Store } from "@/common/erp/types";
import { adminGet, adminPost, adminPut } from "@/modules/admin/lib/admin-api-client";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import { AttachmentField } from "@/modules/erp/components/attachment-field";

export type StoreFormViewProps = ErpFormViewBaseProps & {
  storeId?: string;
};

export function StoreFormView({
  storeId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: StoreFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(Boolean(storeId));
  const [error, setError] = useState<string | null>(null);
  const isModal = variant === "modal";

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [storeType, setStoreType] = useState("Warehouse");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [markupPercent, setMarkupPercent] = useState(0);
  const [trn, setTrn] = useState("");
  const [taxTemplate, setTaxTemplate] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    adminGet<{ store: Store }>(`erp/stores/${storeId}`)
      .then((res) => {
        const s = res.store;
        setName(s.name);
        setCode(s.code ?? "");
        setStoreType(s.store_type ?? "Warehouse");
        setPhone(s.phone ?? "");
        setAddressLine1(s.address_line1 ?? "");
        setCity(s.city ?? "");
        setCountry(s.country ?? "");
        setCurrency(s.currency ?? "");
        setMarkupPercent(Number(s.markup_percent ?? 0));
        setTrn(s.trn ?? "");
        setTaxTemplate(s.tax_template ?? "");
        setDescription(s.description ?? "");
        setLogoUrl(s.logo_url ?? "");
        setIsActive(s.is_active);
      })
      .finally(() => setLoading(false));
  }, [storeId]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/erp/stores");
    }
  }

  function handleSuccessNavigate(id?: string) {
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(id);
      return;
    }
    if (id && !storeId) {
      router.push(`/admin/erp/stores/${id}/edit`);
    } else {
      router.push("/admin/erp/stores");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      name,
      code: code || null,
      storeType,
      phone: phone || null,
      addressLine1: addressLine1 || null,
      city: city || null,
      country: country || null,
      currency: currency || null,
      markupPercent: coalesceNumber(markupPercent),
      trn: trn || null,
      taxTemplate: taxTemplate || null,
      description: description || null,
      logoUrl: logoUrl || null,
      isActive,
    };

    startTransition(async () => {
      try {
        if (storeId) {
          await adminPut(`erp/stores/${storeId}`, payload);
          handleSuccessNavigate(storeId);
        } else {
          const res = await adminPost<{ id: string }>("erp/stores", payload);
          handleSuccessNavigate(res.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  if (isModal && !open) return null;
  if (loading) {
    return (
      <AdminFormShell
        variant={variant}
        open={open}
        onOpenChange={onOpenChange}
        title={storeId ? "Edit store" : "Add store"}
        size="xl"
        loading
        loadingFallback={<AdminPageSkeleton />}
      >
        {null}
      </AdminFormShell>
    );
  }

  const title = storeId ? "Edit store" : "Add store";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save store"
      pending={pending}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Configure store location, tax settings, and contact details."
      backHref="/admin/erp/stores"
      breadcrumb={[
        { label: "Stores", href: "/admin/erp/stores" },
        { label: title },
      ]}
      size="xl"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormSection title="Store details">
          <AdminFormColumns cols={2}>
            <AdminFormGrid cols={2}>
              <AdminFormField label="Store name" required className="sm:col-span-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </AdminFormField>
              <AdminFormField label="Store type">
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value)}
                >
                  {STORE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </AdminFormField>
              <AdminFormField label="Code">
                <Input value={code} onChange={(e) => setCode(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Address" className="sm:col-span-2">
                <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="City">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </AdminFormField>
            </AdminFormGrid>
            <AdminFormGrid cols={2}>
              <AdminFormField label="Country">
                <Input value={country} onChange={(e) => setCountry(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Currency">
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Markup %">
                <NumericInput
                  min={0}
                  step="0.01"
                  value={markupPercent}
                  onValueChange={setMarkupPercent}
                />
              </AdminFormField>
              <AdminFormField label="Tax registration (TRN)">
                <Input value={trn} onChange={(e) => setTrn(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Tax template" className="sm:col-span-2">
                <Input value={taxTemplate} onChange={(e) => setTaxTemplate(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Description" className="sm:col-span-2">
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Store logo" className="sm:col-span-2">
                <AttachmentField value={logoUrl} onChange={setLogoUrl} label="" />
              </AdminFormField>
              {storeId ? (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  Store is active
                </label>
              ) : null}
            </AdminFormGrid>
          </AdminFormColumns>
        </AdminFormSection>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!isModal ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/admin/erp/stores" className={buttonVariants({ variant: "outline" })}>
              Cancel
            </Link>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save store"}
            </Button>
          </div>
        ) : null}
      </form>
    </AdminFormShell>
  );
}
