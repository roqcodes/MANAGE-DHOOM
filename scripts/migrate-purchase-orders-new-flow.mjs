/**
 * Scripts to migrate existing purchase orders into the new lifecycle:
 *
 * Old statuses:
 *   'pending' / 'accepted' -> 'production' (Enables "Ready For Pickup")
 *   'delivered' (unfinalized) -> 'received' (Enables "Generate Invoice")
 *
 * Usage:
 *   node scripts/migrate-purchase-orders-new-flow.mjs
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function run() {
  console.log("Checking purchase orders for migration...");

  // 1. Move pending/accepted -> production
  const { data: toProduction, error: err1 } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status")
    .in("status", ["pending", "accepted"]);

  if (err1) {
    console.error("Failed to query pending/accepted POs:", err1.message);
    process.exit(1);
  }

  console.log(`Found ${toProduction?.length ?? 0} POs in pending/accepted status.`);

  if (toProduction && toProduction.length > 0) {
    const ids = toProduction.map((p) => p.id);
    const { error: updateErr1 } = await supabase
      .from("purchase_orders")
      .update({ status: "production", updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updateErr1) {
      console.error("Failed to update POs to production:", updateErr1.message);
      process.exit(1);
    }
    console.log(`Successfully migrated ${ids.length} POs to 'production'.`);
  }

  // 2. Move unfinalized 'delivered' -> 'received'
  const { data: deliveredPos, error: err2 } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status")
    .eq("status", "delivered");

  if (err2) {
    console.error("Failed to query delivered POs:", err2.message);
    process.exit(1);
  }

  if (deliveredPos && deliveredPos.length > 0) {
    // Check which ones do not have finalized receives
    const { data: receives } = await supabase
      .from("erp_purchase_receives")
      .select("po_id")
      .eq("status", "finalized");

    const finalizedPoIds = new Set((receives ?? []).map((r) => r.po_id));
    const toReceived = deliveredPos.filter((p) => !finalizedPoIds.has(p.id));

    if (toReceived.length > 0) {
      const ids = toReceived.map((p) => p.id);
      const { error: updateErr2 } = await supabase
        .from("purchase_orders")
        .update({ status: "received", updated_at: new Date().toISOString() })
        .in("id", ids);

      if (updateErr2) {
        console.error("Failed to update delivered POs to received:", updateErr2.message);
        process.exit(1);
      }
      console.log(`Successfully migrated ${ids.length} unfinalized 'delivered' POs to 'received'.`);
    } else {
      console.log("No unfinalized 'delivered' POs needed migration.");
    }
  }

  console.log("Migration complete!");
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
