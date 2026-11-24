import { buildErpInvoicePdf, directPrintErpInvoice } from "@/lib/direct-document-print";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  normalizeWhatsAppPhone,
  type CustomerStatementWhatsAppResult,
} from "@/modules/customers/lib/customer-statement-export.client";

export async function downloadErpInvoicePdf(invoiceId: string): Promise<void> {
  await directPrintErpInvoice(invoiceId, "download");
}

export async function shareErpInvoiceViaWhatsApp(opts: {
  customerName: string;
  phone: string;
  invoiceNumber: string;
  totalAmount: number;
  invoiceId: string;
}): Promise<CustomerStatementWhatsAppResult> {
  const waPhone = normalizeWhatsAppPhone(opts.phone);
  if (!waPhone) {
    throw new Error("Customer has no valid phone number for WhatsApp.");
  }

  const { blob, filename } = await buildErpInvoicePdf(opts.invoiceId);
  const total = formatCurrencyAmount(opts.totalAmount);
  const message = `Hello${opts.customerName ? ` ${opts.customerName}` : ""},\n\nPlease find tax invoice ${opts.invoiceNumber} for ${total}.\n\nThank you.`;
  const file = new File([blob], filename, { type: "application/pdf" });

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const canShareFiles =
        typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
      if (canShareFiles) {
        await navigator.share({
          title: `Tax invoice ${opts.invoiceNumber}`,
          text: message,
          files: [file],
        });
        return "shared";
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);

  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(
    `${message}\n\n(Invoice PDF was downloaded to your device — please attach it in this chat.)`,
  )}`;
  window.open(waUrl, "_blank", "noopener,noreferrer");
  return "downloaded_and_opened";
}