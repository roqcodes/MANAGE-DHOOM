"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { formatCustomerCreditNoteRef } from "@/common/erp/commercial-discount";
import { AdminPrintSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";
import { printDocumentElement } from "@/lib/print-document";
import { useAutoPrintOnLoad } from "@/lib/use-auto-print-on-load";
import {
  ErpCreditNotePrintDocument,
  type ErpCreditNotePrintData,
} from "@/modules/erp/components/erp-credit-note-print-document";

export function ErpCreditNotePrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [detail, setDetail] = useState<ErpCreditNotePrintData | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    adminGet<ErpCreditNotePrintData>(`erp/credit-notes/${id}`).then(setDetail);
  }, [id]);

  const displayRef = detail
    ? formatCustomerCreditNoteRef({
        id: detail.id,
        credit_note_number: detail.credit_note_number,
        credit_kind: detail.credit_kind,
      })
    : "—";

  const handleDownloadPdf = useCallback(async () => {
    const element = document.querySelector("[data-print-document]");
    if (!(element instanceof HTMLElement) || !detail) return;
    setDownloading(true);
    try {
      await downloadElementAsPdf(
        element,
        `${displayRef.replace(/[^\w.-]+/g, "-")}.pdf`,
      );
    } finally {
      setDownloading(false);
    }
  }, [detail, displayRef]);

  useAutoPrintOnLoad(
    Boolean(
      detail &&
        searchParams.get("print") === "1" &&
        searchParams.get("download") !== "1",
    ),
  );

  useEffect(() => {
    if (searchParams.get("download") === "1" && detail && !downloading) {
      void handleDownloadPdf();
    }
  }, [searchParams, detail, downloading, handleDownloadPdf]);

  if (!detail) {
    return <AdminPrintSkeleton />;
  }

  const titleKind = detail.credit_kind === "discount" ? "Discount" : "Credit note";

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/erp/credit-notes/${id}`}
        title={`${titleKind} · ${displayRef}`}
        onDownloadPdf={handleDownloadPdf}
        downloading={downloading}
        onPrint={() => {
          const element = document.querySelector("[data-print-document]");
          if (element instanceof HTMLElement) printDocumentElement(element);
        }}
      />
      <div className="flex justify-center pb-10 pt-4 print:pb-0 print:pt-0">
        <ErpCreditNotePrintDocument creditNote={detail} />
      </div>
    </div>
  );
}
