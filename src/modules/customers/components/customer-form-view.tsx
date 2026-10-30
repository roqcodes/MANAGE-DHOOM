"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";

import type { CustomerErpProfile } from "@/common/erp/sales-types";
import { adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import { actionErrorMessage } from "@/modules/admin/lib/form-submit-errors";
import {
  validateBeforeFormSave,
  formErrorsListAdapter,

  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
  clearFormSubmitFeedback,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CustomerPhotoField } from "@/modules/customers/components/customer-photo-field";
import {
  AddressLookupField,
  type AddressLookupFieldHandle,
  type AddressLookupSelectionMeta,
  type AddressLookupValue,
} from "@/modules/customers/components/address-lookup-field";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

function splitName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function FieldGrid({
  children,
  cols = 2,
  className,
}: {
  children: React.ReactNode;
  cols?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-4 gap-y-4",
        cols === 2 && "sm:grid-cols-2",
        cols === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type CustomerFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  customerId?: string;
  /** When nested inside another ERP modal (invoice, etc.). */
  modalStacked?: boolean;
};

export function CustomerFormView({
  mode,
  customerId: customerIdProp,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
  modalStacked = false,
}: CustomerFormViewProps) {
  const router = useRouter();
  const params = useParams();
  const formId = useId();
  const slug = (params.slug as string[] | undefined) ?? [];
  const idFromRoute =
    mode === "edit" && slug[0] === "customers" && typeof slug[1] === "string"
      ? slug[1]
      : "";
  const customerId = customerIdProp ?? idFromRoute;
  const isModal = variant === "modal";

  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const fieldValidation = useFormFieldValidation();
  const [profile, setProfile] = useState<CustomerErpProfile | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [addressCity, setAddressCity] = useState<AddressLookupValue>({ id: null, name: "" });
  const [addressMall, setAddressMall] = useState<AddressLookupValue>({ id: null, name: "" });
  const [addressStreet, setAddressStreet] = useState<AddressLookupValue>({ id: null, name: "" });
  const streetFieldRef = useRef<AddressLookupFieldHandle>(null);
  const mallFieldRef = useRef<AddressLookupFieldHandle>(null);

  useEffect(() => {
    if (mode !== "edit" || !customerId) return;
    adminGet<{ profile: CustomerErpProfile }>(`customers/${customerId}/erp?view=profile`)
      .then((res) => {
        setProfile(res.profile);
        setAvatarUrl(res.profile.avatarUrl ?? "");
        setAddressCity({
          id: res.profile.addressCityId ?? null,
          name: res.profile.addressCityName ?? res.profile.location ?? "",
        });
        setAddressMall({
          id: res.profile.addressMallId ?? null,
          name: res.profile.addressMallName ?? "",
        });
        setAddressStreet({
          id: res.profile.addressStreetId ?? null,
          name: res.profile.addressStreetName ?? "",
        });
      })
      .finally(() => setLoading(false));
  }, [mode, customerId]);

  function handleCancel() {
    if (isModal) {
      onOpenChange?.(false);
    } else {
      router.push("/admin/customers");
    }
  }

  function handleSuccessNavigate(savedId?: string) {
    clearFormSubmitFeedback({
      setFormErrors: formErrorsListAdapter(setErrors),
      clearFieldValidation: fieldValidation.clearFieldValidation,
    });
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(savedId);
      return;
    }
    router.push(savedId ? `/admin/customers/${savedId}` : "/admin/customers");
  }

  function focusNextAddressField(meta: AddressLookupSelectionMeta) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (meta.kind === "city") {
          streetFieldRef.current?.open();
        } else if (meta.kind === "street") {
          mallFieldRef.current?.open();
        }
      });
    });
  }

  function handleCityChange(next: AddressLookupValue) {
    setAddressCity((prev) => {
      if (prev.id !== next.id) {
        setAddressStreet({ id: null, name: "" });
        setAddressMall({ id: null, name: "" });
      }
      return next;
    });
  }

  function handleStreetChange(next: AddressLookupValue) {
    setAddressStreet((prev) => {
      if (prev.id !== next.id) {
        setAddressMall({ id: null, name: "" });
      }
      return next;
    });
  }

  function handleAddressSelectionComplete(
    _option: { id: string; name: string },
    meta: AddressLookupSelectionMeta,
  ) {
    focusNextAddressField(meta);
  }

  const streetParentContext = useMemo(
    () => ({ cityId: addressCity.id }),
    [addressCity.id],
  );
  const mallParentContext = useMemo(
    () => ({ cityId: addressCity.id, streetId: addressStreet.id }),
    [addressCity.id, addressStreet.id],
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const companyName = (fd.get("companyName") as string).trim();
    if (
      !validateBeforeFormSave(
        [
        {
          key: "companyName",
          label: "Company name",
          ok: Boolean(companyName),
        },
      ],
        {
          markFieldValidationFailed: fieldValidation.markFieldValidationFailed,
          clearFieldValidation: fieldValidation.clearFieldValidation,
          setFormErrors: formErrorsListAdapter(setErrors),
        },
      )
    ) {
      return;
    }

    const lookupErrors = [
      addressCity.name.trim() && !addressCity.id
        ? "City: pick an existing city or use “Add city and save”."
        : null,
      (addressStreet.name.trim() || addressStreet.id) && !addressCity.id
        ? "Street: select a city first."
        : null,
      addressStreet.name.trim() && !addressStreet.id
        ? "Street: pick an existing street or use “Add street and save”."
        : null,
      (addressMall.name.trim() || addressMall.id) && !addressStreet.id
        ? "Mall: select a street first."
        : null,
      addressMall.name.trim() && !addressMall.id
        ? "Mall: pick an existing mall or use “Add mall and save”."
        : null,
    ].filter(Boolean) as string[];

    if (lookupErrors.length > 0) {
      setErrors(lookupErrors);
      return;
    }

const payload = {
      firstName: (fd.get("firstName") as string).trim() || undefined,
      lastName: (fd.get("lastName") as string).trim() || undefined,
      companyName,
      trn: (fd.get("trn") as string).trim() || undefined,
      contactDisplayName: (fd.get("contactDisplayName") as string).trim() || undefined,
      email: (fd.get("email") as string).trim() || undefined,
      phone: (fd.get("mobile") as string).trim() || undefined,
      landline: (fd.get("phone") as string).trim() || undefined,
      poBox: (fd.get("poBox") as string).trim() || undefined,
      customerNotes: (fd.get("notes") as string).trim() || undefined,
      creditLimit: parseFloat((fd.get("creditLimit") as string) || "0") || null,
      openingBalance: parseFloat((fd.get("openingBalance") as string) || "0"),
      openingBalanceDate: (fd.get("openingBalanceDate") as string) || null,
      avatarUrl: avatarUrl.trim() || null,
      addressCityId: addressCity.id,
      addressMallId: addressMall.id,
      addressStreetId: addressStreet.id,
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          const res = await adminPost<{ id: string }>("customers", payload);
          handleSuccessNavigate(res.id);
        } else if (customerId) {
          await adminPatch(`customers/${customerId}/erp`, payload);
          handleSuccessNavigate(customerId);
        }
      } catch (err) {
        setErrors([actionErrorMessage(err, "Failed to save customer.")]);
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
        title={mode === "create" ? "Add customer" : "Edit customer"}
        size="lg"
        stacked={modalStacked}
        loading
        loadingFallback={<AdminPageSkeleton />}
      >
        {null}
      </AdminFormShell>
    );
  }

  if (mode === "edit" && !profile) {
    if (isModal) {
      return (
        <AdminFormShell
          variant={variant}
          open={open}
          onOpenChange={onOpenChange}
          title="Edit customer"
          size="lg"
          stacked={modalStacked}
        >
          <p className="text-sm text-destructive">Customer not found.</p>
        </AdminFormShell>
      );
    }
    return (
      <div className="mx-auto max-w-4xl px-3 py-4">
        <p className="text-sm text-destructive">Customer not found.</p>
      </div>
    );
  }

  const nameParts = splitName(profile?.name);
  const photoName =
    profile?.contactDisplayName ||
    profile?.companyName ||
    profile?.name ||
    nameParts.firstName;
  const title = mode === "create" ? "Add customer" : "Edit customer";
  const saving = pending || avatarUploading;
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save"
      pending={saving}
      errors={errors}
    />
  ) : undefined;

  const sections = (
    <>
      <AdminFormSection
        title="Identity"
        description="Who this customer is, and how they appear on documents."
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <CustomerPhotoField
            value={avatarUrl}
            name={photoName}
            onChange={setAvatarUrl}
            onUploadingChange={setAvatarUploading}
          />
          <FieldGrid className="min-w-0 flex-1">
            <AdminFormField label="Company name" required fieldKey="companyName" className="sm:col-span-2">
              <Input
                name="companyName"
                placeholder="Trading name"
                autoComplete="organization"
                defaultValue={profile?.companyName ?? ""}
                required
              />
            </AdminFormField>
            <AdminFormField label="First name">
              <Input
                name="firstName"
                placeholder="First name"
                autoComplete="given-name"
                defaultValue={nameParts.firstName}
              />
            </AdminFormField>
            <AdminFormField label="Last name">
              <Input
                name="lastName"
                placeholder="Last name"
                autoComplete="family-name"
                defaultValue={nameParts.lastName}
              />
            </AdminFormField>
            <AdminFormField label="Contact display name" className="sm:col-span-2">
              <Input
                name="contactDisplayName"
                placeholder="Shown on invoices and statements"
                autoComplete="name"
                defaultValue={profile?.contactDisplayName ?? ""}
              />
            </AdminFormField>
          </FieldGrid>
        </div>
      </AdminFormSection>

      <AdminFormColumns cols={2}>
        <AdminFormSection
          title="Contact"
          description="How to reach this customer."
          className="h-full"
        >
          <FieldGrid>
            <AdminFormField label="Email" className="sm:col-span-2">
              <Input
                name="email"
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                defaultValue={profile?.email ?? ""}
              />
            </AdminFormField>
            <AdminFormField label="Mobile">
              <Input
                name="mobile"
                type="tel"
                placeholder="Mobile"
                autoComplete="tel"
                defaultValue={profile?.phone ?? ""}
              />
            </AdminFormField>
            <AdminFormField label="Phone">
              <Input name="phone" type="tel" placeholder="Landline" autoComplete="tel-national" />
            </AdminFormField>
            <AdminFormField label="PO box">
              <Input name="poBox" placeholder="PO box" defaultValue={profile?.poBox ?? ""} />
            </AdminFormField>
          </FieldGrid>
        </AdminFormSection>

        <AdminFormSection
          title="Address & tax"
          description="City → street → mall (shown on documents as mall, street, city)."
          className="h-full"
        >
          <FieldGrid>
            <AdminFormField label="City" className="sm:col-span-2">
              <AddressLookupField
                kind="city"
                label="City"
                placeholder="Search or add city…"
                value={addressCity}
                onChange={handleCityChange}
                onSelectionComplete={handleAddressSelectionComplete}
                disabled={saving}
              />
            </AdminFormField>
            <AdminFormField label="Street" className="sm:col-span-2">
              <AddressLookupField
                ref={streetFieldRef}
                kind="street"
                label="Street"
                placeholder="Streets in selected city…"
                value={addressStreet}
                onChange={handleStreetChange}
                onSelectionComplete={handleAddressSelectionComplete}
                disabled={saving}
                parentContext={streetParentContext}
              />
            </AdminFormField>
            <AdminFormField label="Mall" className="sm:col-span-2">
              <AddressLookupField
                ref={mallFieldRef}
                kind="mall"
                label="Mall"
                placeholder="Malls on selected street…"
                value={addressMall}
                onChange={setAddressMall}
                onSelectionComplete={handleAddressSelectionComplete}
                disabled={saving}
                parentContext={mallParentContext}
              />
            </AdminFormField>
            <AdminFormField label="TRN" className="sm:col-span-2">
              <Input name="trn" placeholder="Tax registration number" defaultValue={profile?.trn ?? ""} />
            </AdminFormField>
          </FieldGrid>
        </AdminFormSection>
      </AdminFormColumns>

      <AdminFormSection
        title="Receivables"
        description="Credit and opening balance used on statements."
      >
        <FieldGrid cols={3}>
          <AdminFormField
            label="Credit limit"
            hint={
              mode === "edit" && (profile?.outstandingBalance ?? 0) > 0
                ? `Current balance: ${formatCurrencyAmount(profile!.outstandingBalance!)} — limit must be at least this amount.`
                : undefined
            }
          >
            <Input
              name="creditLimit"
              type="number"
              step="0.01"
              min={0}
              inputMode="decimal"
              defaultValue={profile?.creditLimit ?? 0}
            />
          </AdminFormField>
          <AdminFormField label="Opening balance">
            <Input
              name="openingBalance"
              type="number"
              step="0.01"
              inputMode="decimal"
              defaultValue={profile?.openingBalance ?? 0}
            />
          </AdminFormField>
          <AdminFormField label="Opening balance date">
            <Input
              name="openingBalanceDate"
              type="date"
              defaultValue={profile?.openingBalanceDate ?? new Date().toISOString().slice(0, 10)}
            />
          </AdminFormField>
        </FieldGrid>
      </AdminFormSection>

      <AdminFormSection title="Notes" description="Internal only — not printed on invoices.">
        <AdminFormField label="Customer notes">
          <Textarea
            name="notes"
            placeholder="Payment terms, delivery notes, or other staff remarks"
            defaultValue={profile?.customerNotes ?? ""}
            rows={3}
            className="resize-y"
          />
        </AdminFormField>
      </AdminFormSection>
    </>
  );

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Customer account, billing, and receivables settings."
      backHref="/admin/customers"
      breadcrumb={[
        { label: "Customers", href: "/admin/customers" },
        { label: title },
      ]}
      size="lg"
      stacked={modalStacked}
      formId={formId}
      footer={footer}
    >
      <form id={formId} key={profile?.id ?? "new"} onSubmit={handleSubmit} className="space-y-5">
        {sections}
        {!isModal ? (
          <AdminFormActions
            formId={formId}
            onCancel={handleCancel}
            submitLabel="Save"
            pending={saving}
            errors={errors}
          />
        ) : null}
      </form>
    </AdminFormShell>
  );
}
