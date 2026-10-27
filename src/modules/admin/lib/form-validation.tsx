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
  ok: boolean;
  message: string;
};

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
    const message = item.message.trim();
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
