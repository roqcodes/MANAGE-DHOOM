import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewSupplierPaymentPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const billId = typeof sp.billId === "string" ? sp.billId : undefined;
  return (
    <ErpFormRouteRedirect
      listPath="/admin/erp/supplier-payments"
      form="new"
      extra={billId ? { billId } : undefined}
    />
  );
}
