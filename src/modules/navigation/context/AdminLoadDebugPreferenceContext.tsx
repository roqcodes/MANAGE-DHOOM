"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  readAdminLoadDebugEnabledFromStorage,
  writeAdminLoadDebugEnabledToStorage,
} from "@/modules/navigation/lib/admin-load-debug-preference";

type AdminLoadDebugPreferenceContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const AdminLoadDebugPreferenceContext =
  createContext<AdminLoadDebugPreferenceContextValue | null>(null);

export function AdminLoadDebugPreferenceProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    setEnabledState(readAdminLoadDebugEnabledFromStorage());
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeAdminLoadDebugEnabledToStorage(next);
  }, []);

  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);

  return (
    <AdminLoadDebugPreferenceContext.Provider value={value}>
      {children}
    </AdminLoadDebugPreferenceContext.Provider>
  );
}

export function useAdminLoadDebugPreference(): AdminLoadDebugPreferenceContextValue {
  const ctx = useContext(AdminLoadDebugPreferenceContext);
  if (!ctx) {
    throw new Error(
      "useAdminLoadDebugPreference must be used within AdminLoadDebugPreferenceProvider",
    );
  }
  return ctx;
}
