export const OUTBOX_CHANGED_EVENT = "buyhub-outbox-changed";

export function dispatchOutboxChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT));
}
