import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewSupplierBulkPaymentPage() {
  return <ErpFormRouteRedirect listPath="/admin/erp/supplier-bulk-payments" form="new" />;
}
