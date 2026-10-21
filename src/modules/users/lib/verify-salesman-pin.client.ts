import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";

export type VerifiedSalesman = { id: string; name: string };

const pinCache = new Map<string, VerifiedSalesman | null>();
const inflight = new Map<string, Promise<VerifiedSalesman | null>>();

function parseVerifyResult(data: unknown): VerifiedSalesman | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { id?: string; name?: string };
  if (!row.id || !row.name) return null;
  return { id: row.id, name: row.name };
}

/** Staff-only PIN lookup (one Supabase round-trip; RPC enforces auth). */
export async function verifySalesmanPinClient(pin: string): Promise<VerifiedSalesman | null> {
  const digits = pin.replace(/\D/g, "").slice(0, 3);
  if (digits.length !== 3) return null;

  const cached = pinCache.get(digits);
  if (cached !== undefined) return cached;

  const pending = inflight.get(digits);
  if (pending) return pending;

  const request = (async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("verify_erp_salesman_pin", {
      p_pin: digits,
    });
    if (error) throw new Error(error.message);
    const salesman = parseVerifyResult(data);
    pinCache.set(digits, salesman);
    return salesman;
  })();

  inflight.set(digits, request);
  try {
    return await request;
  } finally {
    inflight.delete(digits);
  }
}

export function clearSalesmanPinVerifyCache(pin?: string) {
  if (pin) {
    const digits = pin.replace(/\D/g, "").slice(0, 3);
    pinCache.delete(digits);
    return;
  }
  pinCache.clear();
}
