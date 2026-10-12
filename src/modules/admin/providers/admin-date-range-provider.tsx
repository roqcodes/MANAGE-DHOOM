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

export function AdminDateRangeProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<AdminDateRangeValue>(() => applyAdminDatePreset("today"));
  const [pageDefaultPreset, setPageDefaultPreset] = useState<AdminDatePreset>("today");

  const clearDateRange = useCallback(() => {
    setValue(applyAdminDatePreset(pageDefaultPreset));
  }, [pageDefaultPreset]);

  const ctx = useMemo(
    () => ({
      value,
      setValue,
      pageDefaultPreset,
      setPageDefaultPreset,
      clearDateRange,
    }),
    [value, pageDefaultPreset, clearDateRange],
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
