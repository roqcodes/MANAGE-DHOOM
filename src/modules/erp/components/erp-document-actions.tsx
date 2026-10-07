"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Download, Eye, Mail, Pencil, Printer, Share2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adminPost } from "@/modules/admin/lib/admin-api-client";
import type { ErpEmailDocumentType } from "@/common/erp/types";

export type ErpDocumentEmailConfig = {
  documentType: ErpEmailDocumentType;
  documentId: string;
  documentNumber: string;
  defaultEmail?: string | null;
  amount?: number;
  printUrl: string;
  sendThankYou?: boolean;
};

export type ErpDocumentActionsProps = {
  viewHref: string;
  editHref?: string;
  printHref?: string;
  onPrintClick?: () => void;
  onDownloadClick?: () => void;
  emailConfig?: ErpDocumentEmailConfig;
  canEdit?: boolean;
  canDelete?: boolean;
  deleteLabel?: string;
  deleteDescription?: string;
  onDelete?: () => Promise<void>;
  size?: "sm" | "default";
  layout?: "inline" | "bar";
  showView?: boolean;
};

export function ErpDocumentActions({
  viewHref,
  editHref,
  printHref,
  onPrintClick,
  onDownloadClick,
  emailConfig,
  canEdit = false,
  canDelete = false,
  deleteLabel = "Cancel",
  deleteDescription = "This action cannot be undone.",
  onDelete,
  size = "sm",
  layout = "inline",
  showView = true,
}: ErpDocumentActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const iconSize = size === "sm" ? "icon-sm" : "icon";

  function handleDelete() {
    if (!onDelete) return;
    setError(null);
    startTransition(async () => {
      try {
        await onDelete();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  function handleShare() {
    if (!emailConfig?.printUrl) return;
    const url = typeof window !== "undefined" ? `${window.location.origin}${emailConfig.printUrl}` : emailConfig.printUrl;
    void navigator.clipboard.writeText(url).then(() => {
      setShareMessage("Link copied to clipboard.");
      setTimeout(() => setShareMessage(null), 2500);
    });
  }

  function handleSendEmail() {
    if (!emailConfig) return;
    setEmailMessage(null);
    startTransition(async () => {
      try {
        const printUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}${emailConfig.printUrl}`
            : emailConfig.printUrl;
        await adminPost("erp/email/send", {
          documentType: emailConfig.documentType,
          documentId: emailConfig.documentId,
          toEmail: emailTo.trim() || undefined,
          documentNumber: emailConfig.documentNumber,
          amount: emailConfig.amount,
          printUrl,
          sendThankYou: emailConfig.sendThankYou,
        });
        setEmailMessage(`Email sent to ${emailTo.trim() || emailConfig.defaultEmail || "recipient"}.`);
        setEmailOpen(false);
      } catch (err) {
        setEmailMessage(err instanceof Error ? err.message : "Email failed");
      }
    });
  }

  const buttons = (
    <>
      {showView ? (
        <Button
          nativeButton={false}
          size={iconSize}
          variant={layout === "bar" ? "outline" : "ghost"}
          render={<Link href={viewHref} />}
          aria-label="View"
        >
          <Eye />
        </Button>
      ) : null}
      {editHref ? (
        canEdit ? (
          <Button
            nativeButton={false}
            size={iconSize}
            variant={layout === "bar" ? "outline" : "ghost"}
            render={<Link href={editHref} />}
            aria-label="Edit"
          >
            <Pencil />
          </Button>
        ) : (
          <Button
            nativeButton
            size={iconSize}
            variant={layout === "bar" ? "outline" : "ghost"}
            disabled
            aria-label="Edit"
          >
            <Pencil />
          </Button>
        )
      ) : null}
      {onPrintClick || printHref ? (
        <>
          {onPrintClick ? (
            <Button
              nativeButton
              size={iconSize}
              variant={layout === "bar" ? "outline" : "ghost"}
              onClick={onPrintClick}
              aria-label="Print"
            >
              <Printer />
            </Button>
          ) : (
            <Button
              nativeButton={false}
              size={iconSize}
              variant={layout === "bar" ? "outline" : "ghost"}
              render={<Link href={printHref!} target="_blank" />}
              aria-label="Print"
            >
              <Printer />
            </Button>
          )}
          {onDownloadClick ? (
            <Button
              nativeButton
              size={iconSize}
              variant={layout === "bar" ? "outline" : "ghost"}
              onClick={onDownloadClick}
              aria-label="Download PDF"
            >
              <Download />
            </Button>
          ) : printHref ? (
            <Button
              nativeButton={false}
              size={iconSize}
              variant={layout === "bar" ? "outline" : "ghost"}
              render={<Link href={`${printHref}?download=1`} target="_blank" />}
              aria-label="Download PDF"
            >
              <Download />
            </Button>
          ) : null}
        </>
      ) : null}
      {emailConfig ? (
        <Dialog
          open={emailOpen}
          onOpenChange={(next) => {
            setEmailOpen(next);
            if (next) setEmailTo(emailConfig.defaultEmail ?? "");
          }}
        >
          <DialogTrigger
            render={
              <Button
                size={iconSize}
                variant={layout === "bar" ? "outline" : "ghost"}
                aria-label="Email"
              />
            }
          >
            <Mail />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Email document</DialogTitle>
              <DialogDescription>
                Send {emailConfig.documentNumber} using the standard DHOOM TRADING email template.
              </DialogDescription>
            </DialogHeader>
            <Input
              type="email"
              placeholder="Recipient email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
            />
            {emailMessage ? <p className="text-sm text-muted-foreground">{emailMessage}</p> : null}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button onClick={handleSendEmail} disabled={pending}>
                {pending ? "Sending…" : "Send email"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
      {emailConfig?.printUrl ? (
        <Button
          size={iconSize}
          variant={layout === "bar" ? "outline" : "ghost"}
          onClick={handleShare}
          aria-label="Share link"
        >
          <Share2 />
        </Button>
      ) : null}
      {onDelete ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button
                size={iconSize}
                variant={layout === "bar" ? "destructive" : "ghost"}
                disabled={!canDelete || pending}
                className={layout === "inline" ? "text-destructive" : undefined}
                aria-label={deleteLabel}
              />
            }
          >
            <Trash2 />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{deleteLabel}?</DialogTitle>
              <DialogDescription>{deleteDescription}</DialogDescription>
            </DialogHeader>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Keep</DialogClose>
              <Button variant="destructive" onClick={handleDelete} disabled={pending}>
                {pending ? "Working…" : deleteLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );

  if (layout === "bar") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap gap-1">{buttons}</div>
        {shareMessage ? <p className="text-xs text-muted-foreground">{shareMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-0.5">{buttons}</div>
      {shareMessage ? <p className="text-xs text-muted-foreground">{shareMessage}</p> : null}
    </div>
  );
}
