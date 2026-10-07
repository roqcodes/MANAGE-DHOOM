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
  readAiAssistantEnabledFromStorage,
  writeAiAssistantEnabledToStorage,
} from "../lib/ai-assistant-preference";

type AiAssistantPreferenceContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const AiAssistantPreferenceContext =
  createContext<AiAssistantPreferenceContextValue | null>(null);

export function AiAssistantPreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    setEnabledState(readAiAssistantEnabledFromStorage());
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeAiAssistantEnabledToStorage(next);
  }, []);

  const value = useMemo(
    () => ({ enabled, setEnabled }),
    [enabled, setEnabled],
  );

  return (
    <AiAssistantPreferenceContext.Provider value={value}>
      {children}
    </AiAssistantPreferenceContext.Provider>
  );
}

export function useAiAssistantPreference(): AiAssistantPreferenceContextValue {
  const ctx = useContext(AiAssistantPreferenceContext);
  if (!ctx) {
    throw new Error(
      "useAiAssistantPreference must be used within AiAssistantPreferenceProvider",
    );
  }
  return ctx;
}
