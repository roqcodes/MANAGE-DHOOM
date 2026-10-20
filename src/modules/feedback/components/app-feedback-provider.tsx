"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  WifiOff,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SUPPORT_EMAIL } from "@/modules/legal/content/support-contact";
import { presentAppError } from "@/modules/feedback/lib/present-app-error";

type AlertVariant = "error" | "success" | "info" | "warning";

type AlertState = {
  variant: AlertVariant;
  title: string;
  message: string;
  bulletPoints?: string[];
  troubleshoot?: string[];
  showContactDeveloper?: boolean;
  technicalHint?: string;
  audience?: "user" | "developer" | "network" | "auth";
};

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type PromptOptions = {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type AppFeedbackContextValue = {
  showError: (error: unknown, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  /** Form validation — lists every issue in one modal. */
  showValidationErrors: (errors: string[], title?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const AppFeedbackContext = createContext<AppFeedbackContextValue | null>(null);

const AUDIENCE_STYLES: Record<
  string,
  { icon: typeof AlertCircle; iconWrap: string; iconClass: string; badge?: string }
> = {
  user: {
    icon: AlertCircle,
    iconWrap: "bg-rose-50",
    iconClass: "text-rose-600",
  },
  developer: {
    icon: Wrench,
    iconWrap: "bg-amber-50",
    iconClass: "text-amber-700",
    badge: "Contact developer",
  },
  network: {
    icon: WifiOff,
    iconWrap: "bg-sky-50",
    iconClass: "text-sky-700",
  },
  auth: {
    icon: AlertTriangle,
    iconWrap: "bg-orange-50",
    iconClass: "text-orange-700",
  },
};

const VARIANT_META: Record<
  AlertVariant,
  { icon: typeof AlertCircle; iconWrap: string; iconClass: string; defaultTitle: string }
> = {
  error: {
    icon: AlertCircle,
    iconWrap: "bg-rose-50",
    iconClass: "text-rose-600",
    defaultTitle: "Couldn't complete",
  },
  success: {
    icon: CheckCircle2,
    iconWrap: "bg-emerald-50",
    iconClass: "text-emerald-600",
    defaultTitle: "Done",
  },
  info: {
    icon: Info,
    iconWrap: "bg-[#FDF2F7]",
    iconClass: "text-[#EB205F]",
    defaultTitle: "Note",
  },
  warning: {
    icon: AlertTriangle,
    iconWrap: "bg-amber-50",
    iconClass: "text-amber-700",
    defaultTitle: "Please check",
  },
};

type ConfirmState = ConfirmOptions & { open: true };
type PromptState = PromptOptions & { open: true; value: string };

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);
  const promptResolveRef = useRef<((value: string | null) => void) | null>(null);

  const closeAlert = useCallback(() => setAlert(null), []);

  const showError = useCallback((error: unknown, title?: string) => {
    const p = presentAppError(error, { title });
    setAlert({
      variant: "error",
      title: p.title,
      message: p.message,
      troubleshoot: p.troubleshoot,
      showContactDeveloper: p.showContactDeveloper,
      technicalHint: p.technicalHint,
      audience: p.audience,
    });
  }, []);

  const showSuccess = useCallback((message: string, title?: string) => {
    setAlert({
      variant: "success",
      title: title ?? VARIANT_META.success.defaultTitle,
      message: message.trim(),
    });
  }, []);

  const showInfo = useCallback((message: string, title?: string) => {
    setAlert({
      variant: "info",
      title: title ?? VARIANT_META.info.defaultTitle,
      message: message.trim(),
    });
  }, []);

  const showWarning = useCallback((message: string, title?: string) => {
    setAlert({
      variant: "warning",
      title: title ?? VARIANT_META.warning.defaultTitle,
      message: message.trim(),
    });
  }, []);

  const showValidationErrors = useCallback((errors: string[], title?: string) => {
    const lines = errors.map((e) => e.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setAlert({
      variant: "warning",
      title: title ?? "Check the form",
      message:
        lines.length === 1
          ? lines[0]
          : "Please fix the following before saving:",
      bulletPoints: lines.length > 1 ? lines : undefined,
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmState({ ...options, open: true });
    });
  }, []);

  const resolveConfirm = useCallback((value: boolean) => {
    confirmResolveRef.current?.(value);
    confirmResolveRef.current = null;
    setConfirmState(null);
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      promptResolveRef.current = resolve;
      setPromptState({
        ...options,
        open: true,
        value: options.defaultValue ?? "",
      });
    });
  }, []);

  const resolvePrompt = useCallback((value: string | null) => {
    promptResolveRef.current?.(value);
    promptResolveRef.current = null;
    setPromptState(null);
  }, []);

  const value = useMemo(
    () => ({
      showError,
      showSuccess,
      showInfo,
      showWarning,
      showValidationErrors,
      confirm,
      prompt,
    }),
    [showError, showSuccess, showInfo, showWarning, showValidationErrors, confirm, prompt],
  );

  const variantMeta = alert ? VARIANT_META[alert.variant] : null;
  const audienceStyle =
    alert?.audience && alert.variant === "error"
      ? AUDIENCE_STYLES[alert.audience]
      : null;
  const Icon = audienceStyle?.icon ?? variantMeta?.icon ?? AlertCircle;
  const iconWrap = audienceStyle?.iconWrap ?? variantMeta?.iconWrap ?? "bg-muted";
  const iconClass = audienceStyle?.iconClass ?? variantMeta?.iconClass ?? "";

  const developerMailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    "DHOOM Manage — technical issue",
  )}`;

  return (
    <AppFeedbackContext.Provider value={value}>
      {children}

      <Dialog open={alert != null} onOpenChange={(open) => !open && closeAlert()}>
        <DialogContent
          showCloseButton={false}
          elevated
          instant
          className="gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          {alert && variantMeta ? (
            <>
              <DialogHeader className="gap-3 border-b border-border px-5 py-4 text-left">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full",
                      iconWrap,
                      iconClass,
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2 pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DialogTitle className="text-base font-semibold leading-snug">
                        {alert.title}
                      </DialogTitle>
                      {alert.showContactDeveloper ? (
                        <span
                          className="rounded-full border border-amber-300/80 bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900"
                        >
                          Contact developer
                        </span>
                      ) : null}
                    </div>
                    <DialogDescription className="text-sm leading-relaxed text-foreground/85">
                      {alert.message}
                    </DialogDescription>
                    {alert.bulletPoints && alert.bulletPoints.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-foreground/85">
                        {alert.bulletPoints.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {alert.troubleshoot && alert.troubleshoot.length > 0 ? (
                      <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                        {alert.troubleshoot.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                    {alert.technicalHint ? (
                      <p
                        className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 font-mono text-[11px] leading-snug text-amber-950/80"
                      >
                        {alert.technicalHint}
                      </p>
                    ) : null}
                  </div>
                </div>
              </DialogHeader>
              <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/40 px-5 py-3.5">
                {alert.showContactDeveloper ? (
                  <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href={developerMailto} />}>
                    Email developer
                  </Button>
                ) : null}
                <Button type="button" className="min-w-20" onClick={closeAlert}>
                  OK
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmState != null}
        onOpenChange={(open) => !open && resolveConfirm(false)}
      >
        <DialogContent
          showCloseButton={false}
          elevated
          instant
          className="gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          {confirmState ? (
            <>
              <DialogHeader className="gap-2 border-b border-border px-5 py-4 text-left">
                <DialogTitle className="text-base font-semibold">{confirmState.title}</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-foreground/85">
                  {confirmState.message}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 border-t border-border bg-muted/40 px-5 py-3.5 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => resolveConfirm(false)}
                >
                  {confirmState.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  type="button"
                  variant={confirmState.destructive ? "destructive" : "default"}
                  onClick={() => resolveConfirm(true)}
                >
                  {confirmState.confirmLabel ?? "Confirm"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={promptState != null} onOpenChange={(open) => !open && resolvePrompt(null)}>
        <DialogContent
          showCloseButton={false}
          elevated
          instant
          className="gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          {promptState ? (
            <>
              <DialogHeader className="gap-2 border-b border-border px-5 py-4 text-left">
                <DialogTitle className="text-base font-semibold">{promptState.title}</DialogTitle>
                {promptState.message ? (
                  <DialogDescription className="text-sm leading-relaxed text-foreground/85">
                    {promptState.message}
                  </DialogDescription>
                ) : null}
              </DialogHeader>
              <div className="space-y-2 px-5 py-4">
                {promptState.label ? (
                  <Label className="text-sm">{promptState.label}</Label>
                ) : null}
                <Input
                  value={promptState.value}
                  placeholder={promptState.placeholder}
                  onChange={(e) =>
                    setPromptState((s) => (s ? { ...s, value: e.target.value } : s))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") resolvePrompt(promptState.value);
                  }}
                  autoFocus
                />
              </div>
              <DialogFooter className="gap-2 border-t border-border bg-muted/40 px-5 py-3.5 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => resolvePrompt(null)}>
                  {promptState.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  type="button"
                  variant={promptState.destructive ? "destructive" : "default"}
                  onClick={() => resolvePrompt(promptState.value)}
                >
                  {promptState.confirmLabel ?? "OK"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback(): AppFeedbackContextValue {
  const ctx = useContext(AppFeedbackContext);
  if (!ctx) {
    throw new Error("useAppFeedback must be used within AppFeedbackProvider.");
  }
  return ctx;
}
