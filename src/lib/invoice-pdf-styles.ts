/** Solid fills — html2canvas often fails on `background: var(...)` in table cells. */
export const INVOICE_PDF_HEAD_FILL = "#f2f2f2";

/** Injected into html2pdf clone — layout must not rely on Tailwind after stylesheet strip. */
export const INVOICE_PDF_CAPTURE_CSS = `
[data-print-document] {
  box-sizing: border-box;
  width: 794px !important;
  max-width: 794px !important;
  min-width: 0 !important;
  margin: 0 auto !important;
  padding: 40px 32px !important;
  background: #ffffff !important;
  color: #000000 !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  font-family: "Segoe UI", Tahoma, Arial, sans-serif !important;
  font-size: 12px !important;
  line-height: 1.4 !important;
  --bh-inv-stroke: #141414;
  --bh-inv-stroke-strong: 1.25px solid #141414;
  --bh-inv-stroke-cell: 0.75px solid #141414;
  --bh-inv-stroke-head: 1.5px solid #141414;
  --bh-inv-head-fill: #f2f2f2;
  --bh-inv-radius: 5px;
  --bh-inv-radius-inset: 3px;
  --bh-inv-section-gap: 16px;
}
[data-print-document] table {
  display: table !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
}
[data-print-document] thead {
  display: table-header-group !important;
}
[data-print-document] tbody {
  display: table-row-group !important;
}
[data-print-document] tr {
  display: table-row !important;
}
[data-print-document] th,
[data-print-document] td {
  display: table-cell !important;
}
[data-print-document] col {
  display: table-column !important;
}
[data-print-document] .bh-inv-meta-table th,
[data-print-document] .bh-inv-party thead th,
[data-print-document] .bh-inv-items thead th,
[data-print-document] .bh-inv-totals thead th {
  background-color: #f2f2f2 !important;
  background-image: none !important;
}
[data-print-document] .bh-inv-meta-table thead tr,
[data-print-document] .bh-inv-party thead tr,
[data-print-document] .bh-inv-items thead tr,
[data-print-document] .bh-inv-totals thead tr {
  background-color: #f2f2f2 !important;
}
[data-print-document] .bh-inv-meta-table th .bh-bi,
[data-print-document] .bh-inv-party thead th .bh-bi,
[data-print-document] .bh-inv-items thead th .bh-bi,
[data-print-document] .bh-inv-totals thead th .bh-bi,
[data-print-document] .bh-inv-totals thead th .bh-inv-party-en,
[data-print-document] .bh-inv-totals thead th .bh-inv-party-ar,
[data-print-document] .bh-inv-party thead th .bh-inv-party-en,
[data-print-document] .bh-inv-party thead th .bh-inv-party-ar {
  background-color: transparent !important;
  background-image: none !important;
}
[data-print-document] .bh-inv-top,
[data-print-document] .bh-inv-parties {
  border-collapse: collapse !important;
}
[data-print-document] .bh-inv-meta-table,
[data-print-document] .bh-inv-party,
[data-print-document] .bh-inv-items,
[data-print-document] .bh-inv-totals {
  border-collapse: separate !important;
  border-spacing: 0 !important;
  overflow: hidden !important;
}
[data-print-document] .bh-inv-meta-table tr:first-child > :first-child,
[data-print-document] .bh-inv-party thead tr:first-child > :first-child,
[data-print-document] .bh-inv-items thead tr:first-child > :first-child,
[data-print-document] .bh-inv-totals thead tr:first-child > :first-child {
  border-top-left-radius: var(--bh-inv-radius-inset) !important;
}
[data-print-document] .bh-inv-meta-table tr:first-child > :last-child,
[data-print-document] .bh-inv-party thead tr:first-child > :last-child,
[data-print-document] .bh-inv-items thead tr:first-child > :last-child,
[data-print-document] .bh-inv-totals thead tr:first-child > :last-child {
  border-top-right-radius: var(--bh-inv-radius-inset) !important;
}
[data-print-document] .bh-inv-meta-table tr:last-child > :first-child,
[data-print-document] .bh-inv-party tbody tr:last-child > :first-child,
[data-print-document] .bh-inv-items tbody tr:last-child > :first-child,
[data-print-document] .bh-inv-totals tbody tr:last-child > :first-child {
  border-bottom-left-radius: var(--bh-inv-radius-inset) !important;
}
[data-print-document] .bh-inv-meta-table tr:last-child > :last-child,
[data-print-document] .bh-inv-party tbody tr:last-child > :last-child,
[data-print-document] .bh-inv-items tbody tr:last-child > :last-child,
[data-print-document] .bh-inv-totals tbody tr:last-child > :last-child {
  border-bottom-right-radius: var(--bh-inv-radius-inset) !important;
}
[data-print-document] .bh-inv-masthead-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 16px !important;
}
[data-print-document] .bh-inv-brand-block {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  gap: 2px !important;
  flex-shrink: 0 !important;
}
[data-print-document] img.bh-inv-logo,
[data-print-document] .bh-inv-logo {
  display: block !important;
  height: 28px !important;
  width: auto !important;
  max-width: 32px !important;
  max-height: 28px !important;
  object-fit: contain !important;
}
[data-print-document] .bh-inv-logo--store {
  max-width: 80px !important;
  filter: grayscale(100%) !important;
}
[data-print-document] .bh-inv-masthead {
  padding-bottom: 10px !important;
  border-bottom: var(--bh-inv-stroke-head) !important;
  margin-bottom: var(--bh-inv-section-gap) !important;
}
[data-print-document] .bh-inv-brand {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 8px !important;
}
[data-print-document] .bh-inv-wordmark-name {
  margin: 0 !important;
  font-size: 14px !important;
  font-weight: 800 !important;
  letter-spacing: 0.04em !important;
  line-height: 1.05 !important;
}
[data-print-document] .bh-inv-wordmark-sub {
  margin: 2px 0 0 !important;
  font-size: 8px !important;
  font-weight: 700 !important;
  letter-spacing: 0.22em !important;
}
[data-print-document] .bh-inv-wordmark-vat {
  margin: 0 !important;
  padding-left: 36px !important;
  font-size: 8px !important;
  font-weight: 600 !important;
}
[data-print-document] .bh-inv-doc-title {
  text-align: right !important;
  flex-shrink: 0 !important;
  --bh-inv-title-size: 15px;
}
[data-print-document] .bh-inv-title-ar {
  margin: 0 !important;
  font-size: var(--bh-inv-title-size) !important;
  font-weight: 800 !important;
  line-height: 1.2 !important;
}
[data-print-document] .bh-inv-title-en {
  margin: 2px 0 0 !important;
  font-size: var(--bh-inv-title-size) !important;
  font-weight: 800 !important;
  letter-spacing: 0.08em !important;
  line-height: 1.2 !important;
}
[data-print-document] .bh-inv-top {
  width: 100% !important;
  margin-bottom: var(--bh-inv-section-gap) !important;
  table-layout: fixed !important;
}
[data-print-document] .bh-inv-top-qr-col { width: 100px !important; }
[data-print-document] .bh-inv-top td { vertical-align: top !important; padding: 0 !important; }
[data-print-document] .bh-inv-meta-wrap { width: 100% !important; padding-right: 12px !important; }
[data-print-document] .bh-inv-qr-wrap {
  width: 100px !important;
  text-align: right !important;
  vertical-align: top !important;
}
[data-print-document] .bh-inv-qr {
  display: inline-block !important;
  width: 88px !important;
  height: 88px !important;
  border: var(--bh-inv-stroke-strong) !important;
  border-radius: 5px !important;
  padding: 3px !important;
  background: #fff !important;
  box-sizing: border-box !important;
}
[data-print-document] .bh-inv-meta-table {
  width: 100% !important;
  max-width: none !important;
  border: var(--bh-inv-stroke-strong) !important;
  border-radius: 5px !important;
}
[data-print-document] .bh-inv-meta-table th,
[data-print-document] .bh-inv-meta-table td {
  border: none !important;
  border-right: var(--bh-inv-stroke-cell) !important;
  border-bottom: var(--bh-inv-stroke-cell) !important;
  padding: 5px 8px !important;
  font-size: 11px !important;
  vertical-align: middle !important;
}
[data-print-document] .bh-inv-meta-table td {
  text-align: right !important;
  font-variant-numeric: tabular-nums !important;
  white-space: nowrap !important;
}
[data-print-document] .bh-inv-meta-table th:last-child,
[data-print-document] .bh-inv-meta-table td:last-child {
  border-right: none !important;
}
[data-print-document] .bh-inv-meta-table tr:last-child th,
[data-print-document] .bh-inv-meta-table tr:last-child td {
  border-bottom: none !important;
}
[data-print-document] .bh-inv-meta-table th {
  width: 52% !important;
  text-align: left !important;
  font-weight: 700 !important;
  background-color: #f2f2f2 !important;
  background-image: none !important;
}
[data-print-document] .bh-bi {
  display: flex !important;
  justify-content: space-between !important;
  align-items: baseline !important;
  gap: 8px !important;
  width: 100% !important;
}
[data-print-document] .bh-bi-en { font-size: 10px !important; font-weight: 700 !important; }
[data-print-document] .bh-bi-ar { font-size: 10px !important; font-weight: 600 !important; }
[data-print-document] .bh-inv-parties {
  width: 100% !important;
  border-collapse: collapse !important;
  margin: 0 0 var(--bh-inv-section-gap) !important;
}
[data-print-document] .bh-inv-parties > tbody > tr > td {
  width: 50% !important;
  vertical-align: top !important;
  padding: 0 !important;
}
[data-print-document] .bh-inv-parties > tbody > tr > td + td { padding-left: 8px !important; }
[data-print-document] .bh-inv-party {
  width: 100% !important;
  border: var(--bh-inv-stroke-strong) !important;
  border-radius: 5px !important;
}
[data-print-document] .bh-inv-party th,
[data-print-document] .bh-inv-party td {
  border: none !important;
  border-right: var(--bh-inv-stroke-cell) !important;
  border-bottom: var(--bh-inv-stroke-cell) !important;
  padding: 4px 7px !important;
  font-size: 10px !important;
  vertical-align: top !important;
}
[data-print-document] .bh-inv-party th:last-child,
[data-print-document] .bh-inv-party td:last-child {
  border-right: none !important;
}
[data-print-document] .bh-inv-party tbody tr:last-child th,
[data-print-document] .bh-inv-party tbody tr:last-child td {
  border-bottom: none !important;
}
[data-print-document] .bh-inv-party thead th {
  background-color: #f2f2f2 !important;
  background-image: none !important;
  color: #000 !important;
  font-weight: 800 !important;
  font-size: 11px !important;
  padding: 7px 8px !important;
  overflow: hidden !important;
}
[data-print-document] .bh-inv-party thead th::after,
[data-print-document] .bh-inv-totals thead th::after {
  content: "" !important;
  display: table !important;
  clear: both !important;
}
[data-print-document] .bh-inv-party thead tr:last-child th {
  border-bottom: var(--bh-inv-stroke-head) !important;
}
[data-print-document] .bh-inv-party-en { float: left !important; }
[data-print-document] .bh-inv-party-ar { float: right !important; }
[data-print-document] .bh-inv-party tbody th {
  width: 38% !important;
  font-weight: 600 !important;
  background: #fff !important;
  color: #000 !important;
}
[data-print-document] .bh-inv-items {
  width: 100% !important;
  table-layout: fixed !important;
  margin: 0 0 var(--bh-inv-section-gap) !important;
  border: var(--bh-inv-stroke-strong) !important;
  border-radius: 5px !important;
}
[data-print-document] .bh-inv-items th,
[data-print-document] .bh-inv-items td {
  border: none !important;
  border-right: var(--bh-inv-stroke-cell) !important;
  border-bottom: var(--bh-inv-stroke-cell) !important;
  padding: 5px 4px !important;
  vertical-align: top !important;
  font-size: 10px !important;
  color: #000 !important;
  word-wrap: break-word !important;
}
[data-print-document] .bh-inv-items th:last-child,
[data-print-document] .bh-inv-items td:last-child {
  border-right: none !important;
}
[data-print-document] .bh-inv-items tbody tr:last-child td {
  border-bottom: none !important;
}
[data-print-document] .bh-inv-items thead th {
  background-color: #f2f2f2 !important;
  background-image: none !important;
  color: #000 !important;
  font-weight: 800 !important;
  border-bottom: var(--bh-inv-stroke-head) !important;
}
[data-print-document] .bh-inv-items th .bh-bi-en,
[data-print-document] .bh-inv-items th .bh-bi-ar {
  color: #000 !important;
  font-size: 8px !important;
  font-weight: 800 !important;
}
[data-print-document] .bh-inv-items th .bh-bi {
  flex-direction: column !important;
  align-items: stretch !important;
  gap: 2px !important;
}
[data-print-document] .bh-inv-items th.bh-inv-num .bh-bi {
  align-items: flex-end !important;
}
[data-print-document] .bh-inv-num { text-align: right !important; font-variant-numeric: tabular-nums !important; }
[data-print-document] .bh-inv-item-name { display: block !important; font-weight: 700 !important; }
[data-print-document] .bh-inv-item-desc {
  display: block !important;
  font-size: 9px !important;
  margin-top: 1px !important;
}
[data-print-document] .bh-inv-totals {
  width: 100% !important;
  border: var(--bh-inv-stroke-strong) !important;
  border-radius: 5px !important;
  margin: 0 0 var(--bh-inv-section-gap) !important;
}
[data-print-document] .bh-inv-totals th,
[data-print-document] .bh-inv-totals td {
  border: none !important;
  border-right: var(--bh-inv-stroke-cell) !important;
  border-bottom: var(--bh-inv-stroke-cell) !important;
  padding: 5px 8px !important;
  font-size: 11px !important;
  color: #000 !important;
}
[data-print-document] .bh-inv-totals th:last-child,
[data-print-document] .bh-inv-totals td:last-child {
  border-right: none !important;
}
[data-print-document] .bh-inv-totals tbody tr:last-child th,
[data-print-document] .bh-inv-totals tbody tr:last-child td {
  border-bottom: none !important;
}
[data-print-document] .bh-inv-totals thead th {
  background-color: #f2f2f2 !important;
  background-image: none !important;
  color: #000 !important;
  font-weight: 800 !important;
  font-size: 11px !important;
  border-bottom: var(--bh-inv-stroke-head) !important;
}
[data-print-document] .bh-inv-totals tbody th {
  font-weight: 600 !important;
  text-align: left !important;
  width: 72% !important;
}
[data-print-document] .bh-inv-grand th,
[data-print-document] .bh-inv-grand td { font-weight: 800 !important; }
[data-print-document] .bh-inv-notes {
  margin: 0 0 var(--bh-inv-section-gap) !important;
  padding: 8px 10px !important;
  border: var(--bh-inv-stroke-strong) !important;
  border-radius: 5px !important;
  font-size: 10px !important;
  background: #fff !important;
}
[data-print-document] .bh-inv-notes-title {
  margin: 0 0 4px !important;
  font-size: 9px !important;
  font-weight: 800 !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
}
[data-print-document] .bh-inv-notes-body { margin: 0 !important; white-space: pre-wrap !important; }
[data-print-document] .bh-inv-closing {
  margin-top: 8px !important;
  font-size: 11px !important;
  line-height: 1.55 !important;
  color: #000 !important;
}
[data-print-document] svg.bh-inv-qr {
  display: inline-block !important;
  vertical-align: top !important;
}
[data-print-document] .bh-inv-balance-box {
  margin: 0 0 var(--bh-inv-section-gap) !important;
  padding: 8px 10px !important;
  border: var(--bh-inv-stroke-strong) !important;
  border-radius: var(--bh-inv-radius) !important;
  font-size: 11px !important;
  line-height: 1.45 !important;
}
[data-print-document] .bh-inv-thanks {
  margin: 12px 0 0 !important;
  text-align: center !important;
  font-weight: 800 !important;
  font-size: 11px !important;
}
`;

export function injectInvoicePdfStyles(clonedDoc: Document): void {
  const style = clonedDoc.createElement("style");
  style.textContent = INVOICE_PDF_CAPTURE_CSS;
  clonedDoc.head.appendChild(style);
}

/** Injected into html2pdf clone for report/table exports after stylesheet strip. */
export const TABULAR_PDF_CAPTURE_CSS = `
[data-tabular-export] {
  box-sizing: border-box !important;
  background: #ffffff !important;
  color: #111827 !important;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
  font-size: 11px !important;
  line-height: 1.4 !important;
  position: relative !important;
  left: 0 !important;
  top: 0 !important;
  z-index: auto !important;
  margin: 0 !important;
}
[data-tabular-export] h1 {
  margin: 0 0 6px !important;
  font-size: 18px !important;
  font-weight: 600 !important;
}
[data-tabular-export] p {
  margin: 0 0 14px !important;
  font-size: 11px !important;
  color: #4b5563 !important;
}
[data-tabular-export] table {
  border-collapse: collapse !important;
  width: 100% !important;
  display: table !important;
}
[data-tabular-export] thead {
  display: table-header-group !important;
}
[data-tabular-export] tbody {
  display: table-row-group !important;
}
[data-tabular-export] tr {
  display: table-row !important;
}
[data-tabular-export] th,
[data-tabular-export] td {
  display: table-cell !important;
}
`;

export function injectTabularPdfStyles(clonedDoc: Document): void {
  const style = clonedDoc.createElement("style");
  style.textContent = TABULAR_PDF_CAPTURE_CSS;
  clonedDoc.head.appendChild(style);
}

const INVOICE_GRAY_HEADER_CELL =
  ".bh-inv-meta-table th, .bh-inv-party thead th, .bh-inv-items thead th, .bh-inv-totals thead th";

const INVOICE_GRAY_HEADER_ROW =
  ".bh-inv-meta-table thead tr, .bh-inv-party thead tr, .bh-inv-items thead tr, .bh-inv-totals thead tr";

/** Force full-cell gray headers in html2canvas (vars / flex children often paint as a thin strip). */
export function paintInvoicePdfHeaderFills(root: HTMLElement): void {
  root.querySelectorAll(INVOICE_GRAY_HEADER_ROW).forEach((row) => {
    if (row instanceof HTMLElement) {
      row.style.setProperty("background-color", INVOICE_PDF_HEAD_FILL, "important");
    }
  });
  root.querySelectorAll(INVOICE_GRAY_HEADER_CELL).forEach((cell) => {
    if (!(cell instanceof HTMLElement)) return;
    cell.style.setProperty("background-color", INVOICE_PDF_HEAD_FILL, "important");
    cell.style.setProperty("background-image", "none", "important");
  });
  root
    .querySelectorAll(
      `${INVOICE_GRAY_HEADER_CELL} .bh-bi, ${INVOICE_GRAY_HEADER_CELL} .bh-inv-party-en, ${INVOICE_GRAY_HEADER_CELL} .bh-inv-party-ar`,
    )
    .forEach((inner) => {
      if (inner instanceof HTMLElement) {
        inner.style.setProperty("background-color", "transparent", "important");
        inner.style.setProperty("background-image", "none", "important");
      }
    });
}

export function preparePrintDocumentForPdfCapture(root: HTMLElement): void {
  root.style.width = "794px";
  root.style.maxWidth = "794px";
  root.style.boxSizing = "border-box";
  paintInvoicePdfHeaderFills(root);
  root.querySelectorAll("img").forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    img.style.maxWidth = img.classList.contains("bh-inv-logo--store") ? "80px" : "32px";
    img.style.maxHeight = "28px";
    img.style.width = "auto";
    img.style.height = "auto";
    img.style.objectFit = "contain";
  });
}
