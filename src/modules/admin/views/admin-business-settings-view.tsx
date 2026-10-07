"use client";

import { InventorySettingsCard } from "@/modules/settings/components/inventory-settings-card";
import { PaymentSettingsCard } from "@/modules/settings/components/payment-settings-card";
import { RegionCurrencySettingsCard } from "@/modules/settings/components/region-currency-settings-card";

export function AdminBusinessSettingsView() {
  return (
    <div className="mx-auto w-full max-w-7xl px-3 py-3 sm:px-4 sm:py-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Business settings</h1>
        <p className="text-sm text-muted-foreground">
          Currency, checkout, tax, and customer notifications for the store.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <RegionCurrencySettingsCard />
        <InventorySettingsCard />
        <PaymentSettingsCard />
      </div>
    </div>
  );
}
