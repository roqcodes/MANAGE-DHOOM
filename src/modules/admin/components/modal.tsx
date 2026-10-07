"use client";

import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel as UiFieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { formatActionError } from "@/modules/admin/lib/format-action-error";
import { RequiredFieldMark, showRequiredMark } from "@/lib/required-field-label";

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "landscape";
  /** When true, body uses flex column with no default padding (for custom layouts). */
  bareBody?: boolean;
  /** Raise z-index when opened above another dialog. */
  nested?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  landscape:
    "flex flex-col overflow-hidden h-[min(calc(100dvh-1.5rem),720px)] max-h-[min(92dvh,720px)] w-[min(98vw,1280px)] sm:max-w-[min(98vw,1280px)] min-h-0",
};

/** Shared input styling for legacy raw `<input>` / `<select>` / `<textarea>` in forms. */
export const inputCls =
  "h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

export const selectCls = `${inputCls} cursor-pointer`;

export const textareaCls =
  "min-h-20 w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  size = "md",
  bareBody = false,
  nested = false,
}: ModalProps) {
  const isLandscape = size === "landscape";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton
        instant
        stacked={nested}
        className={cn(
          "gap-0 p-0",
          SIZE_CLASSES[size],
          isLandscape ? undefined : "flex max-h-[min(90vh,840px)] flex-col overflow-hidden",
        )}
      >
        <DialogHeader className="shrink-0 gap-0.5 border-b border-border px-3 py-2 pr-14 text-left sm:gap-1 sm:px-4 sm:py-2.5 min-[1100px]:px-5 min-[1100px]:py-3">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          {subtitle ? (
            <DialogDescription className="text-sm">{subtitle}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div
          className={cn(
            bareBody
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3",
          )}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FieldLabel({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  const showRequired = showRequiredMark(required, children);

  return (
    <Field>
      <UiFieldLabel className="text-sm font-medium">
        {label}
        {showRequired ? <RequiredFieldMark /> : null}
      </UiFieldLabel>
      {children}
    </Field>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription className="text-sm">{formatActionError(message)}</AlertDescription>
    </Alert>
  );
}

export function PrimaryBtn({
  children,
  disabled,
  type = "button",
  onClick,
  form,
  enterNavSubmit,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  form?: string;
  /** Include in Enter-key field navigation and submit on Enter when focused. */
  enterNavSubmit?: boolean;
}) {
  const isSubmitTarget = enterNavSubmit ?? type === "submit";

  return (
    <Button
      type={type}
      disabled={disabled}
      onClick={onClick}
      form={form}
      data-form-enter-submit={isSubmitTarget ? "" : undefined}
    >
      {children}
    </Button>
  );
}

export function SecondaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      data-enter-nav-skip
    >
      {children}
    </Button>
  );
}

export function DangerBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button type="button" variant="destructive" disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}
