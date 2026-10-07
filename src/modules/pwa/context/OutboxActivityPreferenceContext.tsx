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
  readOutboxActivityBarEnabledFromStorage,
  writeOutboxActivityBarEnabledToStorage,
} from "@/modules/pwa/lib/outbox-activity-preference";

type OutboxActivityPreferenceContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const OutboxActivityPreferenceContext =
  createContext<OutboxActivityPreferenceContextValue | null>(null);

export function OutboxActivityPreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    setEnabledState(readOutboxActivityBarEnabledFromStorage());
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeOutboxActivityBarEnabledToStorage(next);
  }, []);

  const value = useMemo(
    () => ({ enabled, setEnabled }),
    [enabled, setEnabled],
  );

  return (
    <OutboxActivityPreferenceContext.Provider value={value}>
      {children}
    </OutboxActivityPreferenceContext.Provider>
  );
}

export function useOutboxActivityPreference(): OutboxActivityPreferenceContextValue {
  const ctx = useContext(OutboxActivityPreferenceContext);
  if (!ctx) {
    throw new Error(
      "useOutboxActivityPreference must be used within OutboxActivityPreferenceProvider",
    );
  }
  return ctx;
}
