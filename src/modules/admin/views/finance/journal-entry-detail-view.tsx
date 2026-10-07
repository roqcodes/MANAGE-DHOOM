"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import type { JournalEntryLineRow } from "@/common/erp/finance-types";
import { AdminDetailSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { AdminPageHeader, AdminPageLayout } from "@/modules/admin/ui";
import { ErpDocumentTabsLayout } from "@/modules/erp/components/erp-document-tabs-layout";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function JournalEntryDetailView({ journalId }: { journalId: string }) {
  const [header, setHeader] = useState<Record<string, unknown> | null>(null);
  const [lines, setLines] = useState<JournalEntryLineRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGet<{ header: Record<string, unknown>; lines: JournalEntryLineRow[] }>(
      `erp/journal-entries/${journalId}`,
    )
      .then((res) => {
        setHeader(res.header);
        setLines(res.lines);
      })
      .finally(() => setLoading(false));
  }, [journalId]);

  if (loading) {
    return (
      <AdminPageLayout>
        <AdminDetailSkeleton />
      </AdminPageLayout>
    );
  }
  if (!header) {
    return (
      <AdminPageLayout>
        <p className="p-6 text-sm text-destructive">Journal not found.</p>
      </AdminPageLayout>
    );
  }

  const store = header.stores as { name: string } | null;

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={String(header.journal_number)}
        description={`${String(header.transaction_date)} · ${String(header.status)}`}
        backHref="/admin/erp/journal-entries"
        breadcrumb={[
          { label: "Journal entries", href: "/admin/erp/journal-entries" },
          { label: String(header.journal_number) },
        ]}
      />

      <ErpDocumentTabsLayout
        detailsLabel="Journal details"
        entityId={journalId}
        auditEntityType="journal_entry"
        showJournals={false}
      >
      <Card>
        <CardHeader>
          <CardTitle>Journal details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Date</p>
            <p className="font-medium">{String(header.transaction_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Store</p>
            <p className="font-medium">{store?.name ?? "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground">Description</p>
            <p className="font-medium">{String(header.description || "—")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Source</p>
            <p className="font-medium">{String(header.source_entity_type ?? "manual")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="font-medium">{String(header.status)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <span className="font-mono text-xs">{line.account_code}</span>{" "}
                    {line.account_name}
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
          </Table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        View account ledger in{" "}
        <Link href="/admin/erp/reports/general-ledger" className="text-primary hover:underline">
          General Ledger report
        </Link>
        .
      </p>
      </ErpDocumentTabsLayout>
    </AdminPageLayout>
  );
}
