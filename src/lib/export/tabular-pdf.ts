import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  BRAND_SHORT_NAME,
  COMPANY_NAME,
  MANAGE_APP_NAME,
} from "@/modules/brand/lib/brand";

const BRAND_LOGO_PATH = "/DHOOM-LOGO.png";

export type TabularPdfContent = {
  title?: string;
  subtitle?: string;
  headers: string[];
  rows: string[][];
};

const BRAND_ACCENT_RGB: [number, number, number] = [235, 32, 95];
const TEXT_PRIMARY: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];
const TEXT_FAINT: [number, number, number] = [107, 114, 128];

async function loadBrandLogoDataUrl(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(`${window.location.origin}${BRAND_LOGO_PATH}`);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === "string" ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function filterLinesFromSubtitle(subtitle?: string): string[] {
  if (!subtitle?.trim()) return [];
  const trimmed = subtitle.trim();
  if (trimmed.includes(" · ")) {
    return trimmed.split(" · ").map((part) => part.trim()).filter(Boolean);
  }
  return [trimmed];
}

function drawMutedLabel(doc: jsPDF, label: string, x: number, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_FAINT);
  doc.text(label.toUpperCase(), x, y);
}

function drawBrandedReportHeader(
  doc: jsPDF,
  options: TabularPdfContent,
  logoDataUrl: string | null,
): number {
  const margin = 10;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const logoHeightMm = 12;
  const logoX = margin;
  let textX = margin;

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", logoX, y - 1, logoHeightMm, logoHeightMm);
      textX = logoX + logoHeightMm + 4;
    } catch {
      textX = margin;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TEXT_PRIMARY);
  const brandY = y + 4;
  doc.text(BRAND_SHORT_NAME, textX, brandY);
  const shortWidth = doc.getTextWidth(`${BRAND_SHORT_NAME} `);
  doc.setTextColor(...BRAND_ACCENT_RGB);
  doc.text("TRADING", textX + doc.getTextWidth(BRAND_SHORT_NAME), brandY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`${MANAGE_APP_NAME} · ${COMPANY_NAME}`, textX, brandY + 4.5);

  y += logoDataUrl ? logoHeightMm + 3 : 12;

  doc.setDrawColor(...BRAND_ACCENT_RGB);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  if (options.title) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...TEXT_PRIMARY);
    const titleLines = doc.splitTextToSize(options.title, contentWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 6.5 + 2;
  }

  const filters = filterLinesFromSubtitle(options.subtitle);
  if (filters.length > 0) {
    drawMutedLabel(doc, "Selected filters", margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_MUTED);
    for (const line of filters) {
      const wrapped = doc.splitTextToSize(line, contentWidth - 2);
      doc.text(wrapped, margin + 1, y);
      y += wrapped.length * 4.2 + 1;
    }
    y += 2;
  }

  const exportedAt = format(new Date(), "d MMM yyyy, h:mm a");
  drawMutedLabel(doc, "Exported", margin, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(exportedAt, margin + 1, y);
  y += 8;

  return y;
}

/** Vector PDF for tabular exports — avoids html2canvas/Tailwind capture issues. */
export async function saveTabularPdf(
  filename: string,
  options: TabularPdfContent,
  orientation: "portrait" | "landscape",
): Promise<void> {
  const { headers, rows } = options;
  const logoDataUrl = await loadBrandLogoDataUrl();

  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation,
  });

  const margin = 10;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  const startY = drawBrandedReportHeader(doc, options, logoDataUrl);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY,
    margin: { top: margin, right: margin, bottom: 14, left: margin },
    tableWidth: contentWidth,
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
      overflow: "linebreak",
      cellWidth: "wrap",
      textColor: TEXT_PRIMARY,
      lineColor: [229, 231, 235],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [243, 244, 246],
      textColor: TEXT_PRIMARY,
      fontStyle: "bold",
      lineColor: [209, 213, 219],
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const page = data.pageNumber;
      const pageHeight = doc.internal.pageSize.getHeight();

      if (page === 1) {
        doc.setDrawColor(...BRAND_ACCENT_RGB);
        doc.setLineWidth(0.25);
        doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_FAINT);
      doc.text(COMPANY_NAME, margin, pageHeight - 6);
      doc.text(
        `Page ${page} of ${pageCount}`,
        pageWidth - margin,
        pageHeight - 6,
        { align: "right" },
      );
    },
  });

  doc.save(filename);
}
