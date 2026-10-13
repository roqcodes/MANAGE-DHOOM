"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDownIcon, Globe } from "lucide-react";

import { AdminPanelSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  COUNTRIES,
  CURRENCIES,
  findCountry,
  findCurrency,
} from "@/common/currency/catalog";
import { formatCurrency, type CurrencySettings } from "@/lib/format-currency";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import {
  adminAppSettingsQueryOptions,
  normalizeAppSettings,
  patchAdminAppSettings,
} from "@/modules/settings/lib/app-settings-query";

function SearchableSelect({
  label,
  placeholder,
  searchPlaceholder,
  value,
  displayValue,
  items,
  onSelect,
}: {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  value: string;
  displayValue: string;
  items: { key: string; label: string; search: string }[];
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal"
            />
          }
        >
          <span className="truncate">{displayValue || placeholder}</span>
          <ChevronsUpDownIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.key}
                    value={item.search}
                    data-checked={item.key === value || undefined}
                    onSelect={() => {
                      onSelect(item.key);
                      setOpen(false);
                    }}
                  >
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function RegionCurrencySettingsCard() {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [form, setForm] = useState<CurrencySettings | null>(null);

  const {
    data,
    isLoading,
    isError,
    error: loadError,
    refetch,
  } = useQuery({
    ...adminAppSettingsQueryOptions(),
    retry: 1,
  });

  useEffect(() => {
    if (data) setForm(normalizeAppSettings(data));
  }, [data]);

  const countryItems = useMemo(
    () =>
      COUNTRIES.map((c) => ({
        key: c.code,
        label: `${c.name} (${c.code})`,
        search: `${c.name} ${c.code}`,
      })),
    [],
  );

  const currencyItems = useMemo(
    () =>
      CURRENCIES.map((c) => ({
        key: c.code,
        label: `${c.symbol} ${c.code} — ${c.name}`,
        search: `${c.code} ${c.name} ${c.symbol}`,
      })),
    [],
  );

  if (isLoading && !form) {
    return (
      <Card className="border border-border py-0 ring-0">
        <CardContent className="p-4">
          <AdminPanelSkeleton rows={5} />
        </CardContent>
      </Card>
    );
  }

  if (isError && !form) {
    const message =
      loadError instanceof Error
        ? loadError.message
        : "Failed to load settings.";
    return (
      <Card className="border border-border py-0 ring-0">
        <CardContent className="flex flex-col gap-3 p-4">
          <FieldError>
            Could not load region settings. {message}
          </FieldError>
          <p className="text-xs text-muted-foreground">
            If this persists, ensure the <code className="text-[11px]">app_settings</code> table
            exists in Supabase (run migrations).
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!form) {
    return (
      <Card className="border border-border py-0 ring-0">
        <CardContent className="p-4 text-sm text-muted-foreground">
          No settings found.
        </CardContent>
      </Card>
    );
  }

  function handleCountrySelect(code: string) {
    const country = findCountry(code);
    if (!country) return;
    const currency = findCurrency(country.currency);
    setForm((prev) =>
      prev
        ? {
            ...prev,
            country_code: country.code,
            country_name: country.name,
            currency_code: currency?.code ?? country.currency,
            currency_symbol: currency?.symbol ?? prev.currency_symbol,
            locale: country.locale,
          }
        : prev,
    );
    setSavedMsg(null);
  }

  function handleCurrencySelect(code: string) {
    const currency = findCurrency(code);
    if (!currency) return;
    setForm((prev) =>
      prev
        ? {
            ...prev,
            currency_code: currency.code,
            currency_symbol: currency.symbol,
          }
        : prev,
    );
    setSavedMsg(null);
  }

  function handleSave() {
    if (!form) return;
    setError(null);
    setSavedMsg(null);
    startTransition(async () => {
      try {
        const saved = await patchAdminAppSettings(form);
        setForm(saved);
        await queryClient.invalidateQueries({ queryKey: adminQueryKeys.appSettings() });
        setSavedMsg("Saved. Prices across admin and the storefront app will use the new currency.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  const previewSettings = form;

  return (
    <Card className="border border-border py-0 ring-0">
      <CardHeader className="border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Globe className="size-4 text-muted-foreground" aria-hidden />
          Region & currency
        </CardTitle>
        <CardDescription className="text-sm">
          Country and currency used for prices across the admin panel and DHOOM Trading app.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SearchableSelect
            label="Country"
            placeholder="Select country"
            searchPlaceholder="Search countries…"
            value={form.country_code}
            displayValue={`${form.country_name} (${form.country_code})`}
            items={countryItems}
            onSelect={handleCountrySelect}
          />
          <SearchableSelect
            label="Currency"
            placeholder="Select currency"
            searchPlaceholder="Search currencies…"
            value={form.currency_code}
            displayValue={`${form.currency_symbol} ${form.currency_code}`}
            items={currencyItems}
            onSelect={handleCurrencySelect}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="currency-symbol"
              className="text-xs font-medium text-muted-foreground"
            >
              Currency symbol
            </label>
            <Input
              id="currency-symbol"
              value={form.currency_symbol}
              onChange={(e) => {
                setForm((prev) =>
                  prev ? { ...prev, currency_symbol: e.target.value } : prev,
                );
                setSavedMsg(null);
              }}
              placeholder="₹"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Override the symbol shown in labels and compact amounts.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Preview</span>
            <p className="text-sm font-semibold tabular-nums">
              {formatCurrency(1234.5, undefined, previewSettings)}
            </p>
            <p className="text-xs text-muted-foreground">
              Locale: {form.locale}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-3">
          <div>
            <p className="text-sm font-medium">Show MRP & discounts</p>
            <p className="text-xs text-muted-foreground">
              When off, MRP fields are hidden in product pricing and discount badges are hidden in the storefront app.
            </p>
          </div>
          <Switch
            checked={form.show_mrp}
            onCheckedChange={(checked) => {
              setForm((prev) => (prev ? { ...prev, show_mrp: checked } : prev));
              setSavedMsg(null);
            }}
          />
        </div>

        {error ? <FieldError>{error}</FieldError> : null}
        {savedMsg ? (
          <p className="text-sm text-emerald-700">{savedMsg}</p>
        ) : null}

        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
