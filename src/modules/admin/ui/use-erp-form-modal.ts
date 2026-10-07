"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ErpFormModalMode = "new" | "edit";

type PendingNavigation = {
  form: ErpFormModalMode;
  id?: string;
};

export function useErpFormModal(listPath?: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const basePath = listPath ?? pathname;
  const formMode = searchParams.get("form") as ErpFormModalMode | null;
  const editId = searchParams.get("id");
  const urlOpen = formMode === "new" || (formMode === "edit" && Boolean(editId));

  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (urlOpen) {
      setPendingNavigation(null);
      setDismissed(false);
    }
  }, [urlOpen, formMode, editId]);

  const isOpen = urlOpen || pendingNavigation !== null;
  const dialogOpen = isOpen && !dismissed;

  const resolvedFormMode = formMode ?? pendingNavigation?.form ?? null;
  const resolvedEditId = editId ?? pendingNavigation?.id ?? null;

  const extraParams = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("form");
    params.delete("id");
    return params;
  }, [searchParams]);

  const buildUrl = useCallback(
    (form: ErpFormModalMode | null, id?: string | null, extra?: Record<string, string>) => {
      const params = new URLSearchParams(extraParams.toString());
      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          if (value) params.set(key, value);
        }
      }
      if (form) {
        params.set("form", form);
        if (form === "edit" && id) params.set("id", id);
      }
      const qs = params.toString();
      return qs ? `${basePath}?${qs}` : basePath;
    },
    [basePath, extraParams],
  );

  const openNew = useCallback(
    (extra?: Record<string, string>) => {
      setDismissed(false);
      setPendingNavigation({ form: "new" });
      router.push(buildUrl("new", null, extra), { scroll: false });
    },
    [router, buildUrl],
  );

  const openEdit = useCallback(
    (id: string, extra?: Record<string, string>) => {
      setDismissed(false);
      setPendingNavigation({ form: "edit", id });
      router.push(buildUrl("edit", id, extra), { scroll: false });
    },
    [router, buildUrl],
  );

  const close = useCallback(() => {
    setDismissed(true);
    setPendingNavigation(null);
    router.push(buildUrl(null), { scroll: false });
  }, [router, buildUrl]);

  return {
    isOpen,
    formMode: resolvedFormMode,
    editId: resolvedEditId,
    mode: resolvedFormMode === "edit" ? ("edit" as const) : ("create" as const),
    openNew,
    openEdit,
    close,
    modalProps: {
      open: dialogOpen,
      onOpenChange: (open: boolean) => {
        if (!open) close();
      },
    },
  };
}
