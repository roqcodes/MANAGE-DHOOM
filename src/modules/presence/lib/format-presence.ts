/** Presentation helpers for presence tables. */

export function formatPresenceDuration(
  startIso: string | null | undefined,
  endIso?: string | null,
  nowMs = Date.now(),
): string {
  if (!startIso) return "—";

  const start = Date.parse(startIso);
  if (Number.isNaN(start)) return "—";

  const end = endIso ? Date.parse(endIso) : nowMs;
  if (Number.isNaN(end)) return "—";

  const totalMinutes = Math.floor(Math.max(0, end - start) / 60_000);
  if (totalMinutes < 1) return "< 1m";

  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatPresenceTimestamp(value: string | null | undefined): string {
  if (!value) return "—";

  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "—";

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function presenceEndReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case "sign_out":
      return "Signed out";
    case "last_tab_closed":
      return "Closed tab";
    case "stale":
    case "timeout":
      return "Timed out";
    default:
      return "Active";
  }
}

export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "—";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";

  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad|iPod/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";

  return os ? `${browser} · ${os}` : browser;
}
