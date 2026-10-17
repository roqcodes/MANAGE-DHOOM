"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { AdminPrintSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";
import { printDocumentElement } from "@/lib/print-document";
import { useAutoPrintOnLoad } from "@/lib/use-auto-print-on-load";
import {
  PurchaseBillPrintDocument,
  type PurchaseBillPrintData,
} from "@/modules/purchasing/components/purchase-bill-print-document";

export function ErpPurchaseBillPrintPage() {
  const searchParams = useSearchParams();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [bill, setBill] = useState<PurchaseBillPrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const autoDownloadedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    adminGet<{ bill: PurchaseBillPrintData }>(`erp/purchase-bills/${id}`)
      .then((res) => setBill(res.bill))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load bill"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownloadPdf = useCallback(async () => {
    const element = document.querySelector("[data-print-document]");
    if (!(element instanceof HTMLElement) || !bill) return;

    setDownloading(true);
    try {
      await downloadElementAsPdf(element, `${bill.purchase_bill_number}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [bill]);

  useAutoPrintOnLoad(
    Boolean(
      bill &&
        !loading &&
        searchParams.get("print") === "1" &&
        searchParams.get("download") !== "1",
    ),
  );

  if (loading) {
    return <AdminPrintSkeleton />;
  }

  if (error || !bill) {
    return <p className="p-6 text-sm text-destructive">{error ?? "Purchase bill not found."}</p>;
  }

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/erp/purchase-bills/${id}`}
        title={`Purchase bill · ${bill.purchase_bill_number}`}
        onDownloadPdf={handleDownloadPdf}
        downloading={downloading}
        onPrint={() => {
          const element = document.querySelector("[data-print-document]");
          if (element instanceof HTMLElement) printDocumentElement(element);
        }}
      />
      <div className="flex justify-center pb-10 pt-4 print:pb-0 print:pt-0">
        <PurchaseBillPrintDocument bill={bill} />
      </div>
    </div>
  );
}
