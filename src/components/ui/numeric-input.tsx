"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  formatNumberInputValue,
  parseNumberInputValue,
} from "@/lib/numeric-input";

export type NumericInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value: number;
  onValueChange: (value: number) => void;
};

export function NumericInput({ value, onValueChange, ...props }: NumericInputProps) {
  return (
    <Input
      type="number"
      {...props}
      value={formatNumberInputValue(value)}
      onChange={(e) => onValueChange(parseNumberInputValue(e.target.value))}
    />
  );
}
