import { format } from "date-fns";

import { extractReportRows, getReportBySlug } from "@/common/erp/report-types";
import { buildTabularPdfBlob, saveTabularPdf } from "@/lib/export/tabular-pdf";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import {
  formatReportPeriodRange,
  reportColumnsToTabular,
} from "@/modules/admin/views/reports/business-overview/report-format";
import { buildErpReportApiPath } from "@/modules/erp/lib/erp-report-api-path";

export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits;
}

function statementPdfFilename(customerName: string) {
  const slug = customerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `customer-statement-${slug || "export"}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
}

export async function fetchCustomerStatementReportRows(opts: {
  customerId: string;
  customerSearch: string;
  dateFrom: string;
  dateTo: string;
  storeId: string;
}): Promise<Record<string, unknown>[]> {
  const report = getReportBySlug("customer-statement");
  if (!report) throw new Error("Customer statement report is not configured.");

  const path = buildErpReportApiPath(report, {
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    asOf: opts.dateTo || opts.dateFrom,
    storeId: opts.storeId,
    channel: "all",
    accountId: "",
    search: opts.customerSearch.trim() || undefined,
  });

  const res = await adminGet<{ data: unknown }>(path);
  const raw = extractReportRows(res.data);
  return raw.filter((row) => String(row.customer_id ?? "") === opts.customerId);
}

export async function buildCustomerStatementPdf(opts: {
  customerId: string;
  customerName: string;
  customerSearch: string;
  dateFrom: string;
  dateTo: string;
  storeId: string;
  storeLabel?: string;
}): Promise<{ blob: Blob; filename: string; rowCount: number }> {
  const report = getReportBySlug("customer-statement");
  if (!report) throw new Error("Customer statement report is not configured.");

  const rows = await fetchCustomerStatementReportRows(opts);
  if (rows.length === 0) {
    throw new Error("No statement entries for this customer and period.");
  }

  const columns = report.columns.filter((c) => c.key !== "customer_name");
  const tabular = reportColumnsToTabular(columns, rows);
  const periodLabel = formatReportPeriodRange(opts.dateFrom, opts.dateTo);
  const subtitleParts = [periodLabel];
  if (opts.storeLabel?.trim()) subtitleParts.push(opts.storeLabel.trim());

  const pdfContent = {
    title: `Statement — ${opts.customerName}`,
    subtitle: subtitleParts.join(" · "),
    headers: tabular.headers,
    rows: tabular.rows,
  };

  const orientation = tabular.headers.length > 6 ? "landscape" : "portrait";
  const blob = await buildTabularPdfBlob(pdfContent, orientation);
  const filename = statementPdfFilename(opts.customerName);

  return { blob, filename, rowCount: rows.length };
}

export async function downloadCustomerStatementPdf(
  opts: Parameters<typeof buildCustomerStatementPdf>[0],
): Promise<void> {
  const report = getReportBySlug("customer-statement");
  if (!report) throw new Error("Customer statement report is not configured.");

  const rows = await fetchCustomerStatementReportRows(opts);
  if (rows.length === 0) {
    throw new Error("No statement entries for this customer and period.");
  }

  const columns = report.columns.filter((c) => c.key !== "customer_name");
  const tabular = reportColumnsToTabular(columns, rows);
  const periodLabel = formatReportPeriodRange(opts.dateFrom, opts.dateTo);
  const subtitleParts = [periodLabel];
  if (opts.storeLabel?.trim()) subtitleParts.push(opts.storeLabel.trim());

  const orientation = tabular.headers.length > 6 ? "landscape" : "portrait";
  await saveTabularPdf(statementPdfFilename(opts.customerName), {
    title: `Statement — ${opts.customerName}`,
    subtitle: subtitleParts.join(" · "),
    headers: tabular.headers,
    rows: tabular.rows,
  }, orientation);
}

export type CustomerStatementWhatsAppResult = "shared" | "downloaded_and_opened";

export async function shareCustomerStatementViaWhatsApp(opts: {
  customerName: string;
  phone: string;
  periodLabel: string;
  pdfBlob: Blob;
  filename: string;
}): Promise<CustomerStatementWhatsAppResult> {
  const waPhone = normalizeWhatsAppPhone(opts.phone);
  if (!waPhone) {
    throw new Error("Customer has no valid phone number for WhatsApp.");
  }

  const message = `Hello${opts.customerName ? ` ${opts.customerName}` : ""},\n\nPlease find your account statement for ${opts.periodLabel}.\n\nThank you.`;
  const file = new File([opts.pdfBlob], opts.filename, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const canShareFiles =
        typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({
          title: `Statement — ${opts.customerName}`,
          text: message,
          files: [file],
        });
        return "shared";
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
    }
  }

  const url = URL.createObjectURL(opts.pdfBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = opts.filename;
  anchor.click();
  URL.revokeObjectURL(url);

  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(
    `${message}\n\n(Statement PDF was downloaded to your device — please attach it in this chat.)`,
  )}`;
  window.open(waUrl, "_blank", "noopener,noreferrer");
  return "downloaded_and_opened";
}