"use client";

import { CustomerFormView } from "@/modules/customers/components/customer-form-view";

export function AdminCustomerFormView({
  mode,
  customerId,
  variant = "page",
  open,
  onOpenChange,
  onSuccess,
  modalStacked,
}: {
  mode: "create" | "edit";
  customerId?: string;
  variant?: "page" | "modal";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (id?: string) => void;
  modalStacked?: boolean;
}) {
  return (
    <CustomerFormView
      mode={mode}
      customerId={customerId}
      variant={variant}
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
      modalStacked={modalStacked}
    />
  );
}
