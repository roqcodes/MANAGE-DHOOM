import "server-only";

import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export type StockMovementType =
  | "receipt"
  | "sale"
  | "adjustment"
  | "transfer"
  | "damaged"
  | "return";

export interface StockMovement {
  id: string;
  variant_id: string;
  quantity: number;
  type: StockMovementType;
  reference_id: string | null;
  reference_type: string | null;
  reason: string | null;
  user_id: string | null;
  created_at: string;
  variant?: {
    id: string;
    name: string | null;
    product?: {
      id: string;
      name: string | null;
    } | null;
  } | null;
  user?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

export interface LogMovementInput {
  variantId: string;
  quantity: number;
  type: StockMovementType;
  referenceId?: string;
  referenceType?: string;
  reason?: string;
}

const PAGE_SIZE = 100;

/**
 * Log a stock movement.
 */
export async function logStockMovement(input: LogMovementInput): Promise<string> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("log_stock_movement", {
    p_variant_id: input.variantId,
    p_quantity: input.quantity,
    p_type: input.type,
    p_reference_id: input.referenceId || undefined,
    p_reference_type: input.referenceType || undefined,
    p_reason: input.reason || undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as string;
}

/**
 * @deprecated Use ERP stock adjustments.
 */
export async function adjustStock(
  _variantId: string,
  _quantityDelta: number,
  _reason: string,
): Promise<{
  movementId: string;
  newStock: number;
}> {
  throw new Error(
    "Direct stock adjustment is deprecated. Use ERP stock adjustments.",
  );
}

/**
 * @deprecated Use ERP stock adjustments.
 */
export async function markDamaged(
  _variantId: string,
  _quantity: number,
  _reason: string,
): Promise<{
  movementId: string;
  newStock: number;
}> {
  throw new Error(
    "Direct damaged stock write-off is deprecated. Use ERP stock adjustments.",
  );
}

/**
 * Get movements for a variant.
 */
export async function getMovementsForVariant(
  variantId: string,
  page = 0,
): Promise<{
  movements: StockMovement[];
  total: number;
  hasMore: boolean;
}> {
  await requireAdminOrManagerProfile();

  const supabase = await createSupabaseServerClient();
  const offset = page * PAGE_SIZE;

  const [movementsRes, countRes] = await Promise.all([
    supabase.rpc("get_movements_for_variant", {
      p_variant_id: variantId,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    }),
    supabase.rpc("get_movements_count", {
      p_variant_id: variantId,
    }),
  ]);

  if (movementsRes.error) {
    throw new Error(movementsRes.error.message);
  }

  if (countRes.error) {
    throw new Error(countRes.error.message);
  }

  const movements = (movementsRes.data as unknown as StockMovement[]) || [];
  const total = countRes.data as number;

  return {
    movements,
    total,
    hasMore: offset + movements.length < total,
  };
}

/**
 * Get all movements (admin view).
 */
export async function getAllMovements(
  page = 0,
  typeFilter?: StockMovementType,
): Promise<{
  movements: StockMovement[];
  total: number;
  hasMore: boolean;
}> {
  await requireAdminOrManagerProfile();

  const supabase = await createSupabaseServerClient();
  const offset = page * PAGE_SIZE;

  const movementsRes = await supabase.rpc("get_all_movements", {
    p_limit: PAGE_SIZE,
    p_offset: offset,
    p_type_filter: typeFilter || undefined,
  });

  if (movementsRes.error) {
    throw new Error(movementsRes.error.message);
  }

  const movements = (movementsRes.data as unknown as StockMovement[]) || [];

  // Get total count
  const countQuery = supabase
    .from("stock_movements")
    .select("id", { count: "exact", head: true });

  if (typeFilter) {
    countQuery.eq("type", typeFilter);
  }

  const { count: total } = await countQuery;

  return {
    movements,
    total: total || 0,
    hasMore: offset + movements.length < (total || 0),
  };
}

/**
 * Log stock movement for order (called during order creation).
 */
export async function logOrderSale(
  variantId: string,
  quantity: number,
  orderId: string,
): Promise<string> {
  return logStockMovement({
    variantId,
    quantity: -quantity, // negative = out
    type: "sale",
    referenceId: orderId,
    referenceType: "order",
  });
}

/**
 * Log stock receipt from vendor PO.
 */
export async function logPOReceipt(
  variantId: string,
  quantity: number,
  poId: string,
): Promise<string> {
  return logStockMovement({
    variantId,
    quantity, // positive = in
    type: "receipt",
    referenceId: poId,
    referenceType: "purchase_order",
  });
}
