"use client";

import type { ReportColumn } from "@/common/erp/report-types";
import { TableCell } from "@/components/ui/table";
import { AdminTableCell, AdminTableRow } from "@/modules/admin/ui";
import { cn } from "@/lib/utils";
import {
  columnAggregateMode,
  computeColumnAggregates,
  formatAggregateCell,
  hasAggregatableColumns,
} from "./report-summaries";

export function ReportTableTotalsRow({
  columns,
  rows,
  label = "Total",
  leadingSpacerCells = 0,
}: {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  label?: string;
  /** Extra empty cells before data columns (e.g. expand toggle column). */
  leadingSpacerCells?: number;
}) {
  if (rows.length === 0 || !hasAggregatableColumns(columns)) return null;

  const aggregates = computeColumnAggregates(columns, rows);

  return (
    <AdminTableRow className="bg-muted/50 font-semibold hover:bg-muted/50">
      {leadingSpacerCells > 0 ? (
        <TableCell colSpan={leadingSpacerCells} className="w-8 p-2 align-middle" />
      ) : null}
      {columns.map((col, idx) => (
        <AdminTableCell
          key={col.key}
          className={cn(col.align === "right" ? "text-right tabular-nums" : undefined)}
        >
          {idx === 0
            ? label
            : columnAggregateMode(col) !== "none" && aggregates[col.key]
              ? formatAggregateCell(col, aggregates[col.key])
              : "—"}
        </AdminTableCell>
      ))}
    </AdminTableRow>
  );
}
