"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDownIcon, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listFilledSpecs,
  normalizeProductSpecs,
  PRODUCT_SPEC_CATALOG,
  specsCatalogEntry,
  type ProductSpecs,
} from "@/modules/products/product-specs.catalog";
import { updateProductSpecsAction } from "@/modules/products/actions/products.actions";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";

function loadFormState(initialSpecs: unknown) {
  const normalized = normalizeProductSpecs(initialSpecs);
  return {
    selected: new Set(Object.keys(normalized)),
    values: Object.fromEntries(
      PRODUCT_SPEC_CATALOG.map((s) => [s.key, normalized[s.key] ?? ""]),
    ),
  };
}

export function ProductSpecsSection({
  productId,
  initialSpecs,
}: {
  productId: string;
  initialSpecs: unknown;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [values, setValues] = useState<Record<string, string>>({});

  const savedSpecs = useMemo(
    () => listFilledSpecs(normalizeProductSpecs(initialSpecs)),
    [initialSpecs],
  );

  useEffect(() => {
    const { selected: nextSelected, values: nextValues } = loadFormState(initialSpecs);
    setSelected(nextSelected);
    setValues(nextValues);
  }, [productId, initialSpecs]);

  const selectedKeys = useMemo(
    () => PRODUCT_SPEC_CATALOG.filter((s) => selected.has(s.key)).map((s) => s.key),
    [selected],
  );

  function toggleKey(key: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function handleCancel() {
    setError(null);
    const { selected: nextSelected, values: nextValues } = loadFormState(initialSpecs);
    setSelected(nextSelected);
    setValues(nextValues);
    setIsEditing(false);
  }

  function handleSave() {
    setError(null);
    const payload: ProductSpecs = {};
    for (const key of selected) {
      const value = (values[key] ?? "").trim();
      if (!value) {
        setError(
          `Enter a value for "${specsCatalogEntry(key)?.label ?? key}".`,
        );
        return;
      }
      payload[key as keyof ProductSpecs] = value;
    }

    startTransition(async () => {
      try {
        await updateProductSpecsAction(productId, payload as Record<string, string>);
        await queryClient.invalidateQueries({
          queryKey: adminQueryKeys.productDetail(productId),
        });
        setIsEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  return (
    <Card className="border border-border ring-0">
      <CardHeader className="border-b border-border py-3">
        <CardTitle className="text-sm font-medium">Specifications</CardTitle>
        <CardDescription className="text-sm">
          Key details shown in the app product page.
        </CardDescription>
        {!isEditing ? (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setIsEditing(true);
              }}
            >
              {savedSpecs.length > 0 ? (
                <>
                  <Pencil data-icon="inline-start" />
                  Edit
                </>
              ) : (
                <>
                  <Plus data-icon="inline-start" />
                  Add
                </>
              )}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="py-3 text-sm">
        {isEditing ? (
          <div className="flex flex-col gap-3">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="w-full max-w-sm justify-between font-normal sm:w-auto"
                  />
                }
              >
                {selectedKeys.length > 0
                  ? `${selectedKeys.length} selected`
                  : "Choose specifications"}
                <ChevronsUpDownIcon data-icon="inline-end" />
              </PopoverTrigger>
              <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search…" />
                  <CommandList>
                    <CommandEmpty>No match.</CommandEmpty>
                    <CommandGroup>
                      {PRODUCT_SPEC_CATALOG.map((spec) => {
                        const isSelected = selected.has(spec.key);
                        return (
                          <CommandItem
                            key={spec.key}
                            value={spec.label}
                            data-checked={isSelected || undefined}
                            onSelect={() => toggleKey(spec.key, !isSelected)}
                          >
                            {spec.label}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedKeys.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {selectedKeys.map((key) => {
                  const spec = specsCatalogEntry(key);
                  if (!spec) return null;
                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <label
                        htmlFor={`spec-${key}`}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {spec.label}
                      </label>
                      <Input
                        id={`spec-${key}`}
                        value={values[key] ?? ""}
                        placeholder={spec.placeholder}
                        aria-invalid={!(values[key] ?? "").trim() && error ? true : undefined}
                        onChange={(e) =>
                          setValues((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pick one or more specifications, then enter values.
              </p>
            )}

            <FieldError>{error}</FieldError>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={handleSave}
              >
                {isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={handleCancel}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : savedSpecs.length > 0 ? (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {savedSpecs.map((spec) => (
              <div key={spec.key} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{spec.label}</dt>
                <dd className="font-medium text-foreground">{spec.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            No specifications yet. Use Add to define what appears in the app.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
