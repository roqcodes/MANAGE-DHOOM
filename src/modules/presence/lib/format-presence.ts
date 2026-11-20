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

export function calculatePresenceDurationMinutes(
  startIso: string | null | undefined,
  endIso?: string | null,
  nowMs = Date.now(),
): number {
  if (!startIso) return 0;
  const start = Date.parse(startIso);
  if (Number.isNaN(start)) return 0;
  const end = endIso ? Date.parse(endIso) : nowMs;
  if (Number.isNaN(end)) return 0;
  return Math.floor(Math.max(0, end - start) / 60_000);
}

export function getPresenceDateKey(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatPresenceDateGroupHeader(dateKey: string): string {
  if (dateKey === "Unknown") return "Unknown Date";

  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;

  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const targetTime = target.getTime();
  const isToday = targetTime === today.getTime();
  const isYesterday = targetTime === yesterday.getTime();

  const formattedDate = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(target);

  if (isToday) return `Today · ${formattedDate}`;
  if (isYesterday) return `Yesterday · ${formattedDate}`;
  return formattedDate;
}

export function formatPresenceTime(value: string | null | undefined): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
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
