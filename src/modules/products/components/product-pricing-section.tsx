"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Info } from "lucide-react";

import { AdminTableBodySkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeFinalPrice } from "@/modules/pricing/pricing.compute";
import type { PricingRuleRow } from "@/modules/pricing/types";
import type { VariantPricingSuggestion } from "@/modules/pricing/services/pricing.service";
import {
  applySuggestedPricesAction,
  fetchVariantPricingSuggestionsAction,
  setProductSmartPricingAction,
  upsertProductPricingRuleAction,
} from "@/modules/pricing/actions/product-pricing.actions";
import { adminQueryKeys } from "@/modules/admin/lib/admin-query-keys";
import { currencyLabel, formatInr } from "@/lib/format-currency";

function parseOptionalNonNeg(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium">{children}</p>;
}

export function ProductPricingSection({
  productId,
  initialRule,
  useSmartPricing,
}: {
  productId: string;
  initialRule: PricingRuleRow | null;
  useSmartPricing: boolean;
}) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [smartEnabled, setSmartEnabled] = useState(useSmartPricing);

  const [marginStr, setMarginStr] = useState(
    initialRule?.margin_percent != null ? String(initialRule.margin_percent) : "",
  );
  const [fixedStr, setFixedStr] = useState(
    initialRule?.fixed_markup != null ? String(initialRule.fixed_markup) : "",
  );
  const [isActive, setIsActive] = useState(() =>
    Boolean(
      initialRule?.is_active &&
        (initialRule.margin_percent != null || initialRule.fixed_markup != null),
    ),
  );
  const [previewBaseStr, setPreviewBaseStr] = useState("100");

  useEffect(() => {
    setSmartEnabled(useSmartPricing);
  }, [useSmartPricing]);

  useEffect(() => {
    if (!initialRule) {
      setMarginStr("");
      setFixedStr("");
      setIsActive(false);
      return;
    }
    setMarginStr(
      initialRule.margin_percent != null ? String(initialRule.margin_percent) : "",
    );
    setFixedStr(
      initialRule.fixed_markup != null ? String(initialRule.fixed_markup) : "",
    );
    setIsActive(
      initialRule.is_active === true &&
        (initialRule.margin_percent != null || initialRule.fixed_markup != null),
    );
  }, [
    initialRule?.id,
    initialRule?.margin_percent,
    initialRule?.fixed_markup,
    initialRule?.is_active,
  ]);

  const { data: suggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: adminQueryKeys.productPricingSuggestions(productId),
    queryFn: () => fetchVariantPricingSuggestionsAction(productId),
    enabled: smartEnabled,
  });

  const marginNum = parseOptionalNonNeg(marginStr);
  const fixedNum = parseOptionalNonNeg(fixedStr);
  const bothFilled =
    marginStr.trim() !== "" &&
    fixedStr.trim() !== "" &&
    marginNum !== null &&
    fixedNum !== null;

  const preview = useMemo(() => {
    const base = parseFloat(previewBaseStr);
    const b = Number.isFinite(base) && base >= 0 ? base : 0;
    let m = marginNum;
    let f = fixedNum;
    if (m !== null && f !== null) f = null;
    const rule =
      m === null && f === null ? null : { margin_percent: m, fixed_markup: f };
    return computeFinalPrice(b, rule);
  }, [previewBaseStr, marginNum, fixedNum]);

  function handleToggleSmart(checked: boolean) {
    setError(null);
    setSmartEnabled(checked);
    startTransition(async () => {
      const res = await setProductSmartPricingAction(productId, checked);
      if (!res.ok) {
        setError(res.message);
        setSmartEnabled(!checked);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productDetail(productId),
      });
    });
  }

  function handleSaveRule() {
    setError(null);
    const m = parseOptionalNonNeg(marginStr);
    const f = parseOptionalNonNeg(fixedStr);

    if (marginStr.trim() !== "" && marginStr.trim() !== "." && m === null) {
      setError("Margin % must be a valid number ≥ 0.");
      return;
    }
    if (fixedStr.trim() !== "" && fixedStr.trim() !== "." && f === null) {
      setError("Fixed markup must be a valid number ≥ 0.");
      return;
    }

    const marginPercent = marginStr.trim() === "" ? null : m;
    const fixedMarkup = fixedStr.trim() === "" ? null : f;

    startTransition(async () => {
      const res = await upsertProductPricingRuleAction({
        productId,
        marginPercent,
        fixedMarkup,
        isActive: marginPercent === null && fixedMarkup === null ? false : isActive,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productDetail(productId),
      });
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productPricingSuggestions(productId),
      });
    });
  }

  function handleApplySuggestions() {
    setError(null);
    startTransition(async () => {
      const res = await applySuggestedPricesAction(productId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productDetail(productId),
      });
      await queryClient.invalidateQueries({
        queryKey: adminQueryKeys.productPricingSuggestions(productId),
      });
    });
  }

  return (
    <Card className="border border-border ring-0">
      <CardHeader className="border-b border-border">
        <CardTitle className="text-sm font-medium">Pricing model</CardTitle>
        <CardDescription className="text-sm">
          List prices drive checkout. Central warehouse stock gates sales.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pb-3 text-sm">
        <Alert>
          <Info />
          <AlertTitle className="text-sm font-medium">How pricing works</AlertTitle>
          <AlertDescription className="text-sm">
            Customers pay list price; sales require central stock only. Vendor stock is for
            purchasing — create POs via{" "}
            <Link href="/admin/erp/purchase-orders" className="font-medium text-primary">
              Purchase orders
            </Link>
            .
          </AlertDescription>
        </Alert>

        <Separator />

        <Field orientation="horizontal">
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <FieldLabel htmlFor="smart-pricing-toggle" className="text-sm font-medium">
                Smart pricing assist
              </FieldLabel>
              <Badge variant="secondary">Beta</Badge>
            </div>
            <FieldDescription className="text-sm">
              Dynamic cost and margin suggestions. Does not change customer prices until you
              apply list prices.
            </FieldDescription>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant={smartEnabled ? "outline" : "default"}>List price</Badge>
              {smartEnabled ? <Badge variant="default">Assist enabled</Badge> : null}
            </div>
          </div>
          <Switch
            id="smart-pricing-toggle"
            checked={smartEnabled}
            onCheckedChange={handleToggleSmart}
            disabled={isPending}
            aria-label="Enable smart pricing assist"
          />
        </Field>

        {!smartEnabled ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Set selling prices in the variants table above. Customers pay that list price when
            central stock is available.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Define margin rules, review per-SKU suggestions, then apply to list prices when
              ready.
            </p>

            <FieldSet>
              <FieldLegend className="text-sm font-medium">Pricing rule</FieldLegend>
              <FieldGroup>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="margin-percent" className="text-sm">
                      Margin %
                    </FieldLabel>
                    <Input
                      id="margin-percent"
                      type="number"
                      min={0}
                      step="0.01"
                      value={marginStr}
                      onChange={(e) => setMarginStr(e.target.value)}
                      placeholder="e.g. 10"
                    />
                    <FieldDescription className="text-sm">
                      Optional percentage markup on vendor cost.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="fixed-markup" className="text-sm">
                      {currencyLabel("Fixed markup")}
                    </FieldLabel>
                    <Input
                      id="fixed-markup"
                      type="number"
                      min={0}
                      step="0.01"
                      value={fixedStr}
                      onChange={(e) => setFixedStr(e.target.value)}
                      placeholder="e.g. 5"
                    />
                    <FieldDescription className="text-sm">
                      Optional flat amount added to vendor cost.
                    </FieldDescription>
                  </Field>
                </div>

                {bothFilled ? (
                  <p className="text-sm text-muted-foreground">
                    Both fields are set — margin % is saved; fixed markup is ignored.
                  </p>
                ) : null}

                <Field orientation="horizontal">
                  <Checkbox
                    id="rule-active"
                    checked={isActive}
                    onCheckedChange={(checked) => setIsActive(checked === true)}
                    disabled={marginStr.trim() === "" && fixedStr.trim() === ""}
                  />
                  <FieldLabel htmlFor="rule-active" className="text-sm">
                    Rule active
                  </FieldLabel>
                </Field>
              </FieldGroup>
            </FieldSet>

            <Separator />

            <div className="flex flex-col gap-3">
              <SectionLabel>Sample calculation</SectionLabel>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field className="sm:max-w-40">
                  <FieldLabel htmlFor="sample-cost" className="text-sm">
                    {currencyLabel("Sample vendor cost")}
                  </FieldLabel>
                  <Input
                    id="sample-cost"
                    type="number"
                    min={0}
                    step="0.01"
                    value={previewBaseStr}
                    onChange={(e) => setPreviewBaseStr(e.target.value)}
                  />
                </Field>
                <p className="text-sm text-muted-foreground">
                  Cost {formatInr(preview.base_price)} → suggested{" "}
                  <span className="font-medium text-foreground">
                    {formatInr(preview.final_price)}
                  </span>{" "}
                  (margin {formatInr(preview.margin_amount)})
                </p>
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" disabled={isPending} onClick={handleSaveRule}>
                  {isPending ? "Saving…" : "Save pricing rule"}
                </Button>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SectionLabel>SKU suggestions</SectionLabel>
                  <Badge variant="secondary">Beta</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending || suggestionsLoading}
                  onClick={handleApplySuggestions}
                >
                  Apply all to list prices
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Suggested list prices from lowest vendor cost and your rule.
              </p>

              {suggestionsLoading ? (
                <AdminTableBodySkeleton rows={4} />
              ) : suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add variants first.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-sm">SKU</TableHead>
                      <TableHead className="text-sm">Central stock</TableHead>
                      <TableHead className="text-sm">{currencyLabel("Vendor cost")}</TableHead>
                      <TableHead className="text-sm">{currencyLabel("Current list")}</TableHead>
                      <TableHead className="text-sm">{currencyLabel("Suggested")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(suggestions as VariantPricingSuggestion[]).map((row) => (
                      <TableRow key={row.variantId}>
                        <TableCell className="text-sm font-medium">{row.variantName}</TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {row.centralStock > 0 ? (
                            row.centralStock
                          ) : (
                            <span className="text-muted-foreground">{row.centralStock}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {row.lowestVendorBase != null
                            ? formatInr(row.lowestVendorBase)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {row.listPrice > 0 ? formatInr(row.listPrice) : "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums font-medium">
                          {row.suggestedPrice != null ? formatInr(row.suggestedPrice) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        )}

        {error ? <FieldError className="text-sm">{error}</FieldError> : null}
      </CardContent>
    </Card>
  );
}
