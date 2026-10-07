import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  createRecurringSchedule,
  deleteRecurringSchedule,
  listRecurringSchedules,
  toggleRecurringSchedule,
  updateRecurringSchedule,
} from "@/modules/erp/services/erp-recurring.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const storeId = new URL(request.url).searchParams.get("storeId") ?? undefined;
    const data = await listRecurringSchedules(storeId);
    return NextResponse.json({ data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load schedules";
    const migrationRequired = msg.includes("schema cache") || msg.includes("does not exist");
    return NextResponse.json({ error: msg, migrationRequired }, { status: migrationRequired ? 503 : 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createRecurringSchedule(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create schedule";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (typeof body.isActive === "boolean" && body.name === undefined) {
      await toggleRecurringSchedule(id, body.isActive);
      return NextResponse.json({ ok: true });
    }
    await updateRecurringSchedule(id, {
      scheduleType: body.scheduleType,
      name: body.name,
      storeId: body.storeId ?? null,
      customerId: body.customerId ?? null,
      vendorId: body.vendorId ?? null,
      frequency: body.frequency,
      nextRunDate: body.nextRunDate,
      payload: body.payload,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await deleteRecurringSchedule(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
