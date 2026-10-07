import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function pickString(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return typeof value === "string" ? value : undefined;
}

export default async function AdminErpPaymentNewPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const extra: Record<string, string> = {};
  for (const key of ["invoiceId", "customerId", "advance"] as const) {
    const value = pickString(sp, key);
    if (value) extra[key] = value;
  }
  return (
    <ErpFormRouteRedirect
      listPath="/admin/erp/payments"
      form="new"
      extra={Object.keys(extra).length > 0 ? extra : undefined}
    />
  );
}
