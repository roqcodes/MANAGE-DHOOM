"use client";

import { Check, Download, Loader2 } from "lucide-react";

import {
  asyncActionCheckClass,
  asyncActionSuccessClass,
  isUserAbort,
  useAsyncActionFeedback,
} from "@/components/ui/async-action-feedback";
import { Button } from "@/components/ui/button";
import { WhatsAppToolbarIcon } from "@/modules/erp/components/whatsapp-toolbar-icon";
import { useAppFeedback } from "@/modules/feedback/components/app-feedback-provider";

export function DocumentDownloadIconButton({
  iconSize,
  layout,
  onDownload,
  disabled,
}: {
  iconSize: "page-icon" | "icon-sm" | "icon";
  layout: "inline" | "bar";
  onDownload: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const { showError } = useAppFeedback();
  const { phase, run, isSuccess } = useAsyncActionFeedback();

  async function handleClick() {
    try {
      await run(onDownload);
    } catch (err) {
      showError(err, "Couldn't download");
    }
  }

  return (
    <Button
      nativeButton
      size={iconSize}
      variant={layout === "bar" ? "outline" : "ghost"}
      disabled={disabled || phase === "loading"}
      onClick={() => void handleClick()}
      aria-label={isSuccess ? "Downloaded" : "Download PDF"}
      className={isSuccess ? asyncActionSuccessClass : undefined}
    >
      {phase === "loading" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : isSuccess ? (
        <Check className={asyncActionCheckClass} />
      ) : (
        <Download />
      )}
    </Button>
  );
}

export function DocumentWhatsAppIconButton({
  iconSize,
  layout,
  onWhatsApp,
  disabled,
  title,
}: {
  iconSize: "page-icon" | "icon-sm" | "icon";
  layout: "inline" | "bar";
  onWhatsApp: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
}) {
  const { showError } = useAppFeedback();
  const { phase, run, isSuccess } = useAsyncActionFeedback();

  async function handleClick() {
    try {
      await run(onWhatsApp);
    } catch (err) {
      if (isUserAbort(err)) return;
      showError(err, "Couldn't share on WhatsApp");
    }
  }

  return (
    <Button
      nativeButton
      size={iconSize}
      variant={layout === "bar" ? "outline" : "ghost"}
      disabled={disabled || phase === "loading"}
      onClick={() => void handleClick()}
      aria-label={isSuccess ? "Shared on WhatsApp" : title ?? "Share on WhatsApp"}
      title={title}
      className={isSuccess ? asyncActionSuccessClass : undefined}
    >
      {phase === "loading" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : isSuccess ? (
        <Check className={asyncActionCheckClass} />
      ) : (
        <WhatsAppToolbarIcon className="size-4" />
      )}
    </Button>
  );
}