import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import type { ErpEmailDocumentType } from "@/common/erp/types";
import {
  resolveDocumentRecipientEmail,
  sendErpDocumentEmail,
  sendPaymentThankYouEmail,
} from "@/modules/erp/services/erp-email.service";

const DOC_TYPES: ErpEmailDocumentType[] = [
  "invoice",
  "estimate",
  "credit_note",
  "payment",
  "purchase_bill",
  "payment_receipt",
];

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const documentType = body.documentType as ErpEmailDocumentType;
    const documentId = String(body.documentId ?? "");
    const toEmail = String(body.toEmail ?? "").trim();
    const printUrl = String(body.printUrl ?? "").trim();
    const amount = body.amount != null ? Number(body.amount) : undefined;
    const sendThankYou = Boolean(body.sendThankYou);

    if (!documentId || !DOC_TYPES.includes(documentType)) {
      return NextResponse.json({ error: "Invalid document type or id." }, { status: 400 });
    }

    const resolved = await resolveDocumentRecipientEmail(documentType, documentId);
    const email = toEmail || resolved.email;
    if (!email) {
      return NextResponse.json({ error: "No recipient email found." }, { status: 400 });
    }

    if (sendThankYou && (documentType === "payment" || documentType === "payment_receipt")) {
      const result = await sendPaymentThankYouEmail({
        paymentId: documentId,
        toEmail: email,
        customerName: resolved.name ?? undefined,
        paymentNumber: resolved.documentNumber,
        amount: amount ?? 0,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json({ ok: true, to: email });
    }

    if (!printUrl) {
      return NextResponse.json({ error: "printUrl is required." }, { status: 400 });
    }

    const result = await sendErpDocumentEmail({
      documentType,
      documentId,
      toEmail: email,
      documentNumber: resolved.documentNumber,
      customerOrVendorName: resolved.name ?? undefined,
      amount,
      printUrl,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true, to: email });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to send email";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
