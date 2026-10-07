import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams;
  const transferId = typeof sp.transferId === "string" ? sp.transferId : undefined;
  return (
    <ErpFormRouteRedirect
      listPath="/admin/erp/transfer-bulk-payments"
      form="new"
      extra={transferId ? { transferId } : undefined}
    />
  );
}
