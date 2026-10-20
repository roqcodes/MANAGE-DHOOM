import { format } from "date-fns";

import { rowsToCsv, downloadCsvFile } from "@/lib/csv/csv-utils";
import { saveTabularPdf } from "@/lib/export/tabular-pdf";

export type TabularData = {
  headers: string[];
  rows: string[][];
};

export type TabularExportFormat = "csv" | "xlsx" | "pdf";

export type TabularExportOptions = {
  baseFilename: string;
  title?: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
};

export type TabularExportSource = {
  baseFilename: string;
  title?: string;
  getSubtitle?: () => string;
  getTabular: () => TabularData | null;
};

function datedFilename(base: string, ext: string) {
  const stem = base.replace(/\.(csv|xlsx|pdf)$/i, "");
  return `${stem}-${format(new Date(), "yyyy-MM-dd")}.${ext}`;
}

function tabularToRowObjects(headers: string[], rows: string[][]): Record<string, unknown>[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    return obj;
  });
}

export function downloadTabularCsv(options: TabularExportOptions): void {
  const { headers, rows } = options;
  if (rows.length === 0) return;
  const csv = rowsToCsv(headers, tabularToRowObjects(headers, rows));
  downloadCsvFile(datedFilename(options.baseFilename, "csv"), csv);
}

export async function downloadTabularXlsx(options: TabularExportOptions): Promise<void> {
  const { headers, rows } = options;
  if (rows.length === 0) return;
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Export");
  XLSX.writeFile(workbook, datedFilename(options.baseFilename, "xlsx"));
}

export async function downloadTabularPdf(options: TabularExportOptions): Promise<void> {
  const { headers, rows } = options;
  if (rows.length === 0) return;
  const orientation = headers.length > 6 ? "landscape" : "portrait";
  await saveTabularPdf(datedFilename(options.baseFilename, "pdf"), options, orientation);
}

export async function exportTabular(
  format: TabularExportFormat,
  options: TabularExportOptions,
): Promise<void> {
  if (options.rows.length === 0) return;
  switch (format) {
    case "csv":
      downloadTabularCsv(options);
      break;
    case "xlsx":
      await downloadTabularXlsx(options);
      break;
    case "pdf":
      await downloadTabularPdf(options);
      break;
    default:
      break;
  }
}

export async function exportFromSource(
  format: TabularExportFormat,
  source: TabularExportSource,
): Promise<void> {
  const tabular = source.getTabular();
  if (!tabular || tabular.rows.length === 0) return;
  await exportTabular(format, {
    baseFilename: source.baseFilename,
    title: source.title,
    subtitle: source.getSubtitle?.(),
    headers: tabular.headers,
    rows: tabular.rows,
  });
}

export function describeErpListFilters(parts: {
  search?: string;
  status?: string;
  storeLabel?: string;
  dateFrom?: string;
  dateTo?: string;
  extra?: string[];
}): string {
  const lines: string[] = [];
  if (parts.dateFrom || parts.dateTo) {
    if (parts.dateFrom && parts.dateTo) {
      lines.push(`Period: ${parts.dateFrom} – ${parts.dateTo}`);
    } else if (parts.dateFrom) {
      lines.push(`From: ${parts.dateFrom}`);
    } else {
      lines.push(`Through: ${parts.dateTo}`);
    }
  }
  if (parts.storeLabel) lines.push(`Store: ${parts.storeLabel}`);
  if (parts.status && parts.status !== "all") lines.push(`Status: ${parts.status}`);
  if (parts.search?.trim()) lines.push(`Search: ${parts.search.trim()}`);
  if (parts.extra?.length) lines.push(...parts.extra);
  return lines.join(" · ") || "All records";
}
