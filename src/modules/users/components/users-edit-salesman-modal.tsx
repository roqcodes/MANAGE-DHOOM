"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { adminPost } from "@/modules/admin/lib/admin-api-client";
import { Modal, SecondaryBtn } from "@/modules/admin/components/modal";
import {
  FormValidationScope,
  applyFieldValidation,
  useFormFieldValidation,
} from "@/modules/admin/ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import type { ErpSalesmanRow } from "@/modules/users/services/erp-salesmen.service";

export function UsersEditSalesmanModal(props: {
  salesman: ErpSalesmanRow;
  onClose: () => void;
  onSaved?: () => void;
}) {
  return (
    <Modal title="Edit salesman" onClose={props.onClose} size="md">
      <FormValidationScope resetKey={props.salesman.id}>
        <UsersEditSalesmanModalForm {...props} />
      </FormValidationScope>
    </Modal>
  );
}

function UsersEditSalesmanModalForm({
  salesman,
  onClose,
  onSaved,
}: {
  salesman: ErpSalesmanRow;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const fieldValidation = useFormFieldValidation();
  const [name, setName] = useState(salesman.name);
  const [email, setEmail] = useState(salesman.email ?? "");
  const [phone, setPhone] = useState(salesman.phone ?? "");
  const [isActive, setIsActive] = useState(salesman.is_active);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canSubmit = name.trim().length > 0 && !isPending;

  function handleSave() {
    const validationMessages = applyFieldValidation(
      [{ key: "name", ok: name.trim().length > 0, message: "Full name is required." }],
      fieldValidation.markFieldValidationFailed,
      fieldValidation.clearFieldValidation,
    );
    if (validationMessages) {
      setError(validationMessages[0]);
      return;
    }
    startTransition(async () => {
      setError(null);
      try {
        await adminPost("users", {
          action: "update_salesman",
          salesmanId: salesman.id,
          name,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          isActive,
        });
        void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "erp-salesmen"] });
        onSaved?.();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update salesman.");
      }
    });
  }

  return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="edit-salesman-name">Full name</Label>
            <Input
              id="edit-salesman-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              aria-invalid={fieldValidation.isFieldInvalid("name")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-salesman-email">Email (optional)</Label>
            <Input
              id="edit-salesman-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-salesman-phone">Phone (optional)</Label>
            <Input
              id="edit-salesman-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="edit-salesman-active"
              checked={isActive}
              onCheckedChange={(v) => setIsActive(v === true)}
            />
            <Label htmlFor="edit-salesman-active" className="font-normal">
              Active (PIN can be used on invoices)
            </Label>
          </div>
        </div>

        <ErrorsFeedbackBridge errors={error} />

        <div className="flex justify-end gap-2">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <Button disabled={!canSubmit} onClick={handleSave}>
            Save changes
          </Button>
        </div>
      </div>
  );
}
