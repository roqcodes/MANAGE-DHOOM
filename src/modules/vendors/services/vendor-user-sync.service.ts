import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { UserRole } from "@/common/auth/types";

/**
 * Links a portal vendor user to `public.vendors` by using the same UUID as `users.id`.
 * (Schema has no `user_id` on `vendors`; supply FKs use `vendors.id`.)
 */
export async function syncVendorRowFromUser(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { data: user, error: fetchError } = await supabase
    .from("users")
    .select("id,name,email,phone,role,is_verified")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!user) return;

  if (user.role !== UserRole.Vendor || !user.is_verified) {
    return;
  }

  const name = user.name?.trim() || user.email || "Vendor";
  const contact = [user.phone, user.email].filter(Boolean).join(" · ") || null;

  const { error } = await supabase.from("vendors").upsert(
    {
      id: user.id,
      name,
      contact,
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (error) throw new Error(error.message);
}

/** When a user is no longer a verified vendor, deactivate the vendor row (keeps FK history). */
export async function deactivateVendorRowForUser(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("vendors")
    .update({ is_active: false })
    .eq("id", userId);

  if (error) throw new Error(error.message);
}

export async function deleteVendorRowForUser(userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("vendors").delete().eq("id", userId);

  if (error) throw new Error(error.message);
}
