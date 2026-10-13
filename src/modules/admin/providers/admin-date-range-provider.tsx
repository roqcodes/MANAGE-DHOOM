"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  applyAdminDatePreset,
  readStoredAdminDateRange,
  writeStoredAdminDateRange,
  type AdminDatePreset,
  type AdminDateRangeValue,
} from "@/modules/admin/lib/admin-date-range";

type AdminDateRangeContextValue = {
  value: AdminDateRangeValue;
  setValue: (next: AdminDateRangeValue) => void;
  pageDefaultPreset: AdminDatePreset;
  setPageDefaultPreset: (preset: AdminDatePreset) => void;
  clearDateRange: () => void;
};

const AdminDateRangeContext = createContext<AdminDateRangeContextValue | null>(null);

function initialDateRange(): AdminDateRangeValue {
  return readStoredAdminDateRange() ?? applyAdminDatePreset("today");
}

export function AdminDateRangeProvider({ children }: { children: ReactNode }) {
  const [value, setValueState] = useState<AdminDateRangeValue>(initialDateRange);
  const [pageDefaultPreset, setPageDefaultPreset] = useState<AdminDatePreset>("today");

  const setValue = useCallback((next: AdminDateRangeValue) => {
    setValueState(next);
    writeStoredAdminDateRange(next);
  }, []);

  const clearDateRange = useCallback(() => {
    setValue(applyAdminDatePreset(pageDefaultPreset));
  }, [pageDefaultPreset, setValue]);

  const ctx = useMemo(
    () => ({
      value,
      setValue,
      pageDefaultPreset,
      setPageDefaultPreset,
      clearDateRange,
    }),
    [value, pageDefaultPreset, clearDateRange, setValue],
  );

  return (
    <AdminDateRangeContext.Provider value={ctx}>{children}</AdminDateRangeContext.Provider>
  );
}

export function useAdminDateRangeContext() {
  const ctx = useContext(AdminDateRangeContext);
  if (!ctx) {
    throw new Error("useAdminDateRangeContext must be used within AdminDateRangeProvider");
  }
  return ctx;
}
