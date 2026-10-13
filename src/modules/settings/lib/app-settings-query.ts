import { queryOptions } from "@tanstack/react-query";

import {
  DEFAULT_CURRENCY_SETTINGS,
  type CurrencySettings,
} from "@/lib/format-currency";
import { adminGet, adminPatch } from "@/modules/admin/lib/admin-api-client";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import type { AppSettingsPatch } from "@/modules/settings/types";

/** Repair legacy React Query cache that stored the full `{ settings }` API envelope. */
export function normalizeAppSettings(raw: unknown): CurrencySettings {
  if (raw && typeof raw === "object" && "settings" in raw && !("country_code" in raw)) {
    return normalizeAppSettings((raw as { settings: unknown }).settings);
  }
  const partial = (raw && typeof raw === "object" ? raw : {}) as Partial<CurrencySettings>;
  return {
    ...DEFAULT_CURRENCY_SETTINGS,
    ...partial,
    country_code: partial.country_code?.trim() || DEFAULT_CURRENCY_SETTINGS.country_code,
    country_name: partial.country_name?.trim() || DEFAULT_CURRENCY_SETTINGS.country_name,
    currency_code: partial.currency_code?.trim() || DEFAULT_CURRENCY_SETTINGS.currency_code,
    currency_symbol:
      partial.currency_symbol?.trim() || DEFAULT_CURRENCY_SETTINGS.currency_symbol,
    locale: partial.locale?.trim() || DEFAULT_CURRENCY_SETTINGS.locale,
    show_mrp: partial.show_mrp ?? DEFAULT_CURRENCY_SETTINGS.show_mrp,
    capture_payments: partial.capture_payments ?? DEFAULT_CURRENCY_SETTINGS.capture_payments,
    allow_negative_store_stock:
      partial.allow_negative_store_stock ?? DEFAULT_CURRENCY_SETTINGS.allow_negative_store_stock,
  };
}

/** Unwrap `{ settings }` from GET /api/admin/settings — must match every app-settings queryFn. */
export async function fetchAdminAppSettings(): Promise<CurrencySettings> {
  const { settings } = await adminGet<{ settings: CurrencySettings }>("settings");
  return normalizeAppSettings(settings);
}

export async function patchAdminAppSettings(
  patch: AppSettingsPatch,
): Promise<CurrencySettings> {
  const { settings } = await adminPatch<{ settings: CurrencySettings }>("settings", patch);
  return normalizeAppSettings(settings);
}

export function adminAppSettingsQueryOptions(staleTime = 60_000) {
  return queryOptions({
    queryKey: adminQueryKeys.appSettings(),
    queryFn: fetchAdminAppSettings,
    staleTime,
  });
}
