"use client";

/**
 * Admin shell uses the global feedback provider. Hooks stay named useAdminAlert for compatibility.
 */
export {
  AppFeedbackProvider as AdminAlertProvider,
  useAppFeedback as useAdminAlert,
  type ConfirmOptions,
  type PromptOptions,
} from "@/modules/feedback/components/app-feedback-provider";
