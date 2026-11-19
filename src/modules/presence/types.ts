/** Payload each tab publishes to the Realtime Presence channel. */
export type TeamPresenceMeta = {
  user_id: string;
  name: string;
  email: string | null;
  role: string | null;
  online_at: string;
  tab_id: string;
};

/** Aggregated presence for one user (all their open tabs). */
export type OnlineTeamMember = {
  userId: string;
  name: string;
  email: string | null;
  role: string | null;
  onlineAt: string;
  tabs: number;
};

export type PresenceConnectionStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline"
  | "unavailable";

export type PresenceEndReason =
  | "sign_out"
  | "last_tab_closed"
  | "stale"
  | "timeout";

/** One row of `public.user_sessions` joined with the user profile. */
export type PresenceSessionRow = {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  login_at: string;
  logout_at: string | null;
  last_seen_at: string;
  ended_reason: string | null;
  user_agent: string | null;
};

export type PresenceHistoryResponse = {
  sessions: PresenceSessionRow[];
  days: number;
};
