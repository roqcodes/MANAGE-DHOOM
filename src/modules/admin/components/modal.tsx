"use client";

import type { ReactNode } from "react";

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
import { ModalFormFooter } from "@/modules/admin/lib/form-footer-errors";
import { FormValidationScope } from "@/modules/admin/lib/form-validation";
import { ErrorsFeedbackBridge } from "@/modules/feedback/components/errors-feedback-bridge";
import { applyFieldInvalidState, controlBorderInvalid } from "@/lib/form-field-invalid";
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
  "h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

export const selectCls = `${inputCls} cursor-pointer`;

export const textareaCls =
  "min-h-20 w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

/** Legacy modal controls — pass when save was attempted with a validation error on this field. */
export function fieldControlCls(base: string, invalid?: boolean) {
  return controlBorderInvalid(invalid, base);
}

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
          <FormValidationScope>{children}</FormValidationScope>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FieldLabel({
  label,
  required,
  invalid,
  children,
}: {
  label: string;
  required?: boolean;
  invalid?: boolean;
  children: ReactNode;
}) {
  const showRequired = showRequiredMark(required, children);

  return (
    <Field data-invalid={invalid || undefined}>
      <UiFieldLabel
        className={cn("text-sm font-medium", invalid && "text-destructive")}
      >
        {label}
        {showRequired ? <RequiredFieldMark /> : null}
      </UiFieldLabel>
      {applyFieldInvalidState(children, Boolean(invalid))}
    </Field>
  );
}

export function FormError({ message }: { message: string | string[] | null }) {
  if (!message) return null;
  return (
    <ErrorsFeedbackBridge
      errors={message}
      title={Array.isArray(message) && message.length > 1 ? "Fix these issues" : "Fix this issue"}
    />
  );
}

export { ModalFormFooter };

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
