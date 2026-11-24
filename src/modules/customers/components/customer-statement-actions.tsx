"use client";

import { useCallback } from "react";
import { Check, Download, Loader2 } from "lucide-react";

import {
  asyncActionCheckClass,
  asyncActionSuccessClass,
  isUserAbort,
  useAsyncActionFeedback,
} from "@/components/ui/async-action-feedback";
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
import { WhatsAppToolbarIcon } from "@/modules/erp/components/whatsapp-toolbar-icon";
import { cn } from "@/lib/utils";

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
  const { showError } = useAdminAlert();
  const downloadFeedback = useAsyncActionFeedback();
  const whatsappFeedback = useAsyncActionFeedback();

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
    try {
      await downloadFeedback.run(() => downloadCustomerStatementPdf(buildOpts()));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not download statement.");
    }
  }

  async function handleWhatsApp() {
    if (!(await ensureStore())) return;
    if (!phone?.trim()) {
      showError("Add a phone number on this customer to share on WhatsApp.");
      return;
    }
    try {
      await whatsappFeedback.run(async () => {
        const periodLabel = formatReportPeriodRange(
          globalDateRange.from,
          globalDateRange.to,
        );
        const { blob, filename } = await buildCustomerStatementPdf(buildOpts());
        await shareCustomerStatementViaWhatsApp({
          customerName,
          phone,
          periodLabel,
          pdfBlob: blob,
          filename,
        });
      });
    } catch (error) {
      if (isUserAbort(error)) return;
      showError(error instanceof Error ? error.message : "Could not share on WhatsApp.");
    }
  }

  const actionsDisabled =
    disabled || downloadFeedback.isLoading || whatsappFeedback.isLoading;

  return (
    <div className="grid w-full grid-cols-2 gap-2 max-sm:[&_button]:w-full sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end sm:[&_button]:w-auto">
      <Button
        type="button"
        variant="outline"
        size="page"
        className={cn("rounded-full", downloadFeedback.isSuccess && asyncActionSuccessClass)}
        disabled={actionsDisabled}
        onClick={() => void handleDownload()}
      >
        {downloadFeedback.isLoading ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : downloadFeedback.isSuccess ? (
          <Check className={asyncActionCheckClass} data-icon="inline-start" />
        ) : (
          <Download data-icon="inline-start" />
        )}
        Download statement
      </Button>
      <Button
        type="button"
        variant="outline"
        size="page"
        className={cn("rounded-full", whatsappFeedback.isSuccess && asyncActionSuccessClass)}
        disabled={actionsDisabled || !phone?.trim()}
        onClick={() => void handleWhatsApp()}
        title={phone?.trim() ? "Share statement on WhatsApp" : "Customer needs a phone number"}
      >
        {whatsappFeedback.isLoading ? (
          <Loader2 className="animate-spin" data-icon="inline-start" />
        ) : whatsappFeedback.isSuccess ? (
          <Check className={asyncActionCheckClass} data-icon="inline-start" />
        ) : (
          <WhatsAppToolbarIcon className="size-4" data-icon="inline-start" />
        )}
        Share on WhatsApp
      </Button>
    </div>
  );
}