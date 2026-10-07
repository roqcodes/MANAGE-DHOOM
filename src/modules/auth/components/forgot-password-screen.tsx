"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { BuyHubLogo } from "@/modules/brand/components/buyhub-logo";
import { INITIAL_AUTH_ACTION_STATE } from "@/common/auth/types";
import { forgotPasswordAction } from "@/modules/auth/actions/auth.actions";
import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [redirectTo, setRedirectTo] = useState("");
  const [actionState, formAction, isPending] = useActionState(
    forgotPasswordAction,
    INITIAL_AUTH_ACTION_STATE,
  );

  useEffect(() => {
    setRedirectTo(`${window.location.origin}${AUTH_ROUTES.resetPassword}`);
  }, []);

  const title = useMemo(() => "Forgot password", []);

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
            <h1 className="text-2xl font-extrabold text-slate-900">{title}</h1>
            <p className="text-sm font-medium text-slate-500">
              Enter your work email and we will send a reset link.
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <input name="redirectTo" type="hidden" value={redirectTo} />
            <label className="space-y-2">
              <span className="text-[13px] font-bold text-slate-900">Email Address</span>
              <input
                autoCapitalize="none"
                autoComplete="email"
                className="min-h-14 w-full rounded-[18px] border border-[#D7DDEA] px-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="manager@buyhub.com"
                type="email"
                value={email}
              />
            </label>

            {actionState.errorMessage ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {actionState.errorMessage}
              </div>
            ) : null}

            {actionState.successMessage ? (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                {actionState.successMessage}
              </div>
            ) : null}

            <button
              className="flex min-h-[58px] w-full items-center justify-center rounded-[20px] bg-[#2563EB] px-5 text-base font-extrabold tracking-[0.03em] text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-65"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Sending..." : "Send reset link"}
            </button>
          </form>

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
