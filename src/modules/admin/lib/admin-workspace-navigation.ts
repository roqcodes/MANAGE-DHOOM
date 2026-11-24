/** Skip header “Opening page…” while workspace tab URL catches up. */
let suppressNavigationProgressUntil = 0;

export function suppressWorkspaceNavigationProgress(ms = 8_000) {
  suppressNavigationProgressUntil = Date.now() + ms;
}

export function shouldSuppressWorkspaceNavigationProgress() {
  return Date.now() < suppressNavigationProgressUntil;
}