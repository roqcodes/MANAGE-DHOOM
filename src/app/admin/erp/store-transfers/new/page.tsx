import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

type PageProps = {
  searchParams: Promise<{ requestId?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { requestId } = await searchParams;
  const extra = requestId ? { requestId } : undefined;
  return (
    <ErpFormRouteRedirect
      listPath="/admin/erp/store-transfers"
      form="new"
      extra={extra}
    />
  );
}
