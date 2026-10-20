"use client";

import { useEffect, useRef, useState } from "react";

import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type VerifyResponse = { salesman: { id: string; name: string } | null };

export type SalesmanPinFieldProps = {
  value: string;
  onChange: (pin: string) => void;
  onSalesmanChange: (salesman: { id: string; name: string } | null) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function SalesmanPinField({
  value,
  onChange,
  onSalesmanChange,
  disabled,
  id = "salesman-pin",
  className,
}: SalesmanPinFieldProps) {
  const [status, setStatus] = useState<"idle" | "verifying" | "valid" | "invalid">("idle");
  const [salesmanName, setSalesmanName] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const digits = value.replace(/\D/g, "").slice(0, 3);
    if (digits !== value) {
      onChange(digits);
      return;
    }

    if (digits.length !== 3) {
      setStatus(digits.length === 0 ? "idle" : "invalid");
      setSalesmanName(null);
      onSalesmanChange(null);
      return;
    }

    const seq = ++requestSeq.current;
    setStatus("verifying");
    const timer = window.setTimeout(() => {
      adminGet<VerifyResponse>(`erp/salesmen/verify-pin?pin=${encodeURIComponent(digits)}`)
        .then((res) => {
          if (seq !== requestSeq.current) return;
          if (res.salesman) {
            setStatus("valid");
            setSalesmanName(res.salesman.name);
            onSalesmanChange(res.salesman);
          } else {
            setStatus("invalid");
            setSalesmanName(null);
            onSalesmanChange(null);
          }
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setStatus("invalid");
          setSalesmanName(null);
          onSalesmanChange(null);
        });
    }, 200);

    return () => window.clearTimeout(timer);
  }, [value, onChange, onSalesmanChange]);

  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        Salesman PIN
      </label>
      <Input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        autoComplete="off"
        placeholder="3-digit PIN"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
        className={cn(
          "h-10",
          status === "valid" && "border-emerald-500",
          status === "invalid" && value.length === 3 && "border-destructive",
        )}
      />
      <p
        className={cn(
          "min-h-[1.25rem] text-[11px]",
          status === "valid" && "font-medium text-emerald-700 dark:text-emerald-400",
          status === "invalid" && value.length === 3 && "text-destructive",
          status === "verifying" && "text-muted-foreground",
          status === "idle" && "text-muted-foreground",
        )}
        aria-live="polite"
      >
        {status === "verifying"
          ? "Verifying…"
          : status === "valid" && salesmanName
            ? salesmanName
            : status === "invalid" && value.length === 3
              ? "No salesman for this PIN"
              : "Enter the salesman PIN"}
      </p>
    </div>
  );
}
