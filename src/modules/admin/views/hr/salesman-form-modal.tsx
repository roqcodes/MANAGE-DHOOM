"use client";

import { useEffect, useId, useState, useTransition } from "react";

import type { ErpEmployeeDetail } from "@/common/erp/hr-types";
import { adminGet, adminPatch, adminPost } from "@/modules/admin/lib/admin-api-client";
import { actionErrorMessage } from "@/modules/admin/lib/form-submit-errors";
import {
  validateBeforeFormSave,
  formErrorsListAdapter,

  AdminFormActions,
  AdminFormField,
  AdminFormGrid,
  AdminFormSection,
  AdminFormShell,
  clearFormSubmitFeedback,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminPageSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import {
  ActiveStoreFormField,
  useActiveStoreFormField,
} from "@/modules/erp/components/use-active-store-form-field";

export type SalesmanFormModalProps = {
  mode: "create" | "edit";
  employeeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

export function SalesmanFormModal({
  mode,
  employeeId,
  open,
  onOpenChange,
  onSuccess,
}: SalesmanFormModalProps) {
  const formId = useId();
  const { stores, activeStoreId, storeId, setStoreId, effectiveStoreId, storeRequiredMessage } =
    useActiveStoreFormField({ mode });
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(mode === "edit");
  const [errors, setErrors] = useState<string[]>([]);
  const fieldValidation = useFormFieldValidation();

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
  const [salesPin, setSalesPin] = useState("");

  useEffect(() => {
    if (!open) return;
    if (mode !== "edit" || !employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
        setSalesPin((emp.sales_pin ?? "").replace(/\D/g, "").slice(0, 3));
      })
      .finally(() => setLoading(false));
  }, [open, mode, employeeId, setStoreId]);

  useEffect(() => {
    if (!open || mode !== "create") return;
    setFullName("");
    setMobile("");
    setEmployeeCode("");
    setIdNumber("");
    setIdExpiryDate("");
    setDateOfBirth("");
    setJoiningDate(new Date().toISOString().slice(0, 10));
    setIsActive(true);
    setBasicSalary("0");
    setAllowance("0");
    setNotes("");
    setSalesPin("");
    setErrors([]);
  }, [open, mode]);

  function handleCancel() {
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const pinDigits = salesPin.replace(/\D/g, "").slice(0, 3);
    if (
      !validateBeforeFormSave(
        [
        {
          key: "store",
          ok: Boolean(effectiveStoreId),
          message: storeRequiredMessage ?? "Store is required.",
        },
        { key: "fullName", ok: Boolean(fullName.trim()), message: "Full name is required." },
        { key: "mobile", ok: Boolean(mobile.trim()), message: "Mobile is required." },
        {
          key: "salesPin",
          ok: pinDigits.length === 3,
          message: "Enter a unique 3-digit PIN.",
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
      isSalesman: true,
      salesPin: pinDigits,
    };

    startTransition(async () => {
      try {
        if (mode === "create") {
          await adminPost<{ id: string }>("erp/employees", payload);
        } else if (employeeId) {
          await adminPatch(`erp/employees/${employeeId}`, payload);
        }
        clearFormSubmitFeedback({
          setFormErrors: formErrorsListAdapter(setErrors),
          clearFieldValidation: fieldValidation.clearFieldValidation,
        });
        onOpenChange(false);
        onSuccess?.();
      } catch (err) {
        setErrors([actionErrorMessage(err, "Failed to save salesman.")]);
      }
    });
  }

  if (!open) return null;

  const title = mode === "create" ? "New salesman" : "Edit salesman";
  const footer = (
    <AdminFormActions
      formId={formId}
      onCancel={handleCancel}
      submitLabel={mode === "create" ? "Create salesman" : "Save salesman"}
      pending={isPending}
      errors={errors}
    />
  );

  if (loading) {
    return (
      <AdminFormShell
        variant="modal"
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
      variant="modal"
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Same employee record as the Employees list—salary, payslips, and ledger—with a POS PIN for sales attribution. No portal login."
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
            <AdminFormField label="ID#" htmlFor="salesmanEmployeeCode">
              <Input
                id="salesmanEmployeeCode"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="ID expiry date" htmlFor="salesmanIdExpiryDate">
              <Input
                id="salesmanIdExpiryDate"
                type="date"
                value={idExpiryDate}
                onChange={(e) => setIdExpiryDate(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="Full name" htmlFor="salesmanFullName" required fieldKey="fullName">
              <Input
                id="salesmanFullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
              />
            </AdminFormField>
            <AdminFormField label="Mobile" htmlFor="salesmanMobile" required fieldKey="mobile">
              <Input
                id="salesmanMobile"
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
              />
            </AdminFormField>
            <AdminFormField label="ID number" htmlFor="salesmanIdNumber">
              <Input
                id="salesmanIdNumber"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="Date of birth" htmlFor="salesmanDateOfBirth">
              <Input
                id="salesmanDateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="Joining / pay start date" htmlFor="salesmanJoiningDate" required>
              <Input
                id="salesmanJoiningDate"
                type="date"
                value={joiningDate}
                onChange={(e) => setJoiningDate(e.target.value)}
                required
              />
            </AdminFormField>
            <AdminFormField label="Still active?" htmlFor="salesmanIsActive">
              <label className="flex items-center gap-2 text-sm">
                <input
                  id="salesmanIsActive"
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="size-4 rounded border"
                />
                Employee is active
              </label>
            </AdminFormField>
            <AdminFormField label="Basic salary" htmlFor="salesmanBasicSalary" required>
              <Input
                id="salesmanBasicSalary"
                type="number"
                min="0"
                step="0.001"
                value={basicSalary}
                onChange={(e) => setBasicSalary(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="Allowance" htmlFor="salesmanAllowance">
              <Input
                id="salesmanAllowance"
                type="number"
                min="0"
                step="0.001"
                value={allowance}
                onChange={(e) => setAllowance(e.target.value)}
              />
            </AdminFormField>
            <AdminFormField label="Notes" htmlFor="salesmanNotes" className="sm:col-span-2">
              <Textarea
                id="salesmanNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>

        <AdminFormSection title="Sales attribution">
          <AdminFormGrid>
            <AdminFormField
              label="PIN (3 digits, unique)"
              htmlFor="salesmanPin"
              required
              fieldKey="salesPin"
              className="sm:col-span-2"
            >
              <Input
                id="salesmanPin"
                inputMode="numeric"
                maxLength={3}
                autoComplete="off"
                placeholder="e.g. 427"
                value={salesPin.replace(/\D/g, "").slice(0, 3)}
                onChange={(e) => setSalesPin(e.target.value.replace(/\D/g, "").slice(0, 3))}
              />
            </AdminFormField>
          </AdminFormGrid>
        </AdminFormSection>
      </form>
    </AdminFormShell>
  );
}
