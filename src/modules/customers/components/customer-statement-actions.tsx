"use client";

import { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAdminAlert } from "@/modules/admin/components/admin-alert-provider";
import { useAdminDateRangeContext } from "@/modules/admin/providers/admin-date-range-provider";
import { formatReportPeriodRange } from "@/modules/admin/views/reports/business-overview/report-format";
import { useErpStores } from "@/modules/erp/components/use-erp-stores";
import {
  buildCustomerStatementPdf,
  downloadCustomerStatementPdf,
  shareCustomerStatementViaWhatsApp,
} from "@/modules/customers/lib/customer-statement-export.client";
import { cn } from "@/lib/utils";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function CustomerStatementActions({
  customerId,
  customerName,
  phone,
  customerSearch,
  disabled,
}: {
  customerId: string;
  customerName: string;
  phone: string | null | undefined;
  customerSearch: string;
  disabled?: boolean;
}) {
  const { value: globalDateRange } = useAdminDateRangeContext();
  const { activeStoreId, stores } = useErpStores();
  const { showError, showSuccess } = useAdminAlert();
  const [busy, setBusy] = useState<"download" | "whatsapp" | null>(null);

  const storeId = activeStoreId ?? "";
  const storeLabel = storeId
    ? stores.find((s) => s.id === storeId)?.name ?? "Selected store"
    : "";

  const buildOpts = useCallback(
    () => ({
      customerId,
      customerName,
      customerSearch,
      dateFrom: globalDateRange.from,
      dateTo: globalDateRange.to,
      storeId,
      storeLabel,
    }),
    [
      customerId,
      customerName,
      customerSearch,
      globalDateRange.from,
      globalDateRange.to,
      storeId,
      storeLabel,
    ],
  );

  async function ensureStore() {
    if (!storeId) {
      showError("Select a store in the header before exporting a statement.");
      return false;
    }
    return true;
  }

  async function handleDownload() {
    if (!(await ensureStore())) return;
    setBusy("download");
    try {
      await downloadCustomerStatementPdf(buildOpts());
      showSuccess("Statement PDF downloaded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not download statement.";
      showError(message);
    } finally {
      setBusy(null);
    }
  }

  async function handleWhatsApp() {
    if (!(await ensureStore())) return;
    if (!phone?.trim()) {
      showError("Add a phone number on this customer to share on WhatsApp.");
      return;
    }
    setBusy("whatsapp");
    try {
      const periodLabel = formatReportPeriodRange(
        globalDateRange.from,
        globalDateRange.to,
      );
      const { blob, filename } = await buildCustomerStatementPdf(buildOpts());
      const result = await shareCustomerStatementViaWhatsApp({
        customerName,
        phone,
        periodLabel,
        pdfBlob: blob,
        filename,
      });
      if (result === "shared") {
        showSuccess("Choose WhatsApp in the share sheet to send the statement.");
      } else {
        showSuccess(
          "WhatsApp opened with this customer. Attach the statement PDF if it is not already attached.",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Could not share on WhatsApp.";
      showError(message);
    } finally {
      setBusy(null);
    }
  }

  const actionsDisabled = disabled || busy !== null;

  return (
    <div className="grid w-full grid-cols-2 gap-2 max-sm:[&_button]:w-full sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end sm:[&_button]:w-auto">
      <Button
          type="button"
          variant="outline"
          size="page"
          className="rounded-full"
          disabled={actionsDisabled}
          onClick={() => void handleDownload()}
        >
          {busy === "download" ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Download data-icon="inline-start" />
          )}
        Download statement
      </Button>
      <Button
          type="button"
          variant="outline"
          size="page"
          className={cn("rounded-full")}
          disabled={actionsDisabled || !phone?.trim()}
          onClick={() => void handleWhatsApp()}
          title={phone?.trim() ? "Share statement on WhatsApp" : "Customer needs a phone number"}
        >
          {busy === "whatsapp" ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <WhatsAppIcon className="size-4" data-icon="inline-start" />
          )}
        Share on WhatsApp
      </Button>
    </div>
  );
}