const IN_TRANSIT = new Set(["by_sea", "by_air", "in_customs"]);

export type PurchaseOrderNextActionKind =
  | "ready_for_pickup"
  | "mark_received"
  | "generate_invoice"
  | "none";

export function resolvePurchaseOrderNextAction(status: string | null | undefined): {
  kind: PurchaseOrderNextActionKind;
  label: string;
} {
  const normalized = status ?? "pending";

  if (normalized === "pending" || normalized === "production") {
    return { kind: "ready_for_pickup", label: "Ready for pickup" };
  }

  if (IN_TRANSIT.has(normalized)) {
    return { kind: "mark_received", label: "Mark received" };
  }

  if (normalized === "received") {
    return { kind: "generate_invoice", label: "Generate invoice" };
  }

  return { kind: "none", label: "" };
}

export function purchaseOrderNextActionExportLabel(
  status: string | null | undefined,
): string {
  const { label } = resolvePurchaseOrderNextAction(status);
  return label || "—";
}

export function purchaseOrderNextActionButtonClass(
  kind: Exclude<PurchaseOrderNextActionKind, "none">,
): string {
  switch (kind) {
    case "ready_for_pickup":
      return "border-indigo-200/90 bg-indigo-50 text-indigo-800 shadow-none hover:bg-indigo-100 hover:text-indigo-900 dark:border-indigo-800/80 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-950/80";
    case "mark_received":
      return "border-emerald-200/90 bg-emerald-50 text-emerald-800 shadow-none hover:bg-emerald-100 hover:text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-950/80";
    case "generate_invoice":
      return "border-violet-200/90 bg-violet-50 text-violet-800 shadow-none hover:bg-violet-100 hover:text-violet-900 dark:border-violet-800/80 dark:bg-violet-950/50 dark:text-violet-200 dark:hover:bg-violet-950/80";
  }
}