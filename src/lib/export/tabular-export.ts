import { format } from "date-fns";

import { rowsToCsv, downloadCsvFile } from "@/lib/csv/csv-utils";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";

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

function buildPdfTableElement(options: TabularExportOptions): HTMLDivElement {
  const { title, subtitle, headers, rows } = options;
  const root = document.createElement("div");
  root.setAttribute("data-tabular-export", "true");
  root.style.cssText =
    "font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; line-height: 1.4; color: #111827; background: #ffffff; padding: 20px;";

  if (title) {
    const h1 = document.createElement("h1");
    h1.textContent = title;
    h1.style.cssText = "margin: 0 0 6px; font-size: 18px; font-weight: 600;";
    root.appendChild(h1);
  }
  if (subtitle) {
    const meta = document.createElement("p");
    meta.textContent = subtitle;
    meta.style.cssText = "margin: 0 0 14px; font-size: 11px; color: #4b5563;";
    root.appendChild(meta);
  }

  const table = document.createElement("table");
  table.style.cssText = "border-collapse: collapse; width: 100%;";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    th.style.cssText =
      "border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; background: #f3f4f6; font-weight: 600;";
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      td.style.cssText = "border: 1px solid #e5e7eb; padding: 5px 8px; vertical-align: top;";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  root.appendChild(table);
  return root;
}

export async function downloadTabularPdf(options: TabularExportOptions): Promise<void> {
  const { headers, rows } = options;
  if (rows.length === 0) return;
  const element = buildPdfTableElement(options);
  const orientation = headers.length > 6 ? "landscape" : "portrait";
  element.setAttribute("data-tabular-orientation", orientation);
  element.style.position = "fixed";
  element.style.left = "0";
  element.style.top = "0";
  element.style.zIndex = "-1";
  element.style.pointerEvents = "none";
  document.body.appendChild(element);
  try {
    await downloadElementAsPdf(element, datedFilename(options.baseFilename, "pdf"), {
      orientation,
      margin: 10,
    });
  } finally {
    document.body.removeChild(element);
  }
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
