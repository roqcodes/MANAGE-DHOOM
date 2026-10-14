"use client";

import { formatCurrencyAmount } from "@/lib/format-currency";
import { TableHead } from "@/components/ui/table";
import {
  AdminDataTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHeader,
  AdminTableRow,
} from "@/modules/admin/ui";

export function PaymentsReceivedSummary({ data }: { data: Record<string, unknown> }) {
  const rows = [
    ["Cash", data.cash],
    ["Card", data.card],
    ["Cheque", data.check],
    ["Bank remittance", data.bank_remittance],
    ["Bank transfer", data.bank_transfer],
  ] as const;

  return (
    <div className="border-t bg-muted/30">
      <p className="px-4 pt-3 text-xs font-medium text-muted-foreground">Payment summary</p>
      <AdminDataTable className="border-0 shadow-none">
        <AdminTableHeader>
          {rows.map(([label]) => (
            <TableHead key={label} className="text-xs font-medium">
              {label}
            </TableHead>
          ))}
        </AdminTableHeader>
        <AdminTableBody>
          <AdminTableRow>
            {rows.map(([label, value]) => (
              <AdminTableCell key={label} className="tabular-nums text-sm">
                {formatCurrencyAmount(Number(value ?? 0))}
              </AdminTableCell>
            ))}
          </AdminTableRow>
        </AdminTableBody>
      </AdminDataTable>
      <p className="px-4 pb-3 text-xs text-muted-foreground">
        {Number(data.count ?? 0)} payments · Bank charges{" "}
        {formatCurrencyAmount(Number(data.bank_charges ?? 0))} · Total{" "}
        {formatCurrencyAmount(Number(data.total ?? 0))}
      </p>
    </div>
  );
}
