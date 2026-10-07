import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ReportChannel } from "@/common/erp/report-types";
import { getReportBySlug } from "@/common/erp/report-types";
import { listAuditLogs } from "@/modules/erp/services/audit-log.service";
import { getFinancialDashboard } from "@/modules/erp/services/erp-finance-dashboard.service";

export type ReportQuery = {
  slug: string;
  dateFrom?: string;
  dateTo?: string;
  asOf?: string;
  storeId?: string;
  channel?: ReportChannel;
  accountId?: string;
};

function defaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(1);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
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
  if (error) throw new Error(error.message);
  return data;
}

export async function runErpReport(query: ReportQuery): Promise<unknown> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const report = getReportBySlug(query.slug);
  if (!report) throw new Error("Unknown report");

  const { dateFrom, dateTo } = defaultDateRange();
  const from = query.dateFrom ?? dateFrom;
  const to = query.dateTo ?? dateTo;
  const asOf = query.asOf ?? to;
  const storeId = query.storeId ?? undefined;
  const channel = query.channel ?? "all";

  if (report.slug === "finance-summary") {
    return getFinancialDashboard();
  }

  if (report.slug === "activity-logs") {
    const result = await listAuditLogs({
      dateFrom: from,
      dateTo: to,
      storeId,
      page: 0,
      limit: 200,
    });
    return result.data;
  }

  switch (report.rpc) {
    case "get_erp_trial_balance":
      return callRpc(supabase, report.rpc, { p_as_of: asOf, p_store_id: storeId });
    case "get_erp_general_ledger":
      if (!query.accountId) throw new Error("Account is required for general ledger");
      return callRpc(supabase, report.rpc, {
        p_account_id: query.accountId,
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
      });
    case "get_erp_profit_and_loss":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
      });
    case "get_erp_customer_balance_report":
    case "get_erp_vendor_balance_report":
    case "get_erp_item_stock_report":
      return callRpc(supabase, report.rpc, { p_store_id: storeId });
    case "get_erp_customer_aging":
    case "get_erp_vendor_aging":
      return callRpc(supabase, report.rpc, { p_as_of: asOf, p_store_id: storeId });
    case "get_erp_sales_by_customer":
    case "get_erp_sales_by_item":
      return callRpc(supabase, report.rpc, {
        p_date_from: from,
        p_date_to: to,
        p_store_id: storeId,
        p_channel: channel,
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
    default:
      throw new Error(`Report RPC not wired: ${report.rpc}`);
  }
}
