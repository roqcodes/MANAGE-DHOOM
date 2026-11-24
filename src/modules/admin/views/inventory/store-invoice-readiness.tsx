"use client";

import {
  INVOICE_SELLER_CHECKLIST,
  missingInvoiceSellerFields,
  type InvoiceSellerProfile,
} from "@/modules/settings/lib/invoice-seller-profile";

export function StoreInvoiceReadinessBanner({ profile }: { profile: InvoiceSellerProfile }) {
  const missing = missingInvoiceSellerFields(profile);
  if (missing.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Seller details are complete for printed tax invoices.
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
      <p className="font-medium">Required for tax invoices — still missing:</p>
      <ul className="mt-1 list-inside list-disc text-xs sm:text-sm">
        {missing.map((item) => (
          <li key={item.key}>{item.label}</li>
        ))}
      </ul>
    </div>
  );
}

export function StoreInvoiceFieldGuide() {
  return (
    <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">On printed invoices</p>
      <ul className="mt-1.5 space-y-1">
        {INVOICE_SELLER_CHECKLIST.slice(0, 6).map((item) => (
          <li key={item.key}>
            <span className="text-foreground">{item.label}</span>
            {item.required ? (
              <span className="text-muted-foreground"> — Seller block &amp; QR</span>
            ) : (
              <span className="text-muted-foreground"> — optional</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}