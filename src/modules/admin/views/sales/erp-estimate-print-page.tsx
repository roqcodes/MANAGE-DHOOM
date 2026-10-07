"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { AdminPrintSkeleton } from "@/modules/admin/components/admin-page-skeleton";
import { InvoicePrintToolbar } from "@/modules/admin/components/invoice-print-toolbar";
import { adminGet } from "@/modules/admin/lib/admin-api-client";
import {
  ErpEstimatePrintDocument,
  type ErpEstimatePrintData,
} from "@/modules/erp/components/erp-estimate-print-document";
import { downloadElementAsPdf } from "@/lib/html2pdf-download";

export function ErpEstimatePrintPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [estimate, setEstimate] = useState<ErpEstimatePrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const autoDownloadedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    adminGet<ErpEstimatePrintData>(`erp/estimates/${id}`)
      .then(setEstimate)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load estimate"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownloadPdf = useCallback(async () => {
    const element = document.querySelector("[data-estimate-document]");
    if (!(element instanceof HTMLElement) || !estimate) return;

    setDownloading(true);
    try {
      await downloadElementAsPdf(element, `${estimate.estimate_number}.pdf`);
    } finally {
      setDownloading(false);
    }
  }, [estimate]);

  useEffect(() => {
    if (
      searchParams.get("download") === "1" &&
      estimate &&
      !autoDownloadedRef.current &&
      !downloading
    ) {
      autoDownloadedRef.current = true;
      void handleDownloadPdf();
    }
  }, [searchParams, estimate, downloading, handleDownloadPdf]);

  if (loading) {
    return <AdminPrintSkeleton />;
  }

  if (error || !estimate) {
    return <p className="p-6 text-sm text-destructive">{error ?? "Estimate not found."}</p>;
  }

  return (
    <div className="min-h-0 flex-1 bg-slate-50 print:bg-white">
      <InvoicePrintToolbar
        backHref={`/admin/erp/estimates/${id}`}
        title={`Estimate · ${estimate.estimate_number}`}
        onDownloadPdf={handleDownloadPdf}
        downloading={downloading}
      />
      <div className="pb-10 pt-4 print:pb-0 print:pt-0">
        <ErpEstimatePrintDocument estimate={estimate} />
      </div>
    </div>
  );
}
