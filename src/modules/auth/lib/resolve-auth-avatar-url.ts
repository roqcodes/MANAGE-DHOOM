import type { User } from "@supabase/supabase-js";

/** OAuth providers (e.g. Google) store the photo on user metadata. */
export function resolveAuthAvatarUrl(user: User | null | undefined): string | null {
  if (!user) return null;

  const metadata = user.user_metadata ?? {};
  const candidates = [
    metadata.avatar_url,
    metadata.picture,
    metadata.photo_url,
    metadata.image,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const identities = user.identities ?? [];
  for (const identity of identities) {
    const data = identity.identity_data ?? {};
    const identityCandidates = [data.avatar_url, data.picture, data.photo_url, data.image];
    for (const value of identityCandidates) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
}
