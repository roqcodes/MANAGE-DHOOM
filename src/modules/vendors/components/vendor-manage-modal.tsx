"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";

import type { Vendor } from "@/common/admin/types";
import {
  createVendorAction,
  updateVendorAction,
} from "@/modules/vendors/actions/vendors.actions";
import { invalidateAdminVendorCatalogQueries } from "@/modules/erp/lib/entity-live-search.client";
import {
  FieldLabel,
  FormError,
  Modal,
  PrimaryBtn,
  SecondaryBtn,
  fieldControlCls,
  inputCls,
} from "@/modules/admin/components/modal";
import {
  validateBeforeFormSave,
  formErrorsAdapter,

  FormValidationScope,
  clearFormSubmitFeedback,
  useFormFieldValidation,
} from "@/modules/admin/ui";

function VendorManageModalForm({
  mode,
  vendor,
  onClose,
}: {
  mode: "create" | "edit";
  vendor?: Vendor;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | string[] | null>(null);
  const fieldValidation = useFormFieldValidation();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = (fd.get("name") as string).trim();
    const contact = (fd.get("contact") as string).trim();
    if (
      !validateBeforeFormSave(
        [{ key: "name", ok: Boolean(name), message: "Name is required." }],
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
        if (mode === "edit" && vendor) {
          await updateVendorAction(vendor.id, { name, contact });
        } else {
          await createVendorAction({ name, contact });
        }
        void invalidateAdminVendorCatalogQueries(queryClient);
        clearFormSubmitFeedback({
          setFormErrors: formErrorsAdapter(setError),
          clearFieldValidation: fieldValidation.clearFieldValidation,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
        <form onSubmit={handleSubmit} className="space-y-4">
          <FieldLabel label="Vendor Name">
            <input
              className={fieldControlCls(inputCls, fieldValidation.isFieldInvalid("name"))}
              name="name"
              defaultValue={vendor?.name ?? ""}
              placeholder="e.g. Fresh Farms Co."
              required
            />
          </FieldLabel>
          <FieldLabel label="Contact">
            <input
              className={inputCls}
              name="contact"
              defaultValue={vendor?.contact ?? ""}
              placeholder="Phone or email"
            />
          </FieldLabel>
          <FormError message={error} />
          <div className="flex justify-end gap-2 pt-1">
            <SecondaryBtn onClick={onClose}>Cancel</SecondaryBtn>
            <PrimaryBtn type="submit" disabled={isPending}>
              {isPending
                ? "Saving…"
                : mode === "edit"
                  ? "Save Changes"
                  : "Create Vendor"}
            </PrimaryBtn>
          </div>
        </form>
  );
}

export function VendorManageModal({
  mode,
  vendor,
  onClose,
}: {
  mode: "create" | "edit";
  vendor?: Vendor;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <Modal
        title={mode === "create" ? "New Vendor" : "Edit Vendor"}
        onClose={onClose}
        size="sm"
      >
        <FormValidationScope resetKey={`${mode}-${vendor?.id ?? "new"}`}>
          <VendorManageModalForm mode={mode} vendor={vendor} onClose={onClose} />
        </FormValidationScope>
      </Modal>
    </AnimatePresence>
  );
}
