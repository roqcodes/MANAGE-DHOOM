import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";

export interface ReceivableRow {
  invoice_id: string;
  invoice_number: string;
  customer_name: string | null;
  customer_email: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  outstanding_amount: number;
  status: string;
  due_date: string | null;
  created_at: string;
  days_overdue: number;
}

export interface ProfitMarginReport {
  period: string;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  marginPercent: number;
  ordersCount: number;
}

export interface FinanceSummary {
  totalRevenue: number;
  totalOutstanding: number;
  walletLiability: number;
  pendingPayments: number;
}

export async function getReceivables(
  status?: string,
): Promise<ReceivableRow[]> {
  await requireAdminApiProfile();

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      total_amount,
      status,
      due_date,
      created_at,
      amount_paid,
      balance_due,
      users (name, email)
    `,
    )
    .in("status", ["pending", "partial", "overdue"]);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const receivables: ReceivableRow[] = (data ?? []).map((inv) => {
    const user = Array.isArray(inv.users) ? inv.users[0] : inv.users;
    const total = inv.total_amount ?? 0;
    const paid = Number((inv as { amount_paid?: number }).amount_paid ?? 0);
    const outstanding = Number((inv as { balance_due?: number }).balance_due ?? total);
    const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.created_at);
    const now = new Date();
    const daysOverdue = dueDate < now ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    return {
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      customer_name: user?.name ?? null,
      customer_email: user?.email ?? null,
      total_amount: total,
      paid_amount: paid,
      outstanding_amount: outstanding,
      status: inv.status,
      due_date: inv.due_date,
      created_at: inv.created_at,
      days_overdue: daysOverdue,
    };
  });

  return receivables;
}

export async function getProfitMarginReport(
  startDate?: string,
  endDate?: string,
): Promise<ProfitMarginReport[]> {
  await requireAdminApiProfile();

  const supabase = await createSupabaseServerClient();

  // Get orders with items in date range
  let orderQuery = supabase
    .from("orders")
    .select(
      `
      id,
      total_amount,
      created_at,
      order_items (base_price, final_price)
    `,
    )
    .eq("status", "completed");

  if (startDate) {
    orderQuery = orderQuery.gte("created_at", startDate);
  }
  if (endDate) {
    orderQuery = orderQuery.lte("created_at", endDate);
  }

  const { data: orders, error } = await orderQuery;

  if (error) throw new Error(error.message);

  // Aggregate by period (group by month)
  const byPeriod = new Map<string, { revenue: number; cost: number; orders: number }>();

  for (const order of orders ?? []) {
    const period = new Date(order.created_at!).toISOString().slice(0, 7); // YYYY-MM
    const revenue = order.total_amount ?? 0;
    const cost = ((order as any).order_items ?? []).reduce(
      (sum: number, item: any) => sum + (item.base_price ?? 0) * (item.quantity ?? 1),
      0,
    );

    const existing = byPeriod.get(period) || { revenue: 0, cost: 0, orders: 0 };
    existing.revenue += revenue;
    existing.cost += cost;
    existing.orders += 1;
    byPeriod.set(period, existing);
  }

  const reports: ProfitMarginReport[] = [];
  for (const [period, data] of byPeriod.entries()) {
    const margin = data.revenue - data.cost;
    reports.push({
      period,
      totalRevenue: data.revenue,
      totalCost: data.cost,
      totalMargin: margin,
      marginPercent: data.revenue > 0 ? (margin / data.revenue) * 100 : 0,
      ordersCount: data.orders,
    });
  }

  return reports.sort((a, b) => b.period.localeCompare(a.period));
}

export async function getFinanceSummary(): Promise<FinanceSummary> {
  await requireAdminApiProfile();

  const supabase = await createSupabaseServerClient();

  const [
    { data: invoices },
    { data: walletData },
    { data: pendingOrders },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("total_amount, status")
      .in("status", ["pending", "partial"]),
    supabase.from("wallet").select("balance"),
    supabase
      .from("orders")
      .select("total_amount")
      .eq("payment_status", "pending"),
  ]);

  const totalOutstanding =
    invoices?.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0) ?? 0;

  const walletLiability =
    walletData?.reduce((sum, w) => sum + (w.balance ?? 0), 0) ?? 0;

  const pendingPayments =
    pendingOrders?.reduce((sum, o) => sum + (o.total_amount ?? 0), 0) ?? 0;

  // Total revenue from completed orders
  const { data: completedOrders } = await supabase
    .from("orders")
    .select("total_amount")
    .eq("status", "completed");

  const totalRevenue =
    completedOrders?.reduce((sum, o) => sum + (o.total_amount ?? 0), 0) ?? 0;

  return {
    totalRevenue,
    totalOutstanding,
    walletLiability,
    pendingPayments,
  };
}

export async function getTransactionSummary(
  days = 30,
): Promise<{ totalIn: number; totalOut: number; net: number; count: number }> {
  await requireAdminApiProfile();

  const supabase = await createSupabaseServerClient();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("amount, type")
    .gte("created_at", since.toISOString());

  if (error) throw new Error(error.message);

  let totalIn = 0;
  let totalOut = 0;

  for (const tx of transactions ?? []) {
    const amount = tx.amount ?? 0;
    if (tx.type === "credit" || tx.type === "top_up") {
      totalIn += amount;
    } else {
      totalOut += amount;
    }
  }

  return {
    totalIn,
    totalOut,
    net: totalIn - totalOut,
    count: transactions?.length ?? 0,
  };
}
