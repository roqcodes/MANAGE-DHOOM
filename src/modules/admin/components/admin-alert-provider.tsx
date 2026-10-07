"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatActionError } from "@/modules/admin/lib/format-action-error";
import { cn } from "@/lib/utils";

type AlertVariant = "error" | "success" | "info";

type AlertState = {
  variant: AlertVariant;
  title: string;
  message: string;
};

type AdminAlertContextValue = {
  showError: (error: unknown, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
};

const AdminAlertContext = createContext<AdminAlertContextValue | null>(null);

const VARIANT_META: Record<
  AlertVariant,
  { icon: typeof AlertCircle; iconClass: string; defaultTitle: string }
> = {
  error: {
    icon: AlertCircle,
    iconClass: "text-destructive",
    defaultTitle: "Couldn't complete",
  },
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
    defaultTitle: "Done",
  },
  info: {
    icon: Info,
    iconClass: "text-[#2563EB]",
    defaultTitle: "Note",
  },
};

export function AdminAlertProvider({ children }: { children: ReactNode }) {
  const [alert, setAlert] = useState<AlertState | null>(null);

  const close = useCallback(() => setAlert(null), []);

  const showError = useCallback((error: unknown, title?: string) => {
    setAlert({
      variant: "error",
      title: title ?? VARIANT_META.error.defaultTitle,
      message: formatActionError(error),
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

  const value = useMemo(
    () => ({ showError, showSuccess, showInfo }),
    [showError, showSuccess, showInfo],
  );

  const meta = alert ? VARIANT_META[alert.variant] : null;
  const Icon = meta?.icon ?? AlertCircle;

  return (
    <AdminAlertContext.Provider value={value}>
      {children}
      <Dialog open={alert != null} onOpenChange={(open) => !open && close()}>
        <DialogContent showCloseButton={false} className="gap-0 overflow-hidden p-0 sm:max-w-md">
          {alert && meta ? (
            <>
              <DialogHeader className="gap-3 border-b border-border px-5 py-4 text-left">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted",
                      meta.iconClass,
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 space-y-1 pr-1">
                    <DialogTitle className="text-base font-semibold leading-snug">
                      {alert.title}
                    </DialogTitle>
                    <DialogDescription className="text-sm leading-relaxed text-foreground/80">
                      {alert.message}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="flex justify-end border-t border-border bg-muted/40 px-5 py-3.5">
                <Button type="button" className="min-w-20" onClick={close}>
                  OK
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminAlertContext.Provider>
  );
}

export function useAdminAlert(): AdminAlertContextValue {
  const ctx = useContext(AdminAlertContext);
  if (!ctx) {
    throw new Error("useAdminAlert must be used within AdminAlertProvider.");
  }
  return ctx;
}
