"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { roundCalc } from "@/lib/decimal-precision";
import {
  formatNumberInputValue,
  parseNumberInputValue,
  roundToDecimalPlaces,
} from "@/lib/numeric-input";

export type NumericInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value: number;
  onValueChange: (value: number) => void;
  /** When set, rounds on blur to this precision (defaults to ERP calc 4dp for money). */
  fractionDigits?: number;
};

function formatMoneyForEdit(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value) || Number.isNaN(value)) return "";
  if (value === 0) return "";
  const rounded = roundToDecimalPlaces(value, fractionDigits);
  return String(rounded);
}

export function NumericInput({
  value,
  onValueChange,
  fractionDigits,
  onFocus,
  onBlur,
  ...props
}: NumericInputProps) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  if (fractionDigits == null) {
    return (
      <Input
        type="number"
        {...props}
        value={formatNumberInputValue(value)}
        onChange={(e) => {
          const parsed = parseNumberInputValue(e.target.value);
          onValueChange(parsed);
        }}
      />
    );
  }

  const displayValue = focused
    ? draft
    : formatNumberInputValue(value, fractionDigits);

  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      {...props}
      value={displayValue}
      onFocus={(e) => {
        setFocused(true);
        setDraft(formatMoneyForEdit(value, fractionDigits));
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        let parsed = parseNumberInputValue(draft);
        const trimmed = draft.trim();
        if (Number.isNaN(parsed) && /^\d+\.$/.test(trimmed)) {
          parsed = parseNumberInputValue(trimmed.slice(0, -1));
        }
        if (Number.isNaN(parsed)) {
          onValueChange(0);
        } else {
          onValueChange(roundCalc(roundToDecimalPlaces(parsed, fractionDigits)));
        }
        onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseNumberInputValue(raw);
        if (!Number.isNaN(parsed)) {
          onValueChange(parsed);
        }
      }}
    />
  );
}
