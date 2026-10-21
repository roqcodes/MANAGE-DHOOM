"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { adminPost } from "@/modules/admin/lib/admin-api-client";
import { Modal, SecondaryBtn } from "@/modules/admin/components/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import { clearSalesmanPinVerifyCache } from "@/modules/users/lib/verify-salesman-pin.client";
import type { ErpSalesmanRow } from "@/modules/users/services/erp-salesmen.service";

export function UsersChangeSalesmanPinModal({
  salesman,
  onClose,
  onSaved,
}: {
  salesman: ErpSalesmanRow;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pinDigits = pin.replace(/\D/g, "").slice(0, 3);
  const canSubmit = pinDigits.length === 3 && !isPending;

  function handleSave() {
    startTransition(async () => {
      setError(null);
      try {
        await adminPost("users", {
          action: "change_salesman_pin",
          salesmanId: salesman.id,
          pin: pinDigits,
        });
        void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "erp-salesmen"] });
        clearSalesmanPinVerifyCache();
        onSaved?.();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not change PIN.");
      }
    });
  }

  return (
    <Modal title={`Change PIN — ${salesman.name}`} onClose={onClose} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Enter a new unique 3-digit PIN. The previous PIN stops working immediately.
        </p>
        <div className="space-y-2">
          <Label htmlFor="change-salesman-pin">New PIN</Label>
          <Input
            id="change-salesman-pin"
            inputMode="numeric"
            maxLength={3}
            value={pinDigits}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 3))}
            autoComplete="off"
            placeholder="e.g. 427"
          />
        </div>

        <ErrorsFeedbackBridge errors={error} />

        <div className="flex justify-end gap-2">
          <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
          <Button disabled={!canSubmit} onClick={handleSave}>
            Update PIN
          </Button>
        </div>
      </div>
    </Modal>
  );
}
