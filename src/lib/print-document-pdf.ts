/** Raster the live print document (same CSS as Print) — no html2canvas restyle. */

import { jsPDF } from "jspdf";

const PRINT_PAGE_MARGIN_MM = 12;
const A4_WIDTH_MM = 210;
const CAPTURE_WIDTH_MM = A4_WIDTH_MM - PRINT_PAGE_MARGIN_MM * 2;

const PRINT_DOC_SELECTOR =
  "[data-print-document], [data-invoice-document], [data-estimate-document]";

export function isPrintDocumentElement(element: HTMLElement): boolean {
  return Boolean(
    element.hasAttribute("data-print-document") ||
      element.hasAttribute("data-invoice-document") ||
      element.hasAttribute("data-estimate-document") ||
      element.matches(PRINT_DOC_SELECTOR) ||
      element.querySelector(PRINT_DOC_SELECTOR),
  );
}

function jpegToA4Pdf(dataUrl: string): jsPDF {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - PRINT_PAGE_MARGIN_MM * 2;
  const contentH = pageH - PRINT_PAGE_MARGIN_MM * 2;
  const props = pdf.getImageProperties(dataUrl);
  const imgH = (props.height * contentW) / props.width;

  let yOffset = 0;
  let first = true;
  while (yOffset < imgH - 0.35) {
    if (!first) pdf.addPage();
    first = false;
    pdf.addImage(
      dataUrl,
      "JPEG",
      PRINT_PAGE_MARGIN_MM,
      PRINT_PAGE_MARGIN_MM - yOffset,
      contentW,
      imgH,
    );
    yOffset += contentH;
  }
  return pdf;
}

async function waitForPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function exportPrintDocumentAsPdfBlob(element: HTMLElement): Promise<Blob> {
  const html = document.documentElement;
  html.classList.add("bh-pdf-capture");
  element.classList.add("bh-pdf-capture-page");
  const host = element.closest("[data-direct-print-host]");
  if (host instanceof HTMLElement) {
    host.style.width = `${CAPTURE_WIDTH_MM}mm`;
  }

  const headerRestores: Array<{ el: HTMLElement; previous: string }> = [];

  try {
    await waitForPaint();
    element.querySelectorAll("th").forEach((th) => {
      if (!(th instanceof HTMLElement)) return;
      const computed = window.getComputedStyle(th).backgroundColor;
      if (!computed || computed === "transparent" || computed === "rgba(0, 0, 0, 0)") {
        return;
      }
      headerRestores.push({ el: th, previous: th.style.backgroundColor });
      th.style.backgroundColor = computed;
    });
    const { toJpeg } = await import("html-to-image");
    const dataUrl = await toJpeg(element, {
      quality: 0.98,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      skipAutoScale: true,
    });
    const pdf = jpegToA4Pdf(dataUrl);
    return pdf.output("blob");
  } finally {
    headerRestores.forEach(({ el, previous }) => {
      el.style.backgroundColor = previous;
    });
    html.classList.remove("bh-pdf-capture");
    element.classList.remove("bh-pdf-capture-page");
  }
}

export async function downloadPrintDocumentAsPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const blob = await exportPrintDocumentAsPdfBlob(element);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
