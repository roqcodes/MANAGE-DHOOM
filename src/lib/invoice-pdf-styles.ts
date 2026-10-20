/** Injected into html2pdf clone — layout must not rely on Tailwind after stylesheet strip. */
export const INVOICE_PDF_CAPTURE_CSS = `
[data-print-document] {
  box-sizing: border-box;
  width: 794px !important;
  max-width: 794px !important;
  min-width: 0 !important;
  margin: 0 auto !important;
  padding: 48px 40px !important;
  background: #ffffff !important;
  color: #0f172a !important;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif !important;
  font-size: 12px !important;
  line-height: 1.45 !important;
}
[data-print-document] img.bh-inv-logo,
[data-print-document] .bh-inv-logo img {
  display: block !important;
  max-width: 200px !important;
  max-height: 52px !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
}
[data-print-document] table {
  border-collapse: collapse !important;
}
[data-print-document] .bh-inv-header {
  width: 100%;
  margin-bottom: 20px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 18px;
}
[data-print-document] .bh-inv-header td {
  vertical-align: top;
  padding: 0;
}
[data-print-document] .bh-inv-header .bh-inv-head-right {
  text-align: right;
}
[data-print-document] .bh-inv-kicker {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #94a3b8;
  font-weight: 600;
  margin: 0 0 4px;
}
[data-print-document] .bh-inv-title {
  font-size: 20px;
  font-weight: 700;
  margin: 6px 0 2px;
  letter-spacing: -0.02em;
}
[data-print-document] .bh-inv-doc-id {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: #475569;
  margin: 0;
}
[data-print-document] .bh-inv-meta {
  width: 100%;
  margin-top: 10px;
}
[data-print-document] .bh-inv-meta td {
  padding: 3px 12px 3px 0;
  vertical-align: top;
  font-size: 11px;
}
[data-print-document] .bh-inv-meta .bh-inv-meta-label {
  color: #94a3b8;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}
[data-print-document] .bh-inv-parties {
  width: 100%;
  margin: 18px 0;
}
[data-print-document] .bh-inv-parties td {
  width: 50%;
  vertical-align: top;
  padding: 0 16px 0 0;
}
[data-print-document] .bh-inv-parties td + td {
  padding: 0 0 0 16px;
}
[data-print-document] .bh-inv-party-name {
  font-size: 13px;
  font-weight: 600;
  margin: 4px 0 2px;
}
[data-print-document] .bh-inv-muted {
  color: #64748b;
  font-size: 11px;
  margin: 1px 0;
}
[data-print-document] .bh-inv-items {
  width: 100%;
  table-layout: fixed;
  margin: 12px 0 16px;
}
[data-print-document] .bh-inv-items th {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
  font-weight: 600;
  text-align: left;
  border-bottom: 1px solid #cbd5e1;
  padding: 8px 4px;
}
[data-print-document] .bh-inv-items td {
  border-bottom: 1px solid #f1f5f9;
  padding: 8px 4px;
  vertical-align: top;
  word-wrap: break-word;
}
[data-print-document] .bh-inv-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
[data-print-document] .bh-inv-totals-wrap {
  width: 100%;
  margin-top: 8px;
}
[data-print-document] .bh-inv-totals {
  width: 280px;
  margin-left: auto;
}
[data-print-document] .bh-inv-totals td {
  padding: 4px 0;
  font-size: 11px;
}
[data-print-document] .bh-inv-totals .bh-inv-total-label {
  color: #64748b;
  padding-right: 16px;
}
[data-print-document] .bh-inv-totals .bh-inv-grand td {
  font-weight: 700;
  font-size: 13px;
  border-top: 1px solid #cbd5e1;
  padding-top: 8px;
}
[data-print-document] .bh-inv-balance td {
  font-weight: 600;
  color: #be123c;
}
[data-print-document] .bh-inv-notes {
  margin-top: 20px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 11px;
}
[data-print-document] .bh-inv-footer {
  margin-top: 24px;
  padding-top: 14px;
  border-top: 1px solid #e2e8f0;
  font-size: 10px;
  color: #64748b;
  line-height: 1.55;
}
[data-print-document] .bh-inv-badge {
  display: inline-block;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #475569;
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

export function preparePrintDocumentForPdfCapture(root: HTMLElement): void {
  root.style.width = "794px";
  root.style.maxWidth = "794px";
  root.style.boxSizing = "border-box";
  root.querySelectorAll("img").forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    img.style.maxWidth = "200px";
    img.style.maxHeight = "52px";
    img.style.width = "auto";
    img.style.height = "auto";
    img.style.objectFit = "contain";
  });
}
