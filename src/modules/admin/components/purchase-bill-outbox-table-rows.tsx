"use client";

import { AlertCircle, Loader2 } from "lucide-react";

import { calcPurchaseLine, roundMoney } from "@/common/erp/purchasing-types";
import { ERP_CLIENT_OPERATION_TYPES } from "@/lib/erp/client-operations/operation-types";
import { displayErpDocumentNumber } from "@/lib/erp-document-ref";
import { formatCurrencyAmount } from "@/lib/format-currency";
import {
  OUTBOX_OPERATION_STATES,
  type OutboxOperationRecord,
} from "@/lib/sync/outbox-types";
import type {
  PurchaseBillCreatePayload,
  PurchaseBillUpdatePayload,
} from "@/modules/erp/types/purchase-payload";
import {
  AdminTableCell,
  AdminTableRow,
  AdminTableDateTime,
  ErpStoreTableGlance,
  ErpVendorTableGlance,
} from "@/modules/admin/ui";
import { cn } from "@/lib/utils";

const PURCHASE_BILL_LIST_TYPES = new Set<string>([
  ERP_CLIENT_OPERATION_TYPES.purchaseBill.create,
  ERP_CLIENT_OPERATION_TYPES.purchaseBill.update,
  ERP_CLIENT_OPERATION_TYPES.purchaseBill.finalize,
]);

export { PURCHASE_BILL_LIST_TYPES };

type BillPayload = PurchaseBillCreatePayload & { storeId?: string };

function billTotalFromPayload(payload: BillPayload): number {
  let subtotal = 0;
  let tax = 0;
  for (const line of payload.lines ?? []) {
    const { taxable, taxAmount } = calcPurchaseLine(
      line.quantity,
      line.purchasePrice,
      line.taxRatePercent,
    );
    subtotal += taxable;
    tax += taxAmount;
  }
  let landed = 0;
  for (const lc of payload.landedCosts ?? []) {
    landed += calcPurchaseLine(lc.quantity, lc.rate, lc.taxRatePercent).lineTotal;
  }
  const discount = Number(payload.discount ?? 0);
  return roundMoney(Math.max(0, subtotal + tax - discount) + landed);
}

function syncStatusLabel(op: OutboxOperationRecord): string {
  switch (op.state) {
    case OUTBOX_OPERATION_STATES.SYNCING:
      return "Syncing";
    case OUTBOX_OPERATION_STATES.LOCAL_PENDING:
      return "Pending sync";
    case OUTBOX_OPERATION_STATES.RETRY_WAIT:
      return "Retry scheduled";
    default:
      return "Pending sync";
  }
}

function resolveBillPayload(op: OutboxOperationRecord): BillPayload | null {
  if (op.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.create) {
    return op.payload as BillPayload;
  }
  if (
    op.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.update ||
    op.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.finalize
  ) {
    return op.payload as PurchaseBillUpdatePayload;
  }
  return null;
}

export function filterPurchaseBillOutboxForList(
  operations: OutboxOperationRecord[],
  options: { storeId?: string | null; serverBillIds: Set<string> },
): OutboxOperationRecord[] {
  return operations.filter((op) => {
    if (!PURCHASE_BILL_LIST_TYPES.has(op.operationType)) return false;
    if (options.storeId && op.storeId !== options.storeId) return false;
    const payload = resolveBillPayload(op);
    if (!payload) return false;
    if (op.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.create) {
      return true;
    }
    const billId = (payload as PurchaseBillUpdatePayload).billId;
    return billId ? !options.serverBillIds.has(billId) : true;
  });
}

export function PurchaseBillOutboxTableRows({
  operations,
}: {
  operations: OutboxOperationRecord[];
}) {
  if (operations.length === 0) return null;

  return (
    <>
      {operations.map((op) => {
        const payload = resolveBillPayload(op);
        if (!payload) return null;
        const billId =
          op.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.create
            ? op.operationId
            : (payload as PurchaseBillUpdatePayload).billId;
        const total = billTotalFromPayload(payload);
        const shortId = op.operationId.slice(0, 8).toUpperCase();
        const status = syncStatusLabel(op);
        const displayStatus =
          op.operationType === ERP_CLIENT_OPERATION_TYPES.purchaseBill.finalize ||
          payload.finalize
            ? "finalized"
            : "draft";

        return (
          <AdminTableRow
            key={op.operationId}
            className={cn(
              "border-b border-amber-200/50 bg-amber-50/30 hover:bg-amber-50/50",
            )}
          >
            <AdminTableCell className="text-muted-foreground">
              <AdminTableDateTime
                documentDate={payload.purchaseDate}
                at={new Date(op.createdAt).toISOString()}
              />
            </AdminTableCell>
            <AdminTableCell>
              <span className="font-medium text-amber-950">
                Queued · {displayErpDocumentNumber(null, "PB", shortId)}
              </span>
            </AdminTableCell>
            <AdminTableCell>
              <ErpStoreTableGlance storeId={op.storeId} />
            </AdminTableCell>
            <AdminTableCell>—</AdminTableCell>
            <AdminTableCell>
              <ErpVendorTableGlance vendorId={payload.vendorId} />
            </AdminTableCell>
            <AdminTableCell>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  op.state === OUTBOX_OPERATION_STATES.SYNCING
                    ? "bg-sky-100 text-sky-950"
                    : "bg-amber-100/90 text-amber-950 ring-1 ring-amber-300/50",
                )}
              >
                {op.state === OUTBOX_OPERATION_STATES.SYNCING ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                ) : (
                  <AlertCircle className="size-3" aria-hidden />
                )}
                {status}
                <span className="font-normal text-amber-900/80">· {displayStatus}</span>
              </span>
            </AdminTableCell>
            <AdminTableCell align="right" className="tabular-nums text-muted-foreground">
              —
            </AdminTableCell>
            <AdminTableCell align="right" className="tabular-nums">
              {formatCurrencyAmount(total)}
            </AdminTableCell>
            <AdminTableCell align="right" className="tabular-nums">
              {formatCurrencyAmount(total)}
            </AdminTableCell>
            <AdminTableCell align="right">
              <span className="text-xs text-muted-foreground" title={billId}>
                Local
              </span>
            </AdminTableCell>
          </AdminTableRow>
        );
      })}
    </>
  );
}
