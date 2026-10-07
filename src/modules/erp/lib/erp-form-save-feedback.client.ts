"use client";

import { dispatchOutboxSaveFeedback } from "@/lib/sync/outbox-activity-feedback";

export type ErpLocalSaveFeedbackOptions = {
  entityLabel: string;
  mode: "create" | "update";
  /** Invoice finalize / post-on-sync flows. */
  queuedForPost?: boolean;
};

/** Instant “saved” feedback in the sync activity bar (forms reset immediately on create). */
export function notifyErpLocalFormSaved(options: ErpLocalSaveFeedbackOptions): void {
  const message = options.mode === "create" ? "Saved" : "Updated";
  let detail = options.entityLabel;
  if (options.queuedForPost) {
    detail = `${detail} · will post when synchronized`;
  } else {
    detail = `${detail} · pending sync`;
  }
  dispatchOutboxSaveFeedback({ message, detail });
}
