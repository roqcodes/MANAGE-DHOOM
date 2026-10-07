interface AuthAuditEntry {
  action: "sign_in" | "request_access" | "sign_out";
  email?: string;
  userId?: string;
  role?: string;
  outcome: "success" | "failure";
  reason?: string;
}

export async function recordAuthAudit(entry: AuthAuditEntry) {
  console.info("[auth-audit]", {
    ...entry,
    timestamp: new Date().toISOString(),
  });
}
