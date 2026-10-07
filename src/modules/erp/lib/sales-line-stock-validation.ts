import type { LineProductContextMap } from "@/common/erp/line-product-context";
import type { SalesLineFormRow } from "@/common/erp/sales-types";

export type SalesStockValidationResult = {
  blocking: string | null;
  warning: string | null;
};

/** Client-side pre-check before issuing sales docs that deduct store stock. */
export function validateSalesLinesStoreStock(
  lines: SalesLineFormRow[],
  context: LineProductContextMap,
  allowNegativeStoreStock = false,
): string | null {
  return getSalesLinesStockFeedback(lines, context, allowNegativeStoreStock).blocking;
}

export function getSalesLinesStockFeedback(
  lines: SalesLineFormRow[],
  context: LineProductContextMap,
  allowNegativeStoreStock = false,
): SalesStockValidationResult {
  const byProduct = new Map<string, { name: string; qty: number }>();

  for (const line of lines) {
    if (!line.productId || line.quantity <= 0 || !line.productName.trim()) continue;
    const existing = byProduct.get(line.productId);
    if (existing) {
      existing.qty += line.quantity;
    } else {
      byProduct.set(line.productId, {
        name: line.productName.trim(),
        qty: line.quantity,
      });
    }
  }

  const warnings: string[] = [];

  for (const [productId, { name, qty }] of byProduct) {
    const onHand = context[productId]?.onHandStock ?? context[productId]?.availableStock ?? 0;
    if (qty > onHand) {
      if (allowNegativeStoreStock) {
        const after = onHand - qty;
        warnings.push(
          `${name}: on-hand ${formatQty(onHand)} → ${formatQty(after)} after issue`,
        );
      } else {
        return {
          blocking: `Insufficient stock for ${name} (available ${formatQty(onHand)}, requested ${formatQty(qty)})`,
          warning: null,
        };
      }
    }
  }

  const missingProduct = lines.find(
    (line) => line.productName.trim() && line.quantity > 0 && !line.productId,
  );
  if (missingProduct) {
    return {
      blocking: `Select a product from search for "${missingProduct.productName.trim()}" so stock can be validated.`,
      warning: null,
    };
  }

  return {
    blocking: null,
    warning: warnings.length > 0 ? warnings.join("; ") : null,
  };
}

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
