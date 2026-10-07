import type { CurrencySettings } from "@/lib/format-currency";

export type AppSettings = CurrencySettings;

export type AppSettingsPatch = Partial<CurrencySettings>;
