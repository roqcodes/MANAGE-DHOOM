import { ErpFormRouteRedirect } from "@/modules/admin/components/erp-form-route-redirect";

export default function NewSalaryPaymentPage() {
  return <ErpFormRouteRedirect listPath="/admin/erp/salary-payments" form="new" />;
}
