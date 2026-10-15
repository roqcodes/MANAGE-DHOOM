import { formatActionError } from "@/modules/admin/lib/format-action-error";

export type AppErrorAudience = "user" | "developer" | "network" | "auth";

export type AppErrorPresentation = {
  audience: AppErrorAudience;
  title: string;
  message: string;
  troubleshoot: string[];
  showContactDeveloper: boolean;
  /** Raw detail for developer-facing issues (shown in a subdued block). */
  technicalHint?: string;
};

function extractRawMessage(error: unknown): string {
  if (error == null) return "";
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "string") return error.trim();
  return String(error).trim();
}

function isTechnicalRaw(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes("typeerror") ||
    lower.includes("referenceerror") ||
    lower.includes("syntaxerror") ||
    lower.includes("unexpected token") ||
    lower.includes("is not a function") ||
    lower.includes("cannot read properties") ||
    lower.includes("pgrst") ||
    lower.includes("internal server error") ||
    lower.includes("database error") ||
    lower.includes("sqlstate") ||
    lower.includes("stack trace") ||
    /\b500\b/.test(lower) ||
    lower.includes("econnrefused") ||
    lower.includes("non-json") ||
    lower.includes("<!doctype")
  );
}

function isNetworkRaw(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("load failed") ||
    lower.includes("networkrequestfailed") ||
    lower.includes("offline") ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  );
}

function isAuthRaw(raw: string, formatted: string): boolean {
  const lower = raw.toLowerCase();
  const f = formatted.toLowerCase();
  return (
    f.includes("sign in again") ||
    f.includes("admin access") ||
    lower.includes("jwt") ||
    lower.includes("unauthorized") ||
    lower.includes("permission denied")
  );
}

const NETWORK_TROUBLESHOOT = [
  "Check Wi‑Fi or mobile data.",
  "Wait a moment, then try again.",
  "If you use a VPN, try turning it off briefly.",
];

const AUTH_TROUBLESHOOT = [
  "Sign out and sign in again.",
  "If the problem continues, ask an admin to check your role.",
];

const USER_TROUBLESHOOT: Record<string, string[]> = {
  validation: ["Review the highlighted fields and try again."],
  notFound: ["Refresh the page — the item may have been removed."],
  permission: ["Ask a manager if you need access to this area."],
};

export function presentAppError(
  error: unknown,
  options?: { title?: string },
): AppErrorPresentation {
  const raw = extractRawMessage(error);
  const message = formatActionError(error);
  const lower = raw.toLowerCase();
  const msgLower = message.toLowerCase();

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      audience: "network",
      title: options?.title ?? "You're offline",
      message: "This action needs an internet connection.",
      troubleshoot: NETWORK_TROUBLESHOOT,
      showContactDeveloper: false,
    };
  }

  if (isNetworkRaw(raw) || msgLower.includes("connection failed")) {
    return {
      audience: "network",
      title: options?.title ?? "Connection problem",
      message,
      troubleshoot: NETWORK_TROUBLESHOOT,
      showContactDeveloper: false,
    };
  }

  if (isAuthRaw(raw, message)) {
    return {
      audience: "auth",
      title: options?.title ?? "Session or access",
      message,
      troubleshoot: AUTH_TROUBLESHOOT,
      showContactDeveloper: false,
    };
  }

  const genericFormatted =
    message === "Something went wrong. Try again." ||
    message === "Something went wrong. Try again or contact support.";

  if (isTechnicalRaw(raw) || (genericFormatted && raw.length > 80)) {
    return {
      audience: "developer",
      title: options?.title ?? "Something went wrong",
      message:
        "An unexpected error occurred. Your data is likely safe — try again once. If this keeps happening, contact the developer.",
      troubleshoot: ["Try again in a few seconds.", "Note what you clicked just before this appeared."],
      showContactDeveloper: true,
      technicalHint: raw.length > 0 && raw !== message ? raw.slice(0, 280) : undefined,
    };
  }

  let troubleshoot = USER_TROUBLESHOOT.validation;
  if (msgLower.includes("not found")) troubleshoot = USER_TROUBLESHOOT.notFound;
  if (msgLower.includes("permission") || msgLower.includes("don't have"))
    troubleshoot = USER_TROUBLESHOOT.permission;
  if (lower.includes("cannot delete") || lower.includes("opening balance")) {
    troubleshoot = ["Resolve the listed blockers, then try again."];
  }

  return {
    audience: "user",
    title: options?.title ?? "Couldn't complete",
    message,
    troubleshoot,
    showContactDeveloper: false,
  };
}
