import "server-only";

import type { ErpEmailDocumentType } from "@/common/erp/types";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { sendErpTemplatedEmail } from "@/lib/email/send-email";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";

const DOC_LABELS: Record<ErpEmailDocumentType, string> = {
  invoice: "Invoice",
  estimate: "Estimate",
  credit_note: "Credit note",
  payment: "Payment receipt",
  purchase_bill: "Purchase bill",
  payment_receipt: "Payment receipt",
};

export async function sendErpDocumentEmail(input: {
  documentType: ErpEmailDocumentType;
  documentId: string;
  toEmail: string;
  documentNumber: string;
  customerOrVendorName?: string;
  amount?: number;
  printUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdminOrManagerProfile();
  const label = DOC_LABELS[input.documentType];
  const amountLine =
    input.amount != null
      ? `Amount: AED ${input.amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`
      : undefined;

  const result = await sendErpTemplatedEmail(input.toEmail, {
    subject: `${label} ${input.documentNumber} from DHOOM TRADING`,
    heading: `${label} ${input.documentNumber}`,
    bodyLines: [
      input.customerOrVendorName
        ? `Dear ${input.customerOrVendorName},`
        : "Hello,",
      `Please find your ${label.toLowerCase()} details below.`,
      `Document #: ${input.documentNumber}`,
      ...(amountLine ? [amountLine] : []),
      "You can view and download the document using the button below.",
    ],
    actionLabel: `View ${label}`,
    actionUrl: input.printUrl,
    footerNote: "If you have questions, contact your DHOOM TRADING account manager.",
  });

  if (result.ok) {
    await logAuditEvent({
      action: "email_sent",
      entityType: input.documentType,
      entityId: input.documentId,
      description: `Emailed ${label} ${input.documentNumber} to ${input.toEmail}`,
    });
  }

  return result;
}

export async function sendPaymentThankYouEmail(input: {
  paymentId: string;
  toEmail: string;
  customerName?: string;
  paymentNumber: string;
  amount: number;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdminOrManagerProfile();

  const result = await sendErpTemplatedEmail(input.toEmail, {
    subject: `Payment received — ${input.paymentNumber}`,
    heading: "Thank you for your payment",
    bodyLines: [
      input.customerName ? `Dear ${input.customerName},` : "Hello,",
      "We have received your payment. Thank you!",
      `Receipt #: ${input.paymentNumber}`,
      `Amount: AED ${input.amount.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`,
    ],
    footerNote: "This receipt is for your records.",
  });

  if (result.ok) {
    await logAuditEvent({
      action: "email_sent",
      entityType: "erp_payment",
      entityId: input.paymentId,
      description: `Payment thank-you emailed to ${input.toEmail}`,
    });
  }

  return result;
}

export async function resolveDocumentRecipientEmail(
  documentType: ErpEmailDocumentType,
  documentId: string,
): Promise<{ email: string | null; name: string | null; documentNumber: string }> {
  const supabase = await createSupabaseServerClient();

  if (documentType === "invoice") {
    const { data } = await supabase
      .from("invoices")
      .select("invoice_number, users:users!invoices_user_id_fkey(email, name)")
      .eq("id", documentId)
      .single();
    const user = data?.users as unknown as {
      email: string | null;
      name: string | null;
    } | null;
    return {
      email: user?.email ?? null,
      name: user?.name ?? null,
      documentNumber: data?.invoice_number ?? documentId,
    };
  }

  if (documentType === "estimate") {
    const { data } = await supabase
      .from("erp_estimates")
      .select("estimate_number, users:users!erp_estimates_user_id_fkey(email, name)")
      .eq("id", documentId)
      .single();
    const user = data?.users as unknown as {
      email: string | null;
      name: string | null;
    } | null;
    return {
      email: user?.email ?? null,
      name: user?.name ?? null,
      documentNumber: data?.estimate_number ?? documentId,
    };
  }

  if (documentType === "credit_note") {
    const { data } = await supabase
      .from("erp_credit_notes")
      .select("credit_note_number, users:users!erp_credit_notes_user_id_fkey(email, name)")
      .eq("id", documentId)
      .single();
    const user = data?.users as unknown as {
      email: string | null;
      name: string | null;
    } | null;
    return {
      email: user?.email ?? null,
      name: user?.name ?? null,
      documentNumber: data?.credit_note_number ?? documentId,
    };
  }

  if (documentType === "payment" || documentType === "payment_receipt") {
    const { data } = await supabase
      .from("erp_customer_payments")
      .select("payment_number, total_amount, users:users!erp_customer_payments_user_id_fkey(email, name)")
      .eq("id", documentId)
      .single();
    const user = data?.users as unknown as {
      email: string | null;
      name: string | null;
    } | null;
    return {
      email: user?.email ?? null,
      name: user?.name ?? null,
      documentNumber: data?.payment_number ?? documentId,
    };
  }

  if (documentType === "purchase_bill") {
    const { data } = await supabase
      .from("erp_purchase_bills")
      .select("purchase_bill_number, vendors(email, name)")
      .eq("id", documentId)
      .single();
    const vendor = data?.vendors as { email: string | null; name: string | null } | null;
    return {
      email: vendor?.email ?? null,
      name: vendor?.name ?? null,
      documentNumber: data?.purchase_bill_number ?? documentId,
    };
  }

  return { email: null, name: null, documentNumber: documentId };
}
