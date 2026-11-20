"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";

import type { UserProfile } from "@/common/auth/types";
import { getSupabaseEnvOptional } from "@/lib/integrations/supabase/env";
import { tryCreateSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { useAdminSession } from "@/modules/admin/providers/admin-session-provider";
import {
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  TEAM_PRESENCE_CHANNEL,
} from "@/modules/presence/lib/presence-constants";
import {
  pingTeamPresenceSession,
  sendTeamPresenceEndBeacon,
  startTeamPresenceSession,
} from "@/modules/presence/lib/presence-client";
import {
  createPresenceGenerationId,
  getOrCreatePresenceSessionKey,
  getOrCreatePresenceTabId,
} from "@/modules/presence/lib/presence-session-key.client";
import type {
  OnlineTeamMember,
  PresenceConnectionStatus,
  TeamPresenceMeta,
} from "@/modules/presence/types";

type TeamPresenceValue = {
  members: OnlineTeamMember[];
  status: PresenceConnectionStatus;
};

const TeamPresenceContext = createContext<TeamPresenceValue>({
  members: [],
  status: "connecting",
});

export function useTeamPresence() {
  return useContext(TeamPresenceContext);
}

function aggregatePresence(
  state: Record<string, TeamPresenceMeta[]>,
): OnlineTeamMember[] {
  const members: OnlineTeamMember[] = [];

  for (const [key, presences] of Object.entries(state)) {
    if (!presences || presences.length === 0) continue;

    // A repeated track() can leave multiple metas for one Realtime key. A
    // browser tab has one stable tab_id, so count it only once.
    const uniqueTabs = Array.from(
      new Map(
        presences.map((presence, index) => [
          presence.tab_id || `presence:${index}`,
          presence,
        ]),
      ).values(),
    );
    const first = uniqueTabs[0]!;

    members.push({
      userId: first.user_id || key,
      name: first.name || first.email || "Team member",
      email: first.email ?? null,
      role: first.role ?? null,
      onlineAt: first.online_at || new Date().toISOString(),
      tabs: uniqueTabs.length,
    });
  }

  return members.sort((a, b) => {
    const byOnlineAt = a.onlineAt.localeCompare(b.onlineAt);
    return byOnlineAt !== 0 ? byOnlineAt : a.name.localeCompare(b.name);
  });
}

/**
 * Mounts the single Realtime Presence channel for the admin app. Live online
 * state costs zero database reads/writes; the session start/end calls only
 * maintain the login/logout history table.
 */
export function TeamPresenceProvider({ children }: { children: ReactNode }) {
  const profile = useAdminSession();

  if (!profile) return <>{children}</>;

  return (
    <TeamPresenceProviderInner profile={profile}>
      {children}
    </TeamPresenceProviderInner>
  );
}

function TeamPresenceProviderInner({
  profile,
  children,
}: {
  profile: UserProfile;
  children: ReactNode;
}) {
  const [members, setMembers] = useState<OnlineTeamMember[]>([]);
  const [status, setStatus] = useState<PresenceConnectionStatus>(() =>
    // Pure env read: keeps the SSR markup and the hydrated client in sync.
    getSupabaseEnvOptional() ? "connecting" : "unavailable",
  );

  const profileRef = useRef(profile);

  // Refs keep the Realtime callbacks on the latest values without
  // re-subscribing the channel when the profile object identity changes.
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const onlineAtRef = useRef(new Date().toISOString());
  const generationIdRef = useRef<string | null>(null);
  if (!generationIdRef.current) {
    generationIdRef.current = createPresenceGenerationId();
  }
  const subscribedRef = useRef(false);

  useEffect(() => {
    const tabId = getOrCreatePresenceTabId();
    let sessionKey: string | null = null;
    let disposed = false;

    function handlePageHideClose() {
      if (sessionKey) {
        sendTeamPresenceEndBeacon(
          sessionKey,
          "last_tab_closed",
          tabId,
          generationIdRef.current!,
        );
      }
    }

    const handlePageHide = (event: PageTransitionEvent) => {
      // bfcache retains this tab and its server-side tab record.
      if (!event.persisted) handlePageHideClose();
    };

    window.addEventListener("pagehide", handlePageHide);

    let heartbeatTimer: number | null = null;
    let lastPingMs = Date.now();

    const doPing = async () => {
      if (disposed || !sessionKey) return;
      lastPingMs = Date.now();
      const alive = await pingTeamPresenceSession(sessionKey, tabId, generationIdRef.current!);
      if (!alive && !disposed && sessionKey) {
        // If the session was closed or not found, resume/re-register it
        void startTeamPresenceSession(sessionKey, tabId, generationIdRef.current!);
      }
    };

    const handleActivity = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        if (Date.now() - lastPingMs > PRESENCE_HEARTBEAT_INTERVAL_MS * 0.7) {
          void doPing();
        }
      }
    };

    window.addEventListener("visibilitychange", handleActivity);
    window.addEventListener("focus", handleActivity);
    window.addEventListener("pointerdown", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });

    void getOrCreatePresenceSessionKey().then((key) => {
      if (disposed) return;
      sessionKey = key;
      void startTeamPresenceSession(key, tabId, generationIdRef.current!);
      heartbeatTimer = window.setInterval(doPing, PRESENCE_HEARTBEAT_INTERVAL_MS);
    });

    const supabase = tryCreateSupabaseBrowserClient();
    if (!supabase) {
      return () => {
        disposed = true;
        if (heartbeatTimer) window.clearInterval(heartbeatTimer);
        window.removeEventListener("pagehide", handlePageHide);
        window.removeEventListener("visibilitychange", handleActivity);
        window.removeEventListener("focus", handleActivity);
        window.removeEventListener("pointerdown", handleActivity);
        window.removeEventListener("keydown", handleActivity);
      };
    }

    const channel = supabase.channel(TEAM_PRESENCE_CHANNEL, {
      config: { presence: { key: profileRef.current.id } },
    });
    const publish = () => {
      if (!subscribedRef.current) return;

      const current = profileRef.current;
      void channel.track({
        user_id: current.id,
        name: current.name ?? current.email ?? "Team member",
        email: current.email ?? null,
        role: current.role ?? null,
        online_at: onlineAtRef.current,
        tab_id: tabId,
      } satisfies TeamPresenceMeta);
    };
    const sync = () => {
      setMembers(aggregatePresence(channel.presenceState<TeamPresenceMeta>()));
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((nextStatus) => {
        switch (nextStatus) {
          case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
            subscribedRef.current = true;
            setStatus("live");
            publish();
            sync();
            break;
          case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
          case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
            subscribedRef.current = false;
            setStatus("reconnecting");
            break;
          case REALTIME_SUBSCRIBE_STATES.CLOSED:
            subscribedRef.current = false;
            setStatus("offline");
            break;
          default:
            setStatus("connecting");
        }
      });

    return () => {
      disposed = true;
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("visibilitychange", handleActivity);
      window.removeEventListener("focus", handleActivity);
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      subscribedRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [profile.id]);

  const value = useMemo(() => ({ members, status }), [members, status]);

  return (
    <TeamPresenceContext.Provider value={value}>
      {children}
    </TeamPresenceContext.Provider>
  );
}
