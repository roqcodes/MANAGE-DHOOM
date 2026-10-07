"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { RequiredFieldMark } from "@/lib/required-field-label";
import { StoreSelect, useErpStores } from "@/modules/erp/components/use-erp-stores";

type UseActiveStoreFormFieldOptions = {
  mode?: "create" | "edit";
};

/** Keeps form store state aligned with the header store switcher. */
export function useActiveStoreFormField(options?: UseActiveStoreFormFieldOptions) {
  const { stores, activeStoreId } = useErpStores();
  const mode = options?.mode ?? "create";
  const [storeId, setStoreId] = useState("");

  useEffect(() => {
    if (mode === "create" && activeStoreId) {
      setStoreId(activeStoreId);
    }
  }, [activeStoreId, mode]);

  const effectiveStoreId = mode === "create" ? activeStoreId || storeId : storeId;
  const storeLabel =
    stores.find((s) => s.id === effectiveStoreId)?.name ?? "Select a store in the header";

  return {
    stores,
    activeStoreId,
    storeId,
    setStoreId,
    effectiveStoreId,
    storeLabel,
    storeRequiredMessage: !effectiveStoreId
      ? "Select a store using the header switcher before saving."
      : null,
  };
}

export function ActiveStoreFormField({
  mode,
  stores,
  activeStoreId,
  storeId,
  onStoreIdChange,
  label = "Store",
  allowAll = false,
  required = true,
}: {
  mode: "create" | "edit";
  stores: Array<{ id: string; name: string }>;
  activeStoreId: string;
  storeId: string;
  onStoreIdChange: (id: string) => void;
  label?: string;
  allowAll?: boolean;
  required?: boolean;
}) {
  const effectiveId = mode === "create" ? activeStoreId || storeId : storeId;
  const displayName =
    stores.find((s) => s.id === effectiveId)?.name ?? "Select a store in the header";

  if (mode === "create") {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">
          {label}
          {required && label.trim() ? <RequiredFieldMark /> : null}
        </span>
        <Input readOnly value={displayName} required={required} />
      </label>
    );
  }

  return (
    <StoreSelect
      value={storeId}
      onChange={onStoreIdChange}
      stores={stores}
      label={label}
      allowAll={allowAll}
      required={required}
    />
  );
}
