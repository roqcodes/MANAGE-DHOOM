"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/modules/admin/ui/loading-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
  AdminFormLayout,
  AdminPageHeader,
  AdminPageLayout,
} from "./admin-page";

export type ErpFormViewBaseProps = {
  variant?: "page" | "modal";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (id?: string) => void;
};

export type AdminFormModalSize = "sm" | "md" | "lg" | "xl" | "landscape";

export type AdminFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: AdminFormModalSize;
  /** Raise z-index when opened above another dialog (e.g. create customer on invoice). */
  stacked?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  formId?: string;
};

const SIZE_CLASSES: Record<AdminFormModalSize, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-4xl",
  xl: "sm:max-w-5xl",
  landscape:
    "flex flex-col overflow-hidden h-[min(calc(100dvh-1.5rem),720px)] max-h-[min(92dvh,720px)] w-[min(98vw,1280px)] sm:max-w-[min(98vw,1280px)] min-h-0",
};

export function AdminFormModal({
  open,
  onOpenChange,
  title,
  description,
  size = "lg",
  stacked = false,
  children,
  footer,
  formId,
}: AdminFormModalProps) {
  const isLandscape = size === "landscape";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        instant
        stacked={stacked}
        className={cn(
          "gap-0 p-0",
          SIZE_CLASSES[size],
          isLandscape ? undefined : "flex max-h-[min(92vh,900px)] flex-col overflow-hidden",
        )}
      >
        <DialogHeader className="shrink-0 gap-1 border-b border-border px-5 py-4 pr-14 text-left">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-sm">{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        {footer ? (
          <div
            data-form-enter-footer
            className="flex shrink-0 flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-border bg-muted/50 px-5 pb-4 pt-3"
          >
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export type AdminFormShellProps = {
  variant?: "page" | "modal";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  backHref?: string;
  breadcrumb?: { label: string; href?: string }[];
  size?: AdminFormModalSize;
  formId?: string;
  loading?: boolean;
  loadingFallback?: ReactNode;
  pending?: boolean;
  footer?: ReactNode;
  stacked?: boolean;
  children: ReactNode;
};

export function AdminFormShell({
  variant = "page",
  open = false,
  onOpenChange,
  title,
  description,
  backHref,
  breadcrumb,
  size = "lg",
  formId,
  loading,
  loadingFallback,
  pending = false,
  footer,
  stacked = false,
  children,
}: AdminFormShellProps) {
  if (loading && loadingFallback) {
    if (variant === "modal") {
      return (
        <AdminFormModal
          open={open}
          onOpenChange={onOpenChange ?? (() => {})}
          title={title}
          description={description}
          size={size}
          stacked={stacked}
        >
          {loadingFallback}
        </AdminFormModal>
      );
    }
    return loadingFallback;
  }

  if (variant === "modal") {
    return (
      <AdminFormModal
        open={open}
        onOpenChange={onOpenChange ?? (() => {})}
        title={title}
        description={description}
        size={size}
        stacked={stacked}
        formId={formId}
        footer={footer}
      >
        <div
          className={cn(
            pending && "pointer-events-none opacity-60 transition-opacity",
          )}
          aria-busy={pending || undefined}
        >
          {children}
        </div>
      </AdminFormModal>
    );
  }

  return (
    <AdminPageLayout>
      <AdminPageHeader
        title={title}
        description={description}
        backHref={backHref}
        breadcrumb={breadcrumb}
      />
      <div data-form-enter-scope>
        <div
          className={cn(pending && "pointer-events-none opacity-60 transition-opacity")}
          aria-busy={pending || undefined}
        >
          {children}
        </div>
        {footer && variant === "page" ? (
          <div data-form-enter-footer className="mt-4 flex flex-wrap justify-end gap-2">
            {footer}
          </div>
        ) : null}
      </div>
    </AdminPageLayout>
  );
}

/** Modal-optimized layout: main content + optional sidebar (totals, actions). */
export function AdminFormModalLayout({
  children,
  sidebar,
  className,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
  className?: string;
}) {
  if (!sidebar) {
    return <div className={cn("space-y-4", className)}>{children}</div>;
  }

  return (
    <AdminFormLayout
      className={cn(
        "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(200px,260px)]",
        className,
      )}
    >
      <div className="space-y-4">{children}</div>
      <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">{sidebar}</aside>
    </AdminFormLayout>
  );
}

/** Place related sections side-by-side in modals to reduce vertical scroll. */
export function AdminFormColumns({
  children,
  cols = 2,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        cols === 2 && "grid-cols-1 lg:grid-cols-2",
        cols === 3 && "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdminFormActions({
  onCancel,
  submitLabel,
  cancelLabel = "Cancel",
  pending = false,
  formId,
  loadingLabel = "Saving…",
}: {
  onCancel: () => void;
  submitLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  formId?: string;
  loadingLabel?: string;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        data-enter-nav-skip
        onClick={onCancel}
        disabled={pending}
      >
        {cancelLabel}
      </Button>
      <LoadingButton
        type="submit"
        form={formId}
        data-form-enter-submit
        loading={pending}
        loadingLabel={loadingLabel}
      >
        {submitLabel}
      </LoadingButton>
    </>
  );
}
