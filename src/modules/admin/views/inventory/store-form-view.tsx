"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { STORE_TYPES } from "@/common/erp/inventory-types";
import type { Store } from "@/common/erp/types";
import { adminGet, adminPost, adminPut } from "@/modules/admin/lib/admin-api-client";
import { actionErrorMessage } from "@/modules/admin/lib/form-submit-errors";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  validateBeforeFormSave,
  formErrorsListAdapter,
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
  clearFormSubmitFeedback,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { coalesceNumber } from "@/lib/numeric-input";
import { AttachmentField } from "@/modules/erp/components/attachment-field";
import {
  StoreInvoiceFieldGuide,
  StoreInvoiceReadinessBanner,
} from "@/modules/admin/views/inventory/store-invoice-readiness";
import type { InvoiceSellerProfile } from "@/modules/settings/lib/invoice-seller-profile";

export type StoreFormViewProps = ErpFormViewBaseProps & {
  storeId?: string;
};

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

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
  const [errors, setErrors] = useState<string[]>([]);
  const fieldValidation = useFormFieldValidation();
  const isModal = variant === "modal";

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [storeType, setStoreType] = useState("Warehouse");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("Saudi Arabia");
  const [currency, setCurrency] = useState("");
  const [markupPercent, setMarkupPercent] = useState(0);
  const [trn, setTrn] = useState("");
  const [taxTemplate, setTaxTemplate] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [isActive, setIsActive] = useState(true);

  const invoiceProfile = useMemo<InvoiceSellerProfile>(
    () => ({
      name,
      trn,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      pincode,
      phone,
      logoUrl,
    }),
    [name, trn, addressLine1, addressLine2, city, state, country, pincode, phone, logoUrl],
  );

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
        setAddressLine2(s.address_line2 ?? "");
        setCity(s.city ?? "");
        setState(s.state ?? "");
        setPincode(s.pincode ?? "");
        setCountry(s.country?.trim() || "Saudi Arabia");
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
    clearFormSubmitFeedback({
      setFormErrors: formErrorsListAdapter(setErrors),
      clearFieldValidation: fieldValidation.clearFieldValidation,
    });
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
    if (
      !validateBeforeFormSave(
        [{ key: "name", ok: Boolean(name.trim()), message: "Store name is required." }],
        {
          markFieldValidationFailed: fieldValidation.markFieldValidationFailed,
          clearFieldValidation: fieldValidation.clearFieldValidation,
          setFormErrors: formErrorsListAdapter(setErrors),
        },
      )
    ) {
      return;
    }

    const payload = {
      name,
      code: code || null,
      storeType,
      phone: phone || null,
      addressLine1: addressLine1 || null,
      addressLine2: addressLine2 || null,
      city: city || null,
      state: state || null,
      pincode: pincode || null,
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
        setErrors([actionErrorMessage(err, "Save failed.")]);
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
        size={isModal ? "landscape" : "xl"}
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
      errors={errors}
    />
  ) : undefined;

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Legal seller identity for tax invoices, plus inventory and pricing for this location."
      backHref="/admin/erp/stores"
      breadcrumb={[
        { label: "Stores", href: "/admin/erp/stores" },
        { label: title },
      ]}
      size={isModal ? "landscape" : "xl"}
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <StoreInvoiceReadinessBanner profile={invoiceProfile} />

        <AdminFormColumns cols={2} columnRatio="2:1">
          <AdminFormSection
            title="Tax invoice — seller"
            description="Printed on sales invoices: Seller block, VAT line under the brand, and ZATCA QR payload."
          >
            <AdminFormGrid cols={2}>
              <AdminFormField
                label="Seller / store name"
                required
                fieldKey="name"
                hint="Seller → Name"
                className="md:col-span-2"
              >
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </AdminFormField>
              <AdminFormField
                label="VAT number (TRN)"
                required
                hint="15-digit KSA VAT — header, Seller VAT, QR"
              >
                <Input
                  value={trn}
                  onChange={(e) => setTrn(e.target.value)}
                  inputMode="numeric"
                  placeholder="3xxxxxxxxxx0003"
                />
              </AdminFormField>
              <AdminFormField label="Phone" required hint="Seller → Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </AdminFormField>
              <AdminFormField
                label="Address"
                required
                hint="Building, district, or short national address"
                className="md:col-span-2"
              >
                <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
              </AdminFormField>
              <AdminFormField
                label="Street name"
                hint="Seller → Street name"
                className="md:col-span-2"
              >
                <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="City" required hint="Seller → City">
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="State / region" hint="Shown with city on the invoice">
                <Input value={state} onChange={(e) => setState(e.target.value)} />
              </AdminFormField>
              <AdminFormField label="Country" required>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Saudi Arabia"
                />
              </AdminFormField>
              <AdminFormField label="Postal / ZIP code">
                <Input value={pincode} onChange={(e) => setPincode(e.target.value)} />
              </AdminFormField>
              <AdminFormField
                label="Store logo"
                optional
                hint="Optional on documents; tax invoice masthead uses the DHOOM brand mark by default."
                className="md:col-span-2"
              >
                <AttachmentField value={logoUrl} onChange={setLogoUrl} label="" />
              </AdminFormField>
            </AdminFormGrid>
          </AdminFormSection>

          <div className="flex flex-col gap-4">
            <AdminFormSection
              title="Store operations"
              description="Inventory, transfers, and pricing — not printed on tax invoices."
            >
              <AdminFormGrid cols={1}>
                <AdminFormField label="Store type">
                  <select
                    className={SELECT_CLASS}
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
                <AdminFormField label="Code" hint="Short reference in lists and reports">
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MAIN" />
                </AdminFormField>
                <AdminFormField label="Currency" hint="Defaults pricing for this store">
                  <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="SAR" />
                </AdminFormField>
                <AdminFormField label="Markup %" hint="Applied on top of base cost where used">
                  <NumericInput
                    min={0}
                    step="0.01"
                    value={markupPercent}
                    onValueChange={setMarkupPercent}
                  />
                </AdminFormField>
                <AdminFormField label="Tax template" hint="Internal default tax rule set">
                  <Input value={taxTemplate} onChange={(e) => setTaxTemplate(e.target.value)} />
                </AdminFormField>
                <AdminFormField label="Internal description" optional>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </AdminFormField>
                {storeId ? (
                  <label className="flex items-center justify-between gap-3 rounded-md border border-border/80 bg-muted/20 px-3 py-2.5 text-sm">
                    <span className="font-medium text-foreground">Store is active</span>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                  </label>
                ) : null}
              </AdminFormGrid>
            </AdminFormSection>

            <StoreInvoiceFieldGuide />
          </div>
        </AdminFormColumns>

        {!isModal ? (
          <AdminFormActions
            formId={formId}
            onCancel={handleCancel}
            submitLabel="Save store"
            pending={pending}
            errors={errors}
          />
        ) : null}
      </form>
    </AdminFormShell>
  );
}