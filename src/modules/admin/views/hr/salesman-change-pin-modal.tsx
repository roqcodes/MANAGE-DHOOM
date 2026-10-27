"use client";

import { useState, useTransition } from "react";

import { adminPatch } from "@/modules/admin/lib/admin-api-client";
import { actionErrorMessage } from "@/modules/admin/lib/form-submit-errors";
import {
  Modal,
  PrimaryBtn,
  SecondaryBtn,
} from "@/modules/admin/components/modal";
import {
  validateBeforeFormSave,
  formErrorsAdapter,

  FormValidationScope,
  clearFormSubmitFeedback,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import { clearSalesmanPinVerifyCache } from "@/modules/users/lib/verify-salesman-pin.client";

export function SalesmanChangePinModal({
  employeeId,
  employeeName,
  currentPin,
  onClose,
  onChanged,
}: {
  employeeId: string;
  employeeName: string;
  currentPin: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  return (
    <Modal
      title="Change salesman PIN"
      subtitle={employeeName}
      onClose={onClose}
      size="sm"
    >
      <FormValidationScope>
        <SalesmanChangePinModalForm
          employeeId={employeeId}
          currentPin={currentPin}
          onClose={onClose}
          onChanged={onChanged}
        />
      </FormValidationScope>
    </Modal>
  );
}

function SalesmanChangePinModalForm({
  employeeId,
  currentPin,
  onClose,
  onChanged,
}: {
  employeeId: string;
  currentPin: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const fieldValidation = useFormFieldValidation();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | string[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const pinDigits = pin.replace(/\D/g, "").slice(0, 3);
  const canSubmit = pinDigits.length === 3 && !isPending;

  function handleSave() {
    if (
      !validateBeforeFormSave(
        [
        {
          key: "pin",
          ok: pinDigits.length === 3,
          message: "Enter a valid 3-digit PIN.",
        },
      ],
        {
          markFieldValidationFailed: fieldValidation.markFieldValidationFailed,
          clearFieldValidation: fieldValidation.clearFieldValidation,
          setFormErrors: formErrorsAdapter(setError),
        },
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        await adminPatch(`erp/employees/${employeeId}`, {
          isSalesman: true,
          salesPin: pinDigits,
        });
        clearSalesmanPinVerifyCache();
        clearFormSubmitFeedback({
          setFormErrors: formErrorsAdapter(setError),
          clearFieldValidation: fieldValidation.clearFieldValidation,
        });
        onChanged?.();
        onClose();
      } catch (e) {
        setError(actionErrorMessage(e, "Could not update PIN."));
      }
    });
  }

  return (
    <div className="space-y-4 pb-1">
      <p className="text-sm text-muted-foreground">
        Enter a new unique 3-digit PIN for POS and invoice attribution.
      </p>
      <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">Current PIN</p>
        <p className="mt-0.5 font-mono text-lg font-semibold tracking-[0.35em] tabular-nums">
          {currentPin?.trim() ? currentPin : "—"}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="change-salesman-pin">New PIN</Label>
        <Input
          id="change-salesman-pin"
          inputMode="numeric"
          maxLength={3}
          autoComplete="off"
          placeholder="e.g. 427"
          value={pinDigits}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 3))}
          aria-invalid={fieldValidation.isFieldInvalid("pin")}
        />
      </div>
      <ErrorsFeedbackBridge errors={error} />
      <div className="flex justify-end gap-2">
        <SecondaryBtn onClick={onClose} disabled={isPending}>Cancel</SecondaryBtn>
        <PrimaryBtn disabled={!canSubmit} onClick={handleSave}>
          Save PIN
        </PrimaryBtn>
      </div>
    </div>
  );
}
