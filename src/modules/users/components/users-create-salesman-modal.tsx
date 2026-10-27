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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";

export function UsersCreateSalesmanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: () => void;
}) {
  return (
    <Modal title="Create salesman" onClose={onClose} size="md">
      <FormValidationScope>
        <UsersCreateSalesmanModalForm onClose={onClose} onCreated={onCreated} />
      </FormValidationScope>
    </Modal>
  );
}

function UsersCreateSalesmanModalForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: () => void;
}) {
  const queryClient = useQueryClient();
  const fieldValidation = useFormFieldValidation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pinDigits = pin.replace(/\D/g, "").slice(0, 3);
  const canSubmit =
    name.trim().length > 0 && pinDigits.length === 3 && !isPending;

  function handleCreate() {
    const validationMessages = applyFieldValidation(
      [
        { key: "name", ok: name.trim().length > 0, message: "Full name is required." },
        { key: "pin", ok: pinDigits.length === 3, message: "Enter a valid 3-digit PIN." },
      ],
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
          action: "create_salesman",
          name,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          pin: pinDigits,
        });
        void queryClient.invalidateQueries({ queryKey: ["admin", "erp-salesmen"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        onCreated?.();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create salesman.");
      }
    });
  }

  return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Salesmen are identified by a unique 3-digit PIN on sales invoices and orders. They do not
          receive portal login access.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="create-salesman-name">Full name</Label>
            <Input
              id="create-salesman-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Rahul Verma"
              aria-invalid={fieldValidation.isFieldInvalid("name")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-salesman-email">Email (optional)</Label>
            <Input
              id="create-salesman-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-salesman-phone">Phone (optional)</Label>
            <Input
              id="create-salesman-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="create-salesman-pin">PIN (3 digits, unique)</Label>
            <Input
              id="create-salesman-pin"
              inputMode="numeric"
              maxLength={3}
              value={pinDigits}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 3))}
              autoComplete="off"
              placeholder="e.g. 427"
              aria-invalid={fieldValidation.isFieldInvalid("pin")}
            />
          </div>
        </div>

        <ErrorsFeedbackBridge errors={error} />

        <div className="flex justify-end gap-2">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <Button disabled={!canSubmit} onClick={handleCreate}>
            Create salesman
          </Button>
        </div>
      </div>
  );
}
