const SYNC_WAKE_CHANNEL = "buyhub-outbox-sync-wake";

export type NetworkSyncCallbacks = {
  onWake: () => void;
};

export function isBrowserOnlineHint(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }
  return navigator.onLine !== false;
}

export function attachNetworkSyncListeners(
  callbacks: NetworkSyncCallbacks,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const wake = () => {
    if (isBrowserOnlineHint()) {
      callbacks.onWake();
    }
  };

  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      wake();
    }
  });

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(SYNC_WAKE_CHANNEL);
    channel.onmessage = () => wake();
  }

  return () => {
    window.removeEventListener("online", wake);
    channel?.close();
  };
}

export function broadcastSyncWake(): void {
  if (typeof BroadcastChannel === "undefined") {
    return;
  }
  const channel = new BroadcastChannel(SYNC_WAKE_CHANNEL);
  channel.postMessage({ type: "wake" });
  channel.close();
}
