import { formatActionError } from "@/modules/admin/lib/format-action-error";

/** @deprecated Prefer `useFormFeedback().submitError` so errors use the feedback modal. */
export function actionErrorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error == null) return fallback;
  return formatActionError(error);
}
