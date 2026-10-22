"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";

import type { CustomerErpProfile } from "@/common/erp/sales-types";
import { adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import { actionErrorMessage } from "@/modules/admin/lib/form-submit-errors";
import {
  AdminFormActions,
  AdminFormColumns,
  AdminFormField,
  AdminFormSection,
  AdminFormShell,
  type ErpFormViewBaseProps,
} from "@/modules/admin/ui";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CustomerPhotoField } from "@/modules/customers/components/customer-photo-field";
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
  const [profile, setProfile] = useState<CustomerErpProfile | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !customerId) return;
    adminGet<{ profile: CustomerErpProfile }>(`customers/${customerId}/erp?view=profile`)
      .then((res) => {
        setProfile(res.profile);
        setAvatarUrl(res.profile.avatarUrl ?? "");
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
    if (isModal) {
      onOpenChange?.(false);
      onSuccess?.(savedId);
      return;
    }
    router.push(savedId ? `/admin/customers/${savedId}` : "/admin/customers");
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const companyName = (fd.get("companyName") as string).trim();
    if (!companyName) {
      setErrors(["Company name is required."]);
      return;
    }
    setErrors([]);

    const payload = {
      firstName: (fd.get("firstName") as string).trim() || undefined,
      lastName: (fd.get("lastName") as string).trim() || undefined,
      companyName,
      address: (fd.get("address") as string).trim() || undefined,
      trn: (fd.get("trn") as string).trim() || undefined,
      contactDisplayName: (fd.get("contactDisplayName") as string).trim() || undefined,
      location: (fd.get("location") as string).trim() || undefined,
      email: (fd.get("email") as string).trim() || undefined,
      phone: (fd.get("mobile") as string).trim() || undefined,
      landline: (fd.get("phone") as string).trim() || undefined,
      poBox: (fd.get("poBox") as string).trim() || undefined,
      customerNotes: (fd.get("notes") as string).trim() || undefined,
      creditLimit: parseFloat((fd.get("creditLimit") as string) || "0") || null,
      openingBalance: parseFloat((fd.get("openingBalance") as string) || "0"),
      openingBalanceDate: (fd.get("openingBalanceDate") as string) || null,
      avatarUrl: avatarUrl.trim() || null,
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
            <AdminFormField label="Company name" required className="sm:col-span-2">
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
            <AdminFormField label="Location">
              <Input
                name="location"
                placeholder="City / area"
                autoComplete="address-level2"
                defaultValue={profile?.location ?? ""}
              />
            </AdminFormField>
            <AdminFormField label="PO box">
              <Input name="poBox" placeholder="PO box" defaultValue={profile?.poBox ?? ""} />
            </AdminFormField>
          </FieldGrid>
        </AdminFormSection>

        <AdminFormSection
          title="Address & tax"
          description="Billing address and tax registration."
          className="h-full"
        >
          <FieldGrid>
            <AdminFormField label="Address" className="sm:col-span-2">
              <Textarea
                name="address"
                placeholder="Street, building, area"
                autoComplete="street-address"
                defaultValue={profile?.address ?? ""}
                rows={4}
                className="min-h-[6.5rem] resize-y"
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
