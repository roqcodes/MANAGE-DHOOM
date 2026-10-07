import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewCustomerBulkPaymentPage() {
  return <ErpFormRouteRedirect listPath="/admin/erp/customer-bulk-payments" form="new" />;
}
