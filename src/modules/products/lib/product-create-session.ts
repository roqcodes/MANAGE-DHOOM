"use client";

import { useCallback, useEffect, useRef } from "react";

export function newProductCreateOperationId(): string {
  return crypto.randomUUID();
}

/** Stable operation id + synchronous in-flight guard for product create modals. */
export function useProductCreateSession(open: boolean) {
  const operationIdRef = useRef<string>(newProductCreateOperationId());
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (open) {
      operationIdRef.current = newProductCreateOperationId();
      inFlightRef.current = false;
    }
  }, [open]);

  const resetOperation = useCallback(() => {
    operationIdRef.current = newProductCreateOperationId();
    inFlightRef.current = false;
  }, []);

  const begin = useCallback((): string | null => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    return operationIdRef.current;
  }, []);

  const end = useCallback(() => {
    inFlightRef.current = false;
  }, []);

  const getOperationId = useCallback(() => operationIdRef.current, []);

  return { begin, end, resetOperation, getOperationId };
}
