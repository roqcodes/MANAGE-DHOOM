/** Shared constants for team presence + session history. */

/** Single Realtime channel used by every admin tab. */
export const TEAM_PRESENCE_CHANNEL = "buyhub:team-presence";

/** HttpOnly cookie that scopes one browser session across all its tabs. */
export const PRESENCE_COOKIE_NAME = "buyhub_presence_key";

/** localStorage registry used to detect the last open tab (no DB involved). */

/** A tab that has not refreshed its registry entry in this long is considered dead. */

/** Local-only registry refresh; no network or database writes. */

/** Interval between background heartbeat pings for active tabs. */
export const PRESENCE_HEARTBEAT_INTERVAL_MS = 60_000;

/** Inactivity threshold after which an unclosed session is treated as stale. */
export const PRESENCE_STALE_THRESHOLD_MS = 180_000;

/** Retention window for login/logout history. Mirrors the SQL function. */
export const PRESENCE_HISTORY_DAYS = 30;

/** Maximum history rows returned by the API. */
export const PRESENCE_HISTORY_LIMIT = 200;

/** Delay before refreshing history after a presence join/leave settles. */
export const PRESENCE_HISTORY_REFRESH_DEBOUNCE_MS = 1_500;
