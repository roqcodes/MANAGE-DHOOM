"use client";

import { useEffect, useState } from "react";

import type { JournalEntryLineRow, SourceJournalGroup } from "@/common/erp/finance-types";
import { AdminPanelSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function JournalLinesPanel({
  sourceType,
  sourceId,
}: {
  sourceType: string;
  sourceId: string;
}) {
  const [groups, setGroups] = useState<SourceJournalGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminGet<{ groups: SourceJournalGroup[] }>(
      `erp/journals/by-source?entityType=${encodeURIComponent(sourceType)}&entityId=${encodeURIComponent(sourceId)}`,
    )
      .then((res) => setGroups(res.groups ?? []))
      .finally(() => setLoading(false));
  }, [sourceType, sourceId]);

  if (loading) {
    return <AdminPanelSkeleton rows={5} />;
  }

  if (groups.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">No journal entries posted.</p>;
  }

  if (groups.length === 1) {
    return <JournalLinesTable lines={groups[0].lines} />;
  }

  return (
    <div className="divide-y">
      {groups.map((group) => (
        <div key={group.journal_id}>
          <div className="border-b bg-muted/30 px-4 py-2 text-sm">
            <span className="font-semibold">{group.journal_number}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">{group.transaction_date}</span>
            {group.description ? (
              <>
                <span className="mx-2 text-muted-foreground">·</span>
                <span>{group.description}</span>
              </>
            ) : null}
          </div>
          <JournalLinesTable lines={group.lines} />
        </div>
      ))}
    </div>
  );
}

function JournalLinesTable({ lines }: { lines: JournalEntryLineRow[] }) {
  const totalDebit = lines.reduce((sum, line) => sum + line.debit_amount, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit_amount, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Account</TableHead>
          <TableHead>Details</TableHead>
          <TableHead className="text-right">Debit</TableHead>
          <TableHead className="text-right">Credit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id}>
            <TableCell>
              <span className="font-medium">{line.account_name}</span>
              <span className="ml-1 text-xs text-muted-foreground">{line.account_code}</span>
            </TableCell>
            <TableCell className="text-muted-foreground">{line.description || "—"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {line.debit_amount > 0 ? formatCurrencyAmount(line.debit_amount) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {line.credit_amount > 0 ? formatCurrencyAmount(line.credit_amount) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={2} className="font-medium">
            Total
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatCurrencyAmount(totalDebit)}
          </TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatCurrencyAmount(totalCredit)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
