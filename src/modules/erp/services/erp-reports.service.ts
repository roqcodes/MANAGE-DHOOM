import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ReportChannel, ReportStockLevel } from "@/common/erp/report-types";
import { getReportBySlug } from "@/common/erp/report-types";
import { getFinancialDashboard } from "@/modules/erp/services/erp-finance-dashboard.service";

export type ReportQuery = {
  slug: string;
  dateFrom?: string;
  dateTo?: string;
  asOf?: string;
  storeId?: string;
  channel?: ReportChannel;
  accountId?: string;
  brandId?: string;
  categoryId?: string;
  stockLevel?: ReportStockLevel;
  fromStoreId?: string;
  toStoreId?: string;
  status?: string;
  search?: string;
  accountTypeId?: string;
  entityType?: string;
  action?: string;
  userId?: string;
  customerId?: string;
  vendorId?: string;
  ageMinDays?: number;
  ageMaxDays?: number;
};

function normalizeAgeRange(
  ageMinDays?: number,
  ageMaxDays?: number,
): { ageMin: number | null; ageMax: number | null } {
  if (ageMinDays == null && ageMaxDays == null) {
    return { ageMin: null, ageMax: null };
  }
  if (ageMinDays != null && ageMaxDays != null && ageMinDays > ageMaxDays) {
    return { ageMin: ageMaxDays, ageMax: ageMinDays };
  }
  return {
    ageMin: ageMinDays ?? null,
    ageMax: ageMaxDays ?? null,
  };
}

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(1);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

function normalizeJsonbReportRows(data: unknown): unknown {
  if (data == null) return [];
  if (typeof data === "string") {
    try {
      return normalizeJsonbReportRows(JSON.parse(data));
    } catch {
      return data;
    }
  }
  return data;
}

async function callRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rpc: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await (
    supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(rpc, args);
  if (error) {
    const hint =
      error.code === "PGRST202" || /Could not find the function/i.test(error.message)
        ? " Apply the latest Supabase migrations (receivables reports)."
        : "";
    throw new Error(`${error.message}${hint}`);
  }
  return normalizeJsonbReportRows(data);
}

export async function runErpReport(
  query: ReportQuery,
  options?: { authenticated?: boolean },
): Promise<unknown> {
  if (!options?.authenticated) {
    await requireAdminOrManagerProfile();
  }
  const supabase = await createSupabaseServerClient();
  const report = getReportBySlug(query.slug);
  if (!report) throw new Error("Unknown report");

  const { dateFrom, dateTo } = defaultDateRange();
  const from = query.dateFrom ?? dateFrom;
  const to = query.dateTo ?? dateTo;
  const asOf = query.asOf ?? to;
  const storeId = query.storeId ?? undefined;
  const channel = query.channel ?? "all";
  const { ageMin, ageMax } = normalizeAgeRange(query.ageMinDays, query.ageMaxDays);

  if (report.slug === "finance-summary") {
    if (storeId) {
      const { getStoreFinancialDashboard } = await import(
        "@/modules/erp/services/erp-finance-dashboard.service"
      );
      return getStoreFinancialDashboard(storeId, from, to);
    }
    return getFinancialDashboard();
  }

  if (report.slug === "balance-sheet") {
    return callRpc(supabase, "get_erp_trial_balance", { p_as_of: asOf, p_store_id: storeId });
  }

  if (report.slug === "general-ledger" && query.accountId) {
    return callRpc(supabase, "get_erp_general_ledger", {
      p_account_id: query.accountId,
      p_date_from: from,
      p_date_to: to,
      p_store_id: storeId,
    });
  }

  switch (report.rpc) {
    case "get_erp_trial_balance":
      return callRpc(supabase, report.rpc, { p_as_of: asOf, p_store_id: storeId });
    case "get_erp_general_ledger_summary":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
      });
    case "get_erp_account_transaction_report":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
        p_account_id: query.accountId ?? null,
        p_account_type_id: query.accountTypeId ?? null,
      });
    case "get_erp_profit_and_loss":
    case "get_erp_cash_flow_statement":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
      });
    case "get_erp_customer_balance_report":
      return callRpc(supabase, report.rpc, {
        p_store_id: storeId,
        p_search: query.search ?? null,
      });
    case "get_erp_vendor_balance_report":
      return callRpc(supabase, report.rpc, {
        p_store_id: storeId,
        p_search: query.search ?? null,
      });
    case "get_erp_item_stock_report":
      return callRpc(supabase, report.rpc, {
        p_store_id: storeId,
        p_brand_id: query.brandId ?? null,
        p_category_id: query.categoryId ?? null,
        p_stock_level: query.stockLevel ?? "all",
      });
    case "get_erp_minus_stock_report":
      return callRpc(supabase, report.rpc, {
        p_store_id: storeId,
        p_brand_id: query.brandId ?? null,
        p_category_id: query.categoryId ?? null,
      });
    case "get_erp_stock_transfer_report":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_from_store_id: query.fromStoreId ?? null,
        p_to_store_id: query.toStoreId ?? null,
        p_status: query.status ?? "all",
      });
    case "get_erp_customer_aging":
    case "get_erp_customer_aging_summary_counts":
      return callRpc(supabase, report.rpc, {
        p_as_of: asOf,
        p_store_id: storeId,
        p_search: query.search ?? null,
        p_age_min: ageMin,
        p_age_max: ageMax,
      });
    case "get_erp_customer_aging_summary_customer_details":
      if (!query.customerId) throw new Error("Customer is required");
      return callRpc(supabase, report.rpc, {
        p_customer_id: query.customerId,
        p_as_of: asOf,
        p_store_id: storeId,
      });
    case "get_erp_customer_aging_details":
      return callRpc(supabase, report.rpc, {
        p_as_of: asOf,
        p_store_id: storeId,
        p_date_from: null,
        p_date_to: null,
        p_search: query.search ?? null,
        p_age_min: ageMin,
        p_age_max: ageMax,
      });
    case "get_erp_vendor_aging":
    case "get_erp_vendor_aging_summary_counts":
      return callRpc(supabase, report.rpc, {
        p_as_of: asOf,
        p_store_id: storeId,
        p_search: query.search ?? null,
        p_age_min: ageMin,
        p_age_max: ageMax,
      });
    case "get_erp_vendor_aging_summary_vendor_details":
      if (!query.vendorId) throw new Error("Vendor is required");
      return callRpc(supabase, report.rpc, {
        p_vendor_id: query.vendorId,
        p_as_of: asOf,
        p_store_id: storeId,
      });
    case "get_erp_vendor_aging_details":
      return callRpc(supabase, report.rpc, {
        p_as_of: asOf,
        p_store_id: storeId,
        p_date_from: null,
        p_date_to: null,
        p_search: query.search ?? null,
        p_age_min: ageMin,
        p_age_max: ageMax,
      });
    case "get_erp_sales_by_customer":
    case "get_erp_sales_by_item":
    case "get_erp_sales_by_salesman":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
        p_channel: channel,
      });
    case "get_erp_daily_collection_report":
    case "get_erp_monthly_collection_report":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
      });
    case "get_erp_payments_received_report":
    case "get_erp_credit_note_report":
    case "get_erp_day_book":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
      });
    case "get_erp_store_wise_stock_report":
      return callRpc(supabase, report.rpc, {});
    case "get_erp_purchase_by_item_report":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
        p_brand_id: query.brandId ?? null,
        p_category_id: query.categoryId ?? null,
      });
    case "get_erp_purchase_by_vendor_report":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
      });
    case "get_erp_vat_return_summary_report":
    case "get_erp_vat_return_details_report":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
        p_search: query.search ?? null,
      });
    case "get_erp_activity_log_report":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
        p_entity_type: query.entityType ?? null,
        p_action: query.action ?? null,
        p_user_id: query.userId ?? null,
        p_search: query.search ?? null,
        p_limit: 500,
      });
    case "get_erp_deleted_invoices_report":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
        p_search: query.search ?? null,
        p_limit: 200,
      });
    default:
      throw new Error(`Report RPC not wired: ${report.rpc}`);
  }
}
