"use client";

import { useEffect, useRef, useState } from "react";

import {
  OUTBOX_SAVE_FEEDBACK_EVENT,
  type OutboxSaveFeedbackDetail,
} from "@/lib/sync/outbox-activity-feedback";

const DEFAULT_FLASH_MS = 4_500;

export function useOutboxSaveFeedback(): OutboxSaveFeedbackDetail | null {
  const [flash, setFlash] = useState<OutboxSaveFeedbackDetail | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function onFeedback(event: Event) {
      const detail = (event as CustomEvent<OutboxSaveFeedbackDetail>).detail;
      if (!detail?.message) return;

      setFlash(detail);
      if (clearTimerRef.current != null) {
        window.clearTimeout(clearTimerRef.current);
      }
      const duration = detail.durationMs ?? DEFAULT_FLASH_MS;
      clearTimerRef.current = window.setTimeout(() => {
        setFlash(null);
        clearTimerRef.current = null;
      }, duration);
    }

    window.addEventListener(OUTBOX_SAVE_FEEDBACK_EVENT, onFeedback);
    return () => {
      window.removeEventListener(OUTBOX_SAVE_FEEDBACK_EVENT, onFeedback);
      if (clearTimerRef.current != null) {
        window.clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  return flash;
}
