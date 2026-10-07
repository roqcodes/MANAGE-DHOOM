import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewVatPaymentPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const vatReturnId = typeof sp.vatReturnId === "string" ? sp.vatReturnId : undefined;
  return (
    <ErpFormRouteRedirect
      listPath="/admin/erp/vat-returns"
      form="new"
      extra={vatReturnId ? { vatReturnId } : undefined}
    />
  );
}
