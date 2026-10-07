import { SalesOrderFormView } from "@/modules/admin/views/sales/sales-order-form-view";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditSalesOrderPage({ params }: PageProps) {
  const { id } = await params;
  return <SalesOrderFormView mode="edit" orderId={id} variant="page" />;
}
