"use client";

import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { AdminPurchaseOrderDetail, OrderWithItems } from "@/common/admin/types";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";
import { preparePrintDocumentForPdfCapture } from "@/lib/invoice-pdf-styles";
import { printDocumentElement } from "@/lib/print-document";
import { adminGet, adminGetNullable } from "@/modules/admin/lib/admin-api-client";
import {
  ErpCreditNotePrintDocument,
  type ErpCreditNotePrintData,
} from "@/modules/erp/components/erp-credit-note-print-document";
import {
  ErpEstimatePrintDocument,
  type ErpEstimatePrintData,
} from "@/modules/erp/components/erp-estimate-print-document";
import {
  ErpInvoicePrintDocument,
  type ErpInvoicePrintData,
} from "@/modules/erp/components/erp-invoice-print-document";
import {
  ErpPaymentPrintDocument,
  type ErpPaymentPrintData,
} from "@/modules/erp/components/erp-payment-print-document";
import { formatCustomerCreditNoteRef } from "@/common/erp/commercial-discount";
import { OrderInvoiceDocument } from "@/modules/orders/components/order-invoice-document";
import { buildOrderInvoiceFilename } from "@/modules/orders/lib/invoice-filename";
import { PurchaseOrderInvoiceDocument } from "@/modules/purchase-orders/components/purchase-order-invoice-document";
import {
  PurchaseBillPrintDocument,
  type PurchaseBillPrintData,
} from "@/modules/purchasing/components/purchase-bill-print-document";

type PrintMode = "print" | "download";

async function waitForDocumentPaint() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 80));
}

async function runWithMountedDocument(
  render: () => ReactElement,
  mode: PrintMode,
  downloadFilename: string,
): Promise<void> {
  const host = document.createElement("div");
  host.setAttribute("data-direct-print-host", "true");
  // Full A4 width off-screen so layout paints; 0×0 host made print preview empty (100% width = 0).
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:210mm;min-height:1px;overflow:visible;pointer-events:none;z-index:-1;";
  document.body.appendChild(host);

  const root: Root = createRoot(host);
  root.render(render());
  await waitForDocumentPaint();

  const element = host.querySelector(
    "[data-print-document], [data-estimate-document], [data-invoice-document]",
  );
  if (!(element instanceof HTMLElement)) {
    root.unmount();
    host.remove();
    throw new Error("Could not prepare document for printing.");
  }

  preparePrintDocumentForPdfCapture(element);

  const dispose = () => {
    root.unmount();
    host.remove();
  };

  if (mode === "download") {
    try {
      await downloadElementAsPdf(element, downloadFilename);
    } finally {
      dispose();
    }
    return;
  }

  await new Promise<void>((resolve) => {
    const finish = () => {
      dispose();
      resolve();
    };
    window.addEventListener("afterprint", finish, { once: true });
    printDocumentElement(host);
    window.setTimeout(finish, 120_000);
  });
}

export async function directPrintErpInvoice(
  invoiceId: string,
  mode: PrintMode = "print",
): Promise<void> {
  const invoice = await adminGet<ErpInvoicePrintData>(`erp/invoices/${invoiceId}`);
  await runWithMountedDocument(
    () => <ErpInvoicePrintDocument invoice={invoice} />,
    mode,
    `${invoice.invoice_number}.pdf`,
  );
}

export async function directPrintOrderInvoice(
  orderId: string,
  mode: PrintMode = "print",
): Promise<void> {
  const data = await adminGetNullable<{ order: OrderWithItems }>(`orders/${orderId}`);
  if (!data?.order) throw new Error("Order not found.");
  await runWithMountedDocument(
    () => <OrderInvoiceDocument order={data.order} />,
    mode,
    buildOrderInvoiceFilename(data.order),
  );
}

export async function directPrintPurchaseOrder(
  purchaseOrderId: string,
  mode: PrintMode = "print",
): Promise<void> {
  const data = await adminGetNullable<{ po: AdminPurchaseOrderDetail }>(
    `purchase-orders/${purchaseOrderId}`,
  );
  if (!data?.po) throw new Error("Purchase order not found.");
  const ref = data.po.id.slice(0, 8).toUpperCase();
  await runWithMountedDocument(
    () => <PurchaseOrderInvoiceDocument po={data.po} />,
    mode,
    `purchase-order-${ref}.pdf`,
  );
}

export async function directPrintPurchaseBill(
  billId: string,
  mode: PrintMode = "print",
): Promise<void> {
  const { bill } = await adminGet<{ bill: PurchaseBillPrintData }>(
    `erp/purchase-bills/${billId}`,
  );
  await runWithMountedDocument(
    () => <PurchaseBillPrintDocument bill={bill} />,
    mode,
    `${bill.purchase_bill_number}.pdf`,
  );
}

export async function directPrintErpEstimate(
  estimateId: string,
  mode: PrintMode = "print",
): Promise<void> {
  const estimate = await adminGet<ErpEstimatePrintData>(`erp/estimates/${estimateId}`);
  await runWithMountedDocument(
    () => <ErpEstimatePrintDocument estimate={estimate} />,
    mode,
    `${estimate.estimate_number}.pdf`,
  );
}

export async function directPrintErpPayment(
  paymentId: string,
  mode: PrintMode = "print",
): Promise<void> {
  const payment = await adminGet<ErpPaymentPrintData>(`erp/payments/${paymentId}`);
  await runWithMountedDocument(
    () => <ErpPaymentPrintDocument payment={payment} />,
    mode,
    `${payment.payment_number}.pdf`,
  );
}

export async function directPrintErpCreditNote(
  creditNoteId: string,
  mode: PrintMode = "print",
): Promise<void> {
  const creditNote = await adminGet<ErpCreditNotePrintData>(`erp/credit-notes/${creditNoteId}`);
  const ref = formatCustomerCreditNoteRef({
    id: creditNote.id,
    credit_note_number: creditNote.credit_note_number,
    credit_kind: creditNote.credit_kind,
  });
  await runWithMountedDocument(
    () => <ErpCreditNotePrintDocument creditNote={creditNote} />,
    mode,
    `${ref.replace(/[^\w.-]+/g, "-")}.pdf`,
  );
}

function modeFromPath(pathname: string, pathWithQuery: string): PrintMode {
  try {
    const url = new URL(pathWithQuery, window.location.origin);
    return url.searchParams.get("download") === "1" ? "download" : "print";
  } catch {
    return "print";
  }
}

/** Print or download in-place (no new tab) from an admin print path. */
export async function directPrintFromAdminPath(pathWithQuery: string): Promise<void> {
  const url = new URL(pathWithQuery, window.location.origin);
  const mode = modeFromPath(url.pathname, pathWithQuery);
  const p = url.pathname.replace(/\/$/, "");

  const invoiceMatch = p.match(/^\/admin\/erp\/invoices\/([^/]+)\/print$/);
  if (invoiceMatch) {
    await directPrintErpInvoice(invoiceMatch[1], mode);
    return;
  }

  const orderMatch = p.match(/^\/admin\/orders\/([^/]+)\/invoice$/);
  if (orderMatch) {
    await directPrintOrderInvoice(orderMatch[1], mode);
    return;
  }

  const poMatch = p.match(/^\/admin\/purchase-orders\/([^/]+)\/invoice$/);
  if (poMatch) {
    await directPrintPurchaseOrder(poMatch[1], mode);
    return;
  }

  const billMatch = p.match(/^\/admin\/erp\/purchase-bills\/([^/]+)\/print$/);
  if (billMatch) {
    await directPrintPurchaseBill(billMatch[1], mode);
    return;
  }

  const estimateMatch = p.match(/^\/admin\/erp\/estimates\/([^/]+)\/print$/);
  if (estimateMatch) {
    await directPrintErpEstimate(estimateMatch[1], mode);
    return;
  }

  const paymentMatch = p.match(/^\/admin\/erp\/payments\/([^/]+)\/print$/);
  if (paymentMatch) {
    await directPrintErpPayment(paymentMatch[1], mode);
    return;
  }

  const creditNoteMatch = p.match(/^\/admin\/erp\/credit-notes\/([^/]+)\/print$/);
  if (creditNoteMatch) {
    await directPrintErpCreditNote(creditNoteMatch[1], mode);
    return;
  }

  throw new Error("Printing is not supported for this document.");
}
