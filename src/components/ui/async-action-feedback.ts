"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const ASYNC_ACTION_SUCCESS_MS = 2000;

export type AsyncActionPhase = "idle" | "loading" | "success";

export function isUserAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useAsyncActionFeedback(successMs = ASYNC_ACTION_SUCCESS_MS) {
  const [phase, setPhase] = useState<AsyncActionPhase>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const run = useCallback(
    async (action: () => void | Promise<void>) => {
      if (phase === "loading") return;
      setPhase("loading");
      try {
        await action();
        setPhase("success");
        if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
        resetTimerRef.current = setTimeout(() => setPhase("idle"), successMs);
      } catch (error) {
        setPhase("idle");
        throw error;
      }
    },
    [phase, successMs],
  );

  return {
    phase,
    run,
    isLoading: phase === "loading",
    isSuccess: phase === "success",
  };
}

export const asyncActionSuccessClass =
  "text-emerald-600 transition-colors duration-200 dark:text-emerald-400";

export const asyncActionCheckClass =
  "size-4 animate-in zoom-in-50 duration-300 motion-reduce:animate-none";