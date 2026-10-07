import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { Json } from "@/lib/integrations/supabase/types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { createErpInvoice } from "@/modules/erp/services/erp-invoices.service";
import { resolveErpStoreId } from "@/modules/erp/services/store-context.service";

import type { RecurringScheduleRow } from "@/common/erp/types";

function addFrequency(date: string, frequency: RecurringScheduleRow["frequency"]): string {
  const d = new Date(date);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function isMissingTableError(message: string): boolean {
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("erp_recurring_schedules")
  );
}

export async function listRecurringSchedules(storeId?: string): Promise<RecurringScheduleRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const activeStoreId = await resolveErpStoreId(storeId);
  let query = supabase
    .from("erp_recurring_schedules")
    .select(
      "*, customer:users!erp_recurring_schedules_customer_id_fkey(name), vendor:vendors!erp_recurring_schedules_vendor_id_fkey(name)",
    )
    .order("next_run_date", { ascending: true });
  if (activeStoreId) query = query.eq("store_id", activeStoreId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const customer = row.customer as { name: string | null } | null;
    const vendor = row.vendor as { name: string | null } | null;
    const { customer: _c, vendor: _v, ...rest } = row as Record<string, unknown>;
    return {
      ...(rest as RecurringScheduleRow),
      customer_name: customer?.name ?? null,
      vendor_name: vendor?.name ?? null,
    };
  });
}

export async function createRecurringSchedule(input: {
  scheduleType: "invoice" | "purchase_bill";
  name: string;
  storeId?: string;
  customerId?: string;
  vendorId?: string;
  frequency: RecurringScheduleRow["frequency"];
  nextRunDate: string;
  payload?: Record<string, unknown>;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_recurring_schedules")
    .insert({
      schedule_type: input.scheduleType,
      name: input.name,
      store_id: input.storeId ?? null,
      customer_id: input.customerId ?? null,
      vendor_id: input.vendorId ?? null,
      frequency: input.frequency,
      next_run_date: input.nextRunDate,
      payload: (input.payload ?? {}) as Json,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateRecurringSchedule(
  scheduleId: string,
  input: {
    scheduleType?: "invoice" | "purchase_bill";
    name?: string;
    storeId?: string | null;
    customerId?: string | null;
    vendorId?: string | null;
    frequency?: RecurringScheduleRow["frequency"];
    nextRunDate?: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("erp_recurring_schedules")
    .update({
      ...(input.scheduleType !== undefined ? { schedule_type: input.scheduleType } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.storeId !== undefined ? { store_id: input.storeId } : {}),
      ...(input.customerId !== undefined ? { customer_id: input.customerId } : {}),
      ...(input.vendorId !== undefined ? { vendor_id: input.vendorId } : {}),
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.nextRunDate !== undefined ? { next_run_date: input.nextRunDate } : {}),
      ...(input.payload !== undefined ? { payload: input.payload as Json } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId);

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update",
    entityType: "recurring_schedule",
    entityId: scheduleId,
    description: `Updated recurring schedule ${input.name ?? scheduleId}`,
    storeId: input.storeId ?? undefined,
  });
}

async function resolveRecurringProductId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  line: Record<string, unknown>,
): Promise<string | undefined> {
  const productId = line.productId as string | undefined;
  if (productId) return productId;
  const variantId = line.variantId as string | undefined;
  if (!variantId) return undefined;
  const { data } = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("id", variantId)
    .maybeSingle();
  return data?.product_id ?? undefined;
}

export async function runRecurringSchedule(scheduleId: string): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data: schedule, error } = await supabase
    .from("erp_recurring_schedules")
    .select("*")
    .eq("id", scheduleId)
    .single();
  if (error || !schedule) throw new Error(error?.message ?? "Schedule not found");

  const payload = (schedule.payload ?? {}) as Record<string, unknown>;
  let createdId = "";

  if (schedule.schedule_type === "invoice") {
    if (!schedule.customer_id) throw new Error("Customer is required for recurring invoices.");
    const lines = (payload.lines as Array<Record<string, unknown>>) ?? [];
    if (lines.length === 0) throw new Error("Schedule payload must include lines.");

    const invoiceLines = await Promise.all(
      lines.map(async (line) => ({
        productId: await resolveRecurringProductId(supabase, line),
        productName: String(line.productName ?? "Recurring item"),
        description: line.description as string | undefined,
        quantity: Number(line.quantity ?? 1),
        unitPrice: Number(line.unitPrice ?? 0),
        taxRatePercent: Number(line.taxRatePercent ?? 0),
      })),
    );

    createdId = await createErpInvoice({
      userId: schedule.customer_id,
      storeId: schedule.store_id ?? undefined,
      invoiceDate: schedule.next_run_date,
      dueDate: addFrequency(schedule.next_run_date, schedule.frequency as RecurringScheduleRow["frequency"]),
      lines: invoiceLines,
      discount: Number(payload.discount ?? 0),
      taxInclusive: Boolean(payload.taxInclusive),
      notes: String(payload.notes ?? `Recurring: ${schedule.name}`),
      finalize: true,
    });
  } else {
    const { createPurchaseBill } = await import("@/modules/erp/services/erp-purchase-bills.service");
    if (!schedule.vendor_id) throw new Error("Vendor is required for recurring bills.");
    const lines = (payload.lines as Array<Record<string, unknown>>) ?? [];
    if (lines.length === 0) throw new Error("Schedule payload must include lines.");

    const billLines = await Promise.all(
      lines.map(async (line) => {
        const purchasePrice = Number(line.purchasePrice ?? line.unitPrice ?? 0);
        return {
          productId: await resolveRecurringProductId(supabase, line),
          productName: String(line.productName ?? "Recurring item"),
          quantity: Number(line.quantity ?? 1),
          purchasePrice,
          taxRatePercent: Number(line.taxRatePercent ?? 0),
        };
      }),
    );

    createdId = await createPurchaseBill({
      vendorId: schedule.vendor_id,
      storeId: schedule.store_id ?? undefined,
      purchaseDate: schedule.next_run_date,
      dueDate: addFrequency(schedule.next_run_date, schedule.frequency as RecurringScheduleRow["frequency"]),
      lines: billLines,
      notes: String(payload.notes ?? `Recurring: ${schedule.name}`),
      finalize: true,
    });
  }

  const nextRun = addFrequency(schedule.next_run_date, schedule.frequency as RecurringScheduleRow["frequency"]);
  await supabase
    .from("erp_recurring_schedules")
    .update({
      last_run_date: schedule.next_run_date,
      next_run_date: nextRun,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId);

  await logAuditEvent({
    action: "recurring_run",
    entityType: schedule.schedule_type,
    entityId: createdId,
    description: `Ran recurring schedule ${schedule.name}`,
    storeId: schedule.store_id ?? undefined,
  });

  return createdId;
}

export async function toggleRecurringSchedule(scheduleId: string, isActive: boolean): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("erp_recurring_schedules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", scheduleId);
  if (error) throw new Error(error.message);
}

export async function deleteRecurringSchedule(scheduleId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("erp_recurring_schedules").delete().eq("id", scheduleId);
  if (error) throw new Error(error.message);
}
