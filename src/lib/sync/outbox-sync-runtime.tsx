"use client";

import { useEffect, useRef } from "react";

import type { OperationHandlerRegistry } from "@/lib/sync/operation-handler";
import type { OutboxOperationRecord } from "@/lib/sync/outbox-types";
import { createOutboxStore } from "@/lib/sync/outbox-store";
import { createSyncEngine, type SyncEngine } from "@/lib/sync/sync-engine";

export type OutboxSyncRuntimeProps = {
  getCurrentUserId?: () => string | null | Promise<string | null>;
  handlers?: OperationHandlerRegistry;
  onOperationCommitted?: (operation: OutboxOperationRecord) => void;
};

/**
 * Starts the generic outbox sync engine in the browser (no ERP handlers).
 * Does not modify service worker behavior.
 */
export function OutboxSyncRuntime({
  getCurrentUserId,
  handlers,
  onOperationCommitted,
}: OutboxSyncRuntimeProps) {
  const engineRef = useRef<SyncEngine | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      return;
    }

    const store = createOutboxStore();
    const engine = createSyncEngine({
      store,
      getCurrentUserId,
      handlers,
    });
    const unsubCommitted = onOperationCommitted
      ? engine.on("operation-committed", ({ operation }) => {
          onOperationCommitted(operation);
        })
      : () => undefined;
    engine.start();
    engineRef.current = engine;

    return () => {
      unsubCommitted();
      engine.stop();
      engineRef.current = null;
      void engine.waitForIdle();
    };
  }, [getCurrentUserId, handlers, onOperationCommitted]);

  return null;
}
