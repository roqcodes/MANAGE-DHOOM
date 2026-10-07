"use client";

import Link from "next/link";
import { ChevronLeft, Download, Printer } from "lucide-react";

export function InvoicePrintToolbar({
  backHref,
  title,
  onDownloadPdf,
  onPrint,
  downloading = false,
}: {
  backHref: string;
  title: string;
  onDownloadPdf?: () => void;
  onPrint?: () => void;
  downloading?: boolean;
}) {
  return (
    <div className="print:hidden sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200/90 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:px-6">
      <Link
        href={backHref}
        scroll={false}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        <ChevronLeft className="size-4 shrink-0" aria-hidden />
        Back
      </Link>
      <p className="min-w-0 flex-1 truncate text-center text-[13px] font-semibold text-slate-600">
        {title}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {onDownloadPdf ? (
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="size-4 shrink-0" aria-hidden />
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onPrint ?? (() => window.print())}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-900/10 bg-slate-900 px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          <Printer className="size-4 shrink-0" aria-hidden />
          Print
        </button>
      </div>
    </div>
  );
}
