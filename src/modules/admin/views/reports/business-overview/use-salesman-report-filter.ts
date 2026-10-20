"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import type { AdminListFilter } from "@/modules/admin/ui";

type SalesmanOption = { id: string; name: string; is_active?: boolean };

export function useSalesmanReportFilter(report: ReportDefinition) {
  const enabled = Boolean(report.filters.salesman);
  const [salesmanId, setSalesmanId] = useState("");

  const { data } = useQuery({
    queryKey: ["admin", "erp-salesmen", "report-filter"],
    queryFn: () => adminGet<{ salesmen: SalesmanOption[] }>("erp/salesmen"),
    enabled,
    staleTime: 60_000,
  });

  const salesmen = useMemo(
    () =>
      (data?.salesmen ?? [])
        .filter((s) => s.is_active !== false)
        .map((s) => ({ id: s.id, name: s.name })),
    [data?.salesmen],
  );

  const salesmanFilter: AdminListFilter = {
    id: "salesman",
    label: "Salesman",
    value: salesmanId || "all",
    options: [{ value: "all", label: "All salesmen" }, ...salesmen.map((s) => ({ value: s.id, label: s.name }))],
    onChange: (v) => setSalesmanId(v === "all" ? "" : v),
  };

  return {
    enabled,
    salesmanId,
    setSalesmanId,
    salesmanFilter,
    listFilter: enabled ? salesmanFilter : null,
  };
}
