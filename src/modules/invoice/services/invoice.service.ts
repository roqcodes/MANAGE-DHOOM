import "server-only";

import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export interface Invoice {
  id: string;
  order_id: string | null;
  user_id: string;
  invoice_number: string;
  gst_number: string | null;
  subtotal: number | null;
  gst_amount: number | null;
  total_amount: number | null;
  status: string;
  created_at: string;
  due_date: string | null;
  issued_at: string | null;
  pdf_url: string | null;
  items: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  variant_id: string | null;
  product_name: string;
  quantity: number | null;
  unit_price: number | null;
  base_price: number | null;
  gst_rate: number | null;
  gst_amount: number | null;
  total_amount: number | null;
  vendor_id: string | null;
}

export interface InvoiceSummary {
  id: string;
  order_id: string | null;
  invoice_number: string;
  subtotal: number | null;
  gst_amount: number | null;
  total_amount: number | null;
  status: string;
  created_at: string;
  due_date: string | null;
  issued_at: string | null;
}

const PAGE_SIZE = 50;

/**
 * Generate invoice for an order.
 */
export async function generateInvoice(
  orderId: string,
  gstNumber?: string,
): Promise<Invoice> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  // Verify order belongs to user
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    throw new Error(orderError.message);
  }

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.user_id !== user.id) {
    throw new Error("Order does not belong to user");
  }

  const { data, error } = await supabase.rpc("generate_invoice_for_order", {
    p_order_id: orderId,
    p_gst_number: gstNumber || undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as Invoice;
}

/**
 * Get invoice by ID.
 */
export async function getInvoiceById(invoiceId: string): Promise<Invoice | null> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_invoice_by_id", {
    p_invoice_id: invoiceId,
    p_user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as Invoice | null;
}

/**
 * Get invoices for current user.
 */
export async function getInvoices(
  page = 0,
): Promise<{
  invoices: InvoiceSummary[];
  total: number;
  hasMore: boolean;
}> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();
  const offset = page * PAGE_SIZE;

  const [invoicesRes, countRes] = await Promise.all([
    supabase.rpc("get_invoices_for_user", {
      p_user_id: user.id,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    }),
    supabase.rpc("get_invoices_count", {
      p_user_id: user.id,
    }),
  ]);

  if (invoicesRes.error) {
    throw new Error(invoicesRes.error.message);
  }

  if (countRes.error) {
    throw new Error(countRes.error.message);
  }

  const invoices = (invoicesRes.data as unknown as InvoiceSummary[]) || [];
  const total = countRes.data as number;

  return {
    invoices,
    total,
    hasMore: offset + invoices.length < total,
  };
}

/**
 * Get invoice by order ID.
 */
export async function getInvoiceByOrderId(
  orderId: string,
): Promise<Invoice | null> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("order_id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  // Get invoice items
  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", data.id);

  return {
    ...data,
    items: items || [],
  } as Invoice;
}
