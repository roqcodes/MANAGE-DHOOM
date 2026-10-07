import "server-only";

import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export interface Address {
  id: string;
  user_id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  is_default: boolean;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAddressInput {
  label: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  is_default?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface UpdateAddressInput {
  label?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  is_default?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Get all addresses for current user.
 */
export async function getAddresses(): Promise<Address[]> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_addresses_for_user", {
    p_user_id: user.id,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as Address[]) || [];
}

/**
 * Get single address by ID for current user.
 */
export async function getAddressById(addressId: string): Promise<Address | null> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("id", addressId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Address | null;
}

/**
 * Create new address for current user.
 */
export async function createAddress(
  input: CreateAddressInput,
): Promise<Address> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  // Validate required fields
  if (!input.label.trim()) {
    throw new Error("Label is required");
  }
  if (!input.line1.trim()) {
    throw new Error("Line 1 is required");
  }
  if (!input.city.trim()) {
    throw new Error("City is required");
  }
  if (!input.state.trim()) {
    throw new Error("State is required");
  }
  if (!input.pincode.trim()) {
    throw new Error("Pincode is required");
  }
  if (!input.phone.trim()) {
    throw new Error("Phone is required");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_address", {
    p_user_id: user.id,
    p_label: input.label.trim(),
    p_line1: input.line1.trim(),
    p_line2: input.line2?.trim() ?? "",
    p_city: input.city.trim(),
    p_state: input.state.trim(),
    p_pincode: input.pincode.trim(),
    p_phone: input.phone.trim(),
    p_is_default: input.is_default ?? false,
    p_latitude: input.latitude ?? undefined,
    p_longitude: input.longitude ?? undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as Address;
}

/**
 * Update existing address for current user.
 */
export async function updateAddress(
  addressId: string,
  input: UpdateAddressInput,
): Promise<Address | null> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("update_address", {
    p_user_id: user.id,
    p_address_id: addressId,
    p_label: input.label?.trim() ?? "",
    p_line1: input.line1?.trim() ?? "",
    p_line2: input.line2?.trim() ?? "",
    p_city: input.city?.trim() ?? "",
    p_state: input.state?.trim() ?? "",
    p_pincode: input.pincode?.trim() ?? "",
    p_phone: input.phone?.trim() ?? "",
    p_is_default: input.is_default ?? false,
    p_latitude: input.latitude ?? undefined,
    p_longitude: input.longitude ?? undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as Address | null;
}

/**
 * Delete address for current user.
 */
export async function deleteAddress(addressId: string): Promise<boolean> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("delete_address", {
    p_user_id: user.id,
    p_address_id: addressId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as boolean;
}

/**
 * Set default address for current user.
 */
export async function setDefaultAddress(addressId: string): Promise<Address> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("set_default_address", {
    p_user_id: user.id,
    p_address_id: addressId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as Address;
}

/**
 * Get default address for current user.
 */
export async function getDefaultAddress(): Promise<Address | null> {
  const { user } = await getCurrentSessionProfile();
  if (!user) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Address | null;
}
