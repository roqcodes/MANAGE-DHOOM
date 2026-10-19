export type ErpDocumentCreateOutcome = {
  documentId: string;
  finalized: boolean;
  /** Draft exists but finalize step failed (stock/posting not applied). */
  finalizeFailed?: boolean;
  finalizeError?: string;
};

export function draftFinalizeUserMessage(
  entityLabel: string,
  documentId: string,
  detailPath: string,
  finalizeError?: string,
): string {
  const reason = finalizeError ? ` ${finalizeError}` : "";
  return `${entityLabel} saved as draft (ID ${documentId.slice(0, 8)}…). Open ${detailPath} to finalize.${reason}`;
}
