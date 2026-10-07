"use client";

import { createContext, useContext, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { useAdminBootstrap } from "@/modules/admin/providers/admin-bootstrap-provider";

import {
  DEFAULT_CURRENCY_SETTINGS,
  formatCurrency,
  formatCurrencyCompact,
  resolveCurrencySymbol,
  setCurrencySettings,
  type CurrencySettings,
} from "@/lib/format-currency";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

type CurrencyContextValue = {
  settings: CurrencySettings;
  format: typeof formatCurrency;
  formatCompact: typeof formatCurrencyCompact;
  symbol: string;
  /** e.g. `Price (₹)` using the active settings symbol */
  label: (prefix: string) => string;
  isLoading: boolean;
};

const CurrencyContext = createContext<CurrencyContextValue>({
  settings: DEFAULT_CURRENCY_SETTINGS,
  format: formatCurrency,
  formatCompact: formatCurrencyCompact,
  symbol: DEFAULT_CURRENCY_SETTINGS.currency_symbol,
  label: (prefix) =>
    `${prefix} (${DEFAULT_CURRENCY_SETTINGS.currency_symbol})`,
  isLoading: true,
});

export function CurrencySettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { secondaryQueriesEnabled } = useAdminBootstrap();
  const { data, isLoading } = useQuery({
    queryKey: adminQueryKeys.appSettings(),
    queryFn: () =>
      adminGet<{ settings: CurrencySettings }>("settings").then((r) => r.settings),
    staleTime: 5 * 60_000,
    enabled: secondaryQueriesEnabled,
    placeholderData: DEFAULT_CURRENCY_SETTINGS,
  });

  const settings = data ?? DEFAULT_CURRENCY_SETTINGS;
  const symbol = resolveCurrencySymbol(settings);

  useEffect(() => {
    setCurrencySettings(settings);
  }, [settings]);

  return (
    <CurrencyContext.Provider
      value={{
        settings,
        format: formatCurrency,
        formatCompact: formatCurrencyCompact,
        symbol,
        label: (prefix) => `${prefix} (${symbol})`,
        isLoading,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrencySettings() {
  return useContext(CurrencyContext);
}
