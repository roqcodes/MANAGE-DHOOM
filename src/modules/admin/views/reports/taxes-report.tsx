"use client";

import { useMemo } from "react";

import type { ReportDefinition } from "@/common/erp/report-types";
import { BusinessReportLayout } from "./business-overview/business-report-layout";
import { ReportKpiStrip } from "./business-overview/report-kpi-strip";
import { buildReportExportSource, reportFiltersSubtitle } from "./business-overview/report-format";
import { useBusinessReportFilters } from "./business-overview/use-business-report-filters";
import { useErpReportFetch } from "./business-overview/use-erp-report-fetch";
import {
  buildNetVatKpis,
  buildVatDetailsKpis,
  buildVatSummaryKpis,
  NetVatDueSection,
  type VatDetailLine,
  type VatNetSummary,
  VatDetailsTable,
  VatReportTableSkeleton,
  VatSummaryStoreTable,
  type SummaryStoreRow,
} from "./taxes/vat-report-shared";

function useVatReportFetch(report: ReportDefinition, filters: ReturnType<typeof useBusinessReportFilters>) {
  const serverSearch = Boolean(
    report.filters.storeSearch || report.filters.customerSearch,
  );
  return useErpReportFetch(report, {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    asOf: filters.asOf,
    storeId: filters.storeId,
    channel: "all",
    accountId: "",
    search: serverSearch ? filters.debouncedSearch : undefined,
  });
}

function VatReturnSummaryReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const { loading, error, rawData, reload } = useVatReportFetch(report, filters);

  const data = (rawData ?? {}) as Record<string, unknown>;
  const salesRows = (data.sales_by_store ?? []) as SummaryStoreRow[];
  const purchaseRows = (data.purchases_by_store ?? []) as SummaryStoreRow[];
  const net = (data.net_vat ?? {}) as VatNetSummary;

  const isEmpty =
    !loading &&
    salesRows.length === 0 &&
    purchaseRows.length === 0 &&
    Number(net.due_tax ?? 0) === 0;

  const kpis = useMemo(
    () => buildVatSummaryKpis(salesRows, purchaseRows, net),
    [salesRows, purchaseRows, net],
  );

  const vatSummaryColumns = [
    { key: "section", label: "Section" },
    { key: "store_name", label: "Store" },
    { key: "taxable", label: "Taxable", format: "currency" },
    { key: "adjustment", label: "Adjustment", format: "currency" },
    { key: "tax_amount", label: "Tax", format: "currency" },
  ];

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: vatSummaryColumns,
    getRows: () => [
      ...salesRows.map((r) => ({
        section: "Sales",
        store_name: r.store_name,
        taxable: r.standard_rated_sales,
        adjustment: r.credit_adjustment,
        tax_amount: r.tax_amount,
      })),
      ...purchaseRows.map((r) => ({
        section: "Purchases",
        store_name: r.store_name,
        taxable: r.standard_rated_purchases,
        adjustment: r.vendor_credit_adjustment,
        tax_amount: r.tax_amount,
      })),
    ],
    getSubtitle: () => reportFiltersSubtitle(filters, "range"),
  });

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange
      searchPlaceholder="Search store name…"
      metrics={
        !loading && !isEmpty ? (
          <ReportKpiStrip items={kpis.length > 0 ? kpis : buildNetVatKpis(net)} />
        ) : null
      }
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <VatReportTableSkeleton columns={4} />
      ) : (
        <>
          <VatSummaryStoreTable
            title="VAT on sales and all other outputs"
            rows={salesRows}
            taxableKey="standard_rated_sales"
            adjustmentKey="credit_adjustment"
            adjustmentLabel="Adjustment (credit note)"
            totalLabel="Total sales"
          />
          <VatSummaryStoreTable
            title="VAT on bills, expenses and all other inputs"
            rows={purchaseRows}
            taxableKey="standard_rated_purchases"
            adjustmentKey="vendor_credit_adjustment"
            adjustmentLabel="Adjustment (vendor credit)"
            totalLabel="Total purchases"
          />
          <NetVatDueSection net={net} />
        </>
      )}
    </BusinessReportLayout>
  );
}

function VatReturnDetailsReport({ report }: { report: ReportDefinition }) {
  const filters = useBusinessReportFilters(report);
  const { loading, error, rawData, reload } = useVatReportFetch(report, filters);

  const data = (rawData ?? {}) as Record<string, unknown>;
  const outputLines = (data.output_lines ?? []) as VatDetailLine[];
  const inputLines = (data.input_lines ?? []) as VatDetailLine[];
  const net = (data.net_vat ?? {}) as VatNetSummary;

  const isEmpty =
    !loading && outputLines.length === 0 && inputLines.length === 0;

  const kpis = useMemo(
    () => buildVatDetailsKpis(outputLines, inputLines, net),
    [outputLines, inputLines, net],
  );

  const exportRows = useMemo(
    () => [
      ...outputLines.map((r) => ({ ...r, section: "Output" as const })),
      ...inputLines.map((r) => ({ ...r, section: "Input" as const })),
    ],
    [outputLines, inputLines],
  );

  const vatDetailColumns = [
    { key: "section", label: "Section" },
    { key: "party_name", label: "Party" },
    { key: "party_trn", label: "TRN" },
    { key: "transaction_date", label: "Date", format: "date" },
    { key: "transaction_number", label: "Transaction #" },
    { key: "transaction_type", label: "Type" },
    { key: "taxable_amount", label: "Taxable", format: "currency" },
    { key: "vat_amount", label: "VAT", format: "currency" },
    { key: "vat_percentage", label: "VAT %", format: "percent" },
  ];

  const exportSource = buildReportExportSource({
    slug: report.slug,
    title: report.title,
    columns: vatDetailColumns,
    getRows: () => exportRows as Record<string, unknown>[],
    getSubtitle: () => reportFiltersSubtitle(filters, "range"),
  });

  return (
    <BusinessReportLayout
      report={report}
      filters={filters}
      loading={loading}
      isEmpty={isEmpty}
      onRefresh={reload}
      exportSource={exportSource}
      showDateRange
      searchPlaceholder="Search customer, vendor, TRN, or transaction #…"
      metrics={!loading && !isEmpty ? <ReportKpiStrip items={kpis} /> : null}
    >
      {error ? <p className="px-4 py-3 text-sm text-destructive">{error}</p> : null}
      {loading ? (
        <VatReportTableSkeleton columns={8} />
      ) : (
        <>
          <VatDetailsTable
            title="VAT on sales and all other outputs"
            partyLabel="Customer"
            rows={outputLines}
          />
          <VatDetailsTable
            title="VAT on bills, expenses and all other inputs"
            partyLabel="Vendor"
            rows={inputLines}
          />
          <NetVatDueSection net={net} />
        </>
      )}
    </BusinessReportLayout>
  );
}

export function TaxesReport({ report }: { report: ReportDefinition }) {
  if (report.slug === "vat-return-details") {
    return <VatReturnDetailsReport report={report} />;
  }
  return <VatReturnSummaryReport report={report} />;
}
