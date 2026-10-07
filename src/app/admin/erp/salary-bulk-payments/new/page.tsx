import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewSalaryBulkPaymentPage() {
  return <ErpFormRouteRedirect listPath="/admin/erp/salary-bulk-payments" form="new" />;
}
