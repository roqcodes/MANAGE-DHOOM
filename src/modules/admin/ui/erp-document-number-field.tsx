"use client";

import type { ErpDocKind } from "@/lib/erp-document-ref";
import { Input } from "@/components/ui/input";
import { AdminFormField } from "@/modules/admin/ui/admin-page";
import {
  ERP_DOC_FIELD_LABELS,
  useErpDocumentDraft,
} from "@/modules/admin/ui/use-erp-document-draft";

export function ErpDocumentNumberField({
  kind,
  value,
  enabled = true,
  resetToken = 0,
  label,
  className,
}: {
  kind: ErpDocKind;
  /** Existing number when editing; overrides draft preview. */
  value?: string | null;
  enabled?: boolean;
  resetToken?: number;
  label?: string;
  className?: string;
}) {
  const draft = useErpDocumentDraft(kind, enabled && !value, resetToken);
  const display = value?.trim() || draft?.documentNumber || "—";

  return (
    <AdminFormField label={label ?? ERP_DOC_FIELD_LABELS[kind]} className={className}>
      <Input
        readOnly
        value={display}
        className="bg-muted/40 font-mono text-sm text-foreground tabular-nums"
        aria-readonly
      />
    </AdminFormField>
  );
}

export function useErpDocumentDraftId(kind: ErpDocKind, enabled = true): string | undefined {
  const draft = useErpDocumentDraft(kind, enabled);
  return draft?.draftId;
}
