"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ErpEmployeeDetail } from "@/common/erp/hr-types";
import { adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import { actionErrorMessage } from "@/modules/admin/lib/form-submit-errors";
import {
  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  clearFormSubmitFeedback,
  formErrorsListAdapter,
  validateBeforeFormSave,
  type ErpFormViewBaseProps,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";

export type EmployeeFormViewProps = ErpFormViewBaseProps & {
  mode: "create" | "edit";
  employeeId?: string;
};

export function EmployeeFormView({
  mode,
  employeeId,
  variant = "page",
  open = true,
  onOpenChange,
  onSuccess,
}: EmployeeFormViewProps) {
  const router = useRouter();
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode });
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(mode === "edit");
  const [errors, setErrors] = useState<string[]>([]);
  const fieldValidation = useFormFieldValidation();
  const isModal = variant === "modal";

  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idExpiryDate, setIdExpiryDate] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [joiningDate, setJoiningDate] = useState(new Date().toISOString().slice(0, 10));
  const [isActive, setIsActive] = useState(true);
  const [basicSalary, setBasicSalary] = useState("0");
  const [allowance, setAllowance] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (mode !== "edit" || !employeeId) return;
    adminGet<ErpEmployeeDetail>(`erp/employees/${employeeId}`)
      .then((emp) => {
        setStoreId(emp.store_id);
        setFullName(emp.full_name);
        setMobile(emp.mobile);
        setEmployeeCode(emp.employee_code ?? "");
        setIdNumber(emp.id_number ?? "");
        setIdExpiryDate(emp.id_expiry_date ?? "");
        setDateOfBirth(emp.date_of_birth ?? "");
        setJoiningDate(emp.joining_date);
        setIsActive(emp.is_active);
        setBasicSalary(String(emp.basic_salary));
        setAllowance(String(emp.allowance));
        setNotes(emp.notes ?? "");
      })
      .finally(() => setLoading(false));
  }, [mode, employeeId, setStoreId]);

  function handleCancel() {
    if (isModal) onOpenChange?.(false);
    else router.push(mode === "edit" && employeeId ? `/admin/erp/employees/${employeeId}` : "/admin/erp/employees");
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
    router.push(id ? `/admin/erp/employees/${id}` : "/admin/erp/employees");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !validateBeforeFormSave(
        [
          {
            key: "store",
            label: "Store",
            ok: Boolean(effectiveStoreId),
            message: storeRequiredMessage ?? undefined,
          },
          { key: "fullName", label: "Full name", ok: Boolean(fullName.trim()) },
          { key: "mobile", label: "Mobile", ok: Boolean(mobile.trim()) },
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

    const payload = {
      storeId: effectiveStoreId,
      fullName: fullName.trim(),
      mobile: mobile.trim(),
      joiningDate,
      basicSalary: parseFloat(basicSalary) || 0,
      allowance: parseFloat(allowance) || 0,
      employeeCode: employeeCode.trim() || undefined,
      idNumber: idNumber.trim() || undefined,
      idExpiryDate: idExpiryDate || undefined,
      dateOfBirth: dateOfBirth || undefined,
      isActive,
      notes: notes.trim() || undefined,
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          const res = await adminPost<{ id: string }>("erp/employees", payload);
          handleSuccessNavigate(res.id);
        } else if (employeeId) {
          await adminPatch(`erp/employees/${employeeId}`, payload);
          handleSuccessNavigate(employeeId);
        }
      } catch (err) {
        setErrors([actionErrorMessage(err, "Failed to save employee.")]);
      }
    });
  }

  if (isModal && !open) return null;

  const title = mode === "create" ? "New employee" : "Edit employee";
  const footer = isModal ? (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel="Save employee"
      pending={isPending}
      errors={errors}
    />
  ) : undefined;

  if (loading) {
    return (
      <AdminFormShell
        variant={variant}
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        size="lg"
        loading
        loadingFallback={<AdminPageSkeleton />}
      >
        {null}
      </AdminFormShell>
    );
  }

  return (
    <AdminFormShell
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Employee profile and monthly salary. Use Add salesman for POS PIN attribution."
      backHref={mode === "edit" && employeeId ? `/admin/erp/employees/${employeeId}` : "/admin/erp/employees"}
      breadcrumb={[
        { label: "Employees", href: "/admin/erp/employees" },
        { label: mode === "create" ? "New employee" : "Edit employee" },
      ]}
      size="lg"
      formId={formId}
      footer={footer}
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <AdminFormSection title="Employee details">
          <AdminFormGrid>
            <AdminFormField label="Store" required fieldKey="store">
              <ActiveStoreFormField
                mode={mode}
                stores={stores}
                activeStoreId={activeStoreId}
                storeId={storeId}
                onStoreIdChange={setStoreId}
                label=""
                invalid={fieldValidation.isFieldInvalid("store")}
              />
            </AdminFormField>
            <AdminFormField label="ID#" htmlFor="employeeCode">
              <Input id="employeeCode" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="ID expiry date" htmlFor="idExpiryDate">
              <Input id="idExpiryDate" type="date" value={idExpiryDate} onChange={(e) => setIdExpiryDate(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="ID number" htmlFor="idNumber">
              <Input id="idNumber" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="Full name" htmlFor="fullName" required fieldKey="fullName">
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </AdminFormField>
            <AdminFormField label="Mobile" htmlFor="mobile" required fieldKey="mobile">
              <Input id="mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} required />
            </AdminFormField>
            <AdminFormField label="Date of birth" htmlFor="dateOfBirth">
              <Input id="dateOfBirth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="Joining / pay start date" htmlFor="joiningDate" required>
              <Input id="joiningDate" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} required />
            </AdminFormField>
            <AdminFormField label="Still active?" htmlFor="isActive">
              <label className="flex items-center gap-2 text-sm">
                <input
                  id="isActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4 rounded border"
                />
                Employee is active
              </label>
            </AdminFormField>
            <AdminFormField label="Basic salary" htmlFor="basicSalary" required>
              <Input id="basicSalary" type="number" min="0" step="0.001" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="Allowance" htmlFor="allowance">
              <Input id="allowance" type="number" min="0" step="0.001" value={allowance} onChange={(e) => setAllowance(e.target.value)} />
            </AdminFormField>
            <AdminFormField label="Notes" htmlFor="notes" className="sm:col-span-2">
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>

        {!isModal ? (
          <AdminFormActions
            formId={formId}
            onCancel={handleCancel}
            submitLabel="Save employee"
            pending={isPending}
            errors={errors}
          />
        ) : null}
      </form>
    </AdminFormShell>
  );
}
