const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Store id for accounting integration scripts (required; never auto-picked).
 */
type AccountingStoreEnv = { ACCOUNTING_STORE_ID?: string };

export function requireAccountingStoreId(
  env: AccountingStoreEnv = process.env as AccountingStoreEnv,
): string {
  const raw = env.ACCOUNTING_STORE_ID?.trim();
  if (!raw) {
    throw new Error(
      "ACCOUNTING_STORE_ID is required for accounting integration checks. " +
        "Set it to the ERP store UUID under test (e.g. Store A).",
    );
  }
  if (!UUID_RE.test(raw)) {
    throw new Error(`ACCOUNTING_STORE_ID must be a valid UUID; got "${raw}".`);
  }
  return raw;
}
