"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { normalizeFormFooterErrors } from "@/modules/admin/lib/form-footer-errors";

export type FieldValidationCheck = {
  key: string;
  /** Shown in the alert when `message` is omitted, e.g. "Customer is required." */
  label?: string;
  ok: boolean;
  message?: string;
};

export function fieldValidationMessage(check: FieldValidationCheck): string {
  const custom = check.message?.trim();
  if (custom) return custom;
  const label = check.label?.trim();
  if (label) return `${label} is required.`;
  return "This field is required.";
}

export function validationFeedbackTitle(errorCount: number): string {
  return errorCount > 1 ? "Missing required fields" : "Missing required field";
}

export type FieldValidationFailure = {
  fields: string[];
  messages: string[];
};

export function collectFieldValidation(
  checks: FieldValidationCheck[],
): FieldValidationFailure | null {
  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) return null;
  const seen = new Set<string>();
  const messages: string[] = [];
  for (const item of failed) {
    const message = fieldValidationMessage(item);
    if (!message || seen.has(message)) continue;
    seen.add(message);
    messages.push(message);
  }
  return {
    fields: failed.map((f) => f.key),
    messages,
  };
}

type FormValidationContextValue = {
  submitAttempted: boolean;
  invalidFields: ReadonlySet<string>;
  isFieldInvalid: (key: string) => boolean;
  markFieldValidationFailed: (fields: string[]) => void;
  clearFieldValidation: () => void;
};

const FormValidationContext = createContext<FormValidationContextValue | null>(
  null,
);

export function FormValidationScope({
  children,
  resetKey,
}: {
  children: ReactNode;
  /** Change when the form is closed or remounted to clear invalid state. */
  resetKey?: string | number | boolean;
}) {
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const markFieldValidationFailed = useCallback((fields: string[]) => {
    setSubmitAttempted(true);
    setInvalidFields(new Set(fields));
  }, []);

  const clearFieldValidation = useCallback(() => {
    setSubmitAttempted(false);
    setInvalidFields(new Set());
  }, []);

  useEffect(() => {
    clearFieldValidation();
  }, [resetKey, clearFieldValidation]);

  const isFieldInvalid = useCallback(
    (key: string) => submitAttempted && invalidFields.has(key),
    [invalidFields, submitAttempted],
  );

  const value = useMemo(
    () => ({
      submitAttempted,
      invalidFields,
      isFieldInvalid,
      markFieldValidationFailed,
      clearFieldValidation,
    }),
    [
      submitAttempted,
      invalidFields,
      isFieldInvalid,
      markFieldValidationFailed,
      clearFieldValidation,
    ],
  );

  return (
    <FormValidationContext.Provider value={value}>
      {children}
    </FormValidationContext.Provider>
  );
}

export function useFormFieldValidation() {
  const ctx = useContext(FormValidationContext);
  if (!ctx) {
    return {
      submitAttempted: false,
      invalidFields: new Set<string>() as ReadonlySet<string>,
      isFieldInvalid: () => false,
      markFieldValidationFailed: () => {},
      clearFieldValidation: () => {},
      hasScope: false as const,
    };
  }
  return { ...ctx, hasScope: true as const };
}

/**
 * Run checks, mark invalid fields, and return normalized error messages for the footer modal.
 * Returns `null` when validation passes.
 */
export function applyFieldValidation(
  checks: FieldValidationCheck[],
  markFieldValidationFailed: (fields: string[]) => void,
  clearFieldValidation: () => void,
): string[] | null {
  const failure = collectFieldValidation(checks);
  if (!failure) {
    clearFieldValidation();
    return null;
  }
  markFieldValidationFailed(failure.fields);
  return normalizeFormFooterErrors(failure.messages);
}

export type ValidateBeforeFormSaveActions = {
  markFieldValidationFailed: (fields: string[]) => void;
  clearFieldValidation: () => void;
  /** Pass `null` to clear validation errors (also dismisses the validation alert). */
  setFormErrors: (errors: string[] | null) => void;
};

/**
 * Clears prior form errors, runs validation, and blocks save when invalid.
 * Returns `true` only when every check passes (field highlights are cleared).
 */
export function validateBeforeFormSave(
  checks: FieldValidationCheck[],
  actions: ValidateBeforeFormSaveActions,
): boolean {
  actions.setFormErrors(null);
  const messages = applyFieldValidation(
    checks,
    actions.markFieldValidationFailed,
    actions.clearFieldValidation,
  );
  if (messages) {
    actions.setFormErrors(messages);
    return false;
  }
  return true;
}

/** Adapter for forms that store errors as `string | string[] | null`. */
export function formErrorsAdapter(
  setError: (value: string | string[] | null) => void,
): (errors: string[] | null) => void {
  return (errors) => {
    if (!errors || errors.length === 0) {
      setError(null);
      return;
    }
    setError(errors.length === 1 ? errors[0] : errors);
  };
}

/** Adapter for forms that store errors as `string[]`. */
export function formErrorsListAdapter(
  setErrors: (value: string[]) => void,
): (errors: string[] | null) => void {
  return (errors) => {
    setErrors(errors ?? []);
  };
}

/** Call after a successful save to clear error state and field highlights. */
export function clearFormSubmitFeedback(actions: {
  setFormErrors: (errors: string[] | null) => void;
  clearFieldValidation: () => void;
}) {
  actions.setFormErrors(null);
  actions.clearFieldValidation();
}
