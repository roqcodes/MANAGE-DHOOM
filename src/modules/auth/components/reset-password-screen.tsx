"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BuyHubLogo } from "@/modules/brand/components/buyhub-logo";
import { createSupabaseBrowserClient } from "@/lib/integrations/supabase/client";
import { formatPortalAuthError } from "@/modules/auth/lib/format-auth-error";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";

export function ResetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          url.searchParams.delete("code");
          window.history.replaceState({}, "", url.pathname);
        }

        const { data } = await supabase.auth.getSession();
        if (active) setReady(Boolean(data.session));
      } catch (error) {
        if (active) setErrorMessage(formatPortalAuthError(error, "sign-in"));
      } finally {
        if (active) setChecking(false);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
        setErrorMessage(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      setErrorMessage(null);
      setSuccessMessage(null);
      try {
        const supabase = createSupabaseBrowserClient();
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setSuccessMessage("Password updated. Redirecting you to sign in…");
        await supabase.auth.signOut();
        router.replace(AUTH_ROUTES.signIn);
      } catch (error) {
        setErrorMessage(formatPortalAuthError(error, "sign-in"));
      }
    });
  }

  return (
    <main className="relative isolate flex min-h-full overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-24 -top-52 h-[500px] w-[500px] rounded-full bg-[#2563EB]/15" />
        <div className="absolute -bottom-40 -left-24 h-[500px] w-[500px] rounded-full bg-[#4F46E5]/8" />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <section className="rounded-[32px] border border-slate-100 bg-white p-8 shadow-[0_10px_20px_rgba(26,26,46,0.05)]">
          <div className="mb-8 flex items-center gap-3">
            <BuyHubLogo size={44} priority />
            <p className="text-xl font-black tracking-[-0.06em] text-slate-900">
              Buy<span className="text-[#2563EB]">Hub</span>
            </p>
          </div>

          <div className="mb-6 space-y-1">
            <h1 className="text-2xl font-extrabold text-slate-900">Set a new password</h1>
            <p className="text-sm font-medium text-slate-500">
              Choose a new password for your management portal account.
            </p>
          </div>

          {checking ? (
            <p className="text-sm text-slate-500">Preparing secure reset…</p>
          ) : !ready ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                Open the reset link from your email, or request a new one.
              </div>
              <Link
                className="inline-flex text-sm font-bold text-[#2563EB]"
                href={AUTH_ROUTES.forgotPassword}
              >
                Request a new reset link
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              <label className="space-y-2">
                <span className="text-[13px] font-bold text-slate-900">New password</span>
                <input
                  autoComplete="new-password"
                  className="min-h-14 w-full rounded-[18px] border border-[#D7DDEA] px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  value={password}
                />
              </label>

              <label className="space-y-2">
                <span className="text-[13px] font-bold text-slate-900">Confirm password</span>
                <input
                  autoComplete="new-password"
                  className="min-h-14 w-full rounded-[18px] border border-[#D7DDEA] px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter password"
                  type="password"
                  value={confirmPassword}
                />
              </label>

              {errorMessage ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  {successMessage}
                </div>
              ) : null}

              <button
                className="flex min-h-[58px] w-full items-center justify-center rounded-[20px] bg-[#2563EB] px-5 text-base font-extrabold tracking-[0.03em] text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-65"
                disabled={isPending}
                type="submit"
              >
                {isPending ? "Updating..." : "Update password"}
              </button>
            </form>
          )}

          <div className="mt-7 text-center">
            <Link
              className="text-sm font-bold text-slate-900 transition hover:text-[#2563EB]"
              href={AUTH_ROUTES.signIn}
            >
              Back to sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
