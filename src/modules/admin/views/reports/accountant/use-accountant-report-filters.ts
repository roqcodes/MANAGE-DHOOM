"use client";

import { useEffect, useState } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import type { AdminListFilter } from "@/modules/admin/ui";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { useBusinessReportFilters } from "../business-overview/use-business-report-filters";

export function useAccountantReportFilters(report: ReportDefinition) {
  const base = useBusinessReportFilters(report);
  const [accountId, setAccountId] = useState("all");
  const [accountTypeId, setAccountTypeId] = useState("all");
  const [accountOptions, setAccountOptions] = useState<{ value: string; label: string }[]>([]);
  const [accountTypeOptions, setAccountTypeOptions] = useState<{ value: string; label: string }[]>(
    [],
  );

  useEffect(() => {
    if (!report.filters.account && !report.filters.accountType) return;
    const q = new URLSearchParams({ page: "0", limit: "500" });
    if (base.storeId) q.set("storeId", base.storeId);
    adminGet<{ data: { id: string; code: string; name: string }[] }>(`erp/accounts?${q.toString()}`)
      .then((res) => {
        setAccountOptions(
          (res.data ?? []).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
        );
      })
      .catch(() => setAccountOptions([]));
    adminGet<{ data: { id: string; name: string; account_category: string }[] }>(
      "erp/accounts?view=types",
    )
      .then((res) => {
        setAccountTypeOptions(
          (res.data ?? []).map((t) => ({
            value: t.id,
            label: `${t.name} (${t.account_category})`,
          })),
        );
      })
      .catch(() => setAccountTypeOptions([]));
  }, [report.filters.account, report.filters.accountType, base.storeId]);

  const extraFilters: AdminListFilter[] = [];
  if (report.filters.account) {
    extraFilters.push({
      id: "account",
      label: "Account",
      value: accountId,
      options: [{ value: "all", label: "All accounts" }, ...accountOptions],
      onChange: setAccountId,
    });
  }
  if (report.filters.accountType) {
    extraFilters.push({
      id: "accountType",
      label: "Account type",
      value: accountTypeId,
      options: [{ value: "all", label: "All account types" }, ...accountTypeOptions],
      onChange: setAccountTypeId,
    });
  }

  return {
    ...base,
    listFilters: [...base.listFilters, ...extraFilters],
    accountId: accountId === "all" ? "" : accountId,
    accountTypeId: accountTypeId === "all" ? "" : accountTypeId,
  };
}
