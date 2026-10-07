/**
 * Best-effort persistent storage for IndexedDB (not a durability guarantee).
 */
export async function requestOutboxPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
