/**
 * Future queueable ERP operation names (Phase 5+). No handlers in Phase 4.
 */
export const ERP_CLIENT_OPERATION_TYPES = {
  salesOrder: {
    create: "sales_order.create",
    update: "sales_order.update",
    cancel: "sales_order.cancel",
    convertToInvoice: "sales_order.convert_to_invoice",
  },
  salesInvoice: {
    create: "sales_invoice.create",
    update: "sales_invoice.update",
    issue: "sales_invoice.issue",
    cancel: "sales_invoice.cancel",
  },
  purchaseOrder: {
    create: "purchase_order.create",
    update: "purchase_order.update",
    deliverFinalize: "purchase_order.deliver_finalize",
  },
  purchaseBill: {
    create: "purchase_bill.create",
    update: "purchase_bill.update",
    finalize: "purchase_bill.finalize",
    cancel: "purchase_bill.cancel",
  },
  product: {
    create: "product.create",
    update: "product.update",
    variantCreate: "variant.create",
    variantUpdate: "variant.update",
  },
  /** Certification-only; not used in production ERP flows. */
  testCertify: "test.certify",
} as const;

export type ErpClientOperationType =
  | (typeof ERP_CLIENT_OPERATION_TYPES)["testCertify"]
  | (typeof ERP_CLIENT_OPERATION_TYPES)["salesOrder"][keyof typeof ERP_CLIENT_OPERATION_TYPES.salesOrder]
  | (typeof ERP_CLIENT_OPERATION_TYPES)["salesInvoice"][keyof typeof ERP_CLIENT_OPERATION_TYPES.salesInvoice]
  | (typeof ERP_CLIENT_OPERATION_TYPES)["purchaseOrder"][keyof typeof ERP_CLIENT_OPERATION_TYPES.purchaseOrder]
  | (typeof ERP_CLIENT_OPERATION_TYPES)["purchaseBill"][keyof typeof ERP_CLIENT_OPERATION_TYPES.purchaseBill]
  | (typeof ERP_CLIENT_OPERATION_TYPES)["product"][keyof typeof ERP_CLIENT_OPERATION_TYPES.product];
