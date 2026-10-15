"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";
import { BRAND_ACCENT } from "@/modules/brand/lib/brand";
import { SUPPORT_EMAIL } from "@/modules/legal/content/support-contact";
import type { StorefrontDeletionPreview } from "@/modules/storefront/services/storefront-account-deletion.service";

export function DeleteAccountPanel() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [preview, setPreview] = useState<StorefrontDeletionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSignedIn(Boolean(session));

      if (!session) {
        setPreview(null);
        return;
      }

      const res = await fetch("/api/storefront/account/delete", {
        credentials: "include",
      });
      const body = (await res.json()) as StorefrontDeletionPreview & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Could not load status");
      }
      setPreview(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!preview?.can_delete) return;
    const confirmed = window.confirm(
      "Permanently delete your DHOOM Trading account? This cannot be undone.",
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/storefront/account/delete", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Deletion failed");
      }
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      setDone(true);
      setSignedIn(false);
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deletion failed");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-600">Checking your account…</p>;
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
        Your account has been deleted. You can close this page.
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="space-y-4">
        <p className="text-[15px] text-slate-600">
          Sign in with the same email you use in the DHOOM Trading app, then
          delete your account from this page. You can also delete from the app
          under Account → Delete account.
        </p>
        <Link
          href={AUTH_ROUTES.signIn}
          className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white"
          style={{ backgroundColor: BRAND_ACCENT }}
        >
          Sign in to continue
        </Link>
        <p className="text-sm text-slate-500">
          Or email{" "}
          <a className="font-medium text-slate-700" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          with the subject &quot;Delete my DHOOM account&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {preview ? (
        <div
          className={`rounded-xl border px-4 py-4 text-sm ${
            preview.can_delete
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          <p className="font-medium">{preview.message}</p>
          {preview.active_orders != null && preview.active_orders > 0 ? (
            <p className="mt-2 text-slate-600">
              Open orders: {preview.active_orders}. Complete delivery or cancel
              them in the app before deleting.
            </p>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        disabled={!preview?.can_delete || deleting}
        onClick={() => void handleDelete()}
        className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: preview?.can_delete ? "#DC2626" : "#94A3B8" }}
      >
        {deleting ? "Deleting…" : "Delete my account permanently"}
      </button>

      <button
        type="button"
        className="text-sm font-medium text-slate-600 underline"
        onClick={() => void load()}
      >
        Refresh status
      </button>
    </div>
  );
}
