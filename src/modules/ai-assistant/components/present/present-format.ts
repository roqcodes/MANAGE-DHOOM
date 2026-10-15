import { formatCurrencyAmount } from "@/lib/format-currency";

export function formatPresentCell(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  }
  return String(value);
}

export function formatChartValue(
  value: number,
  format: "number" | "currency" = "number",
) {
  if (format === "currency") {
    return formatCurrencyAmount(value, { minimumFractionDigits: 0 });
  }
  return formatPresentCell(value);
}

export function entityInitials(title: string) {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
