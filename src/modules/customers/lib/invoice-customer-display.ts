export type InvoiceCustomerUser = {
  name?: string | null;
  company_name?: string | null;
  email?: string | null;
};

/** Company legal name only (tax document header / Bill To name row). */
export function invoiceCustomerCompanyLine(
  user: InvoiceCustomerUser | null | undefined,
  fallback = "—",
): string {
  return user?.company_name?.trim() || fallback;
}

/** Primary buyer line on tax invoices (company legal name when set). */
export function invoiceCustomerDisplayName(
  user: InvoiceCustomerUser | null | undefined,
  fallback = "—",
): string {
  const company = user?.company_name?.trim();
  if (company) return company;
  const person = user?.name?.trim();
  if (person) return person;
  const email = user?.email?.trim();
  if (email) return email;
  return fallback;
}

/** Contact person when company is the primary line. */
export function invoiceCustomerContactName(
  user: InvoiceCustomerUser | null | undefined,
): string | null {
  const company = user?.company_name?.trim();
  const person = user?.name?.trim();
  if (!company || !person || company === person) return null;
  return person;
}