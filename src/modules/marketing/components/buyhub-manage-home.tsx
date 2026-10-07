import Link from "next/link";

import { AUTH_ROUTES } from "@/modules/auth/services/auth-route.service";
import { BuyHubLogo } from "@/modules/brand/components/buyhub-logo";
import { BRAND_ACCENT } from "@/modules/brand/lib/brand";

const BRAND = BRAND_ACCENT;

export function BuyHubManageHome() {
  return (
    <div className="min-h-svh bg-gradient-to-b from-slate-50 via-white to-slate-50/80">
      <div className="mx-auto flex min-h-svh max-w-lg flex-col justify-center px-6 py-16 sm:px-8">
        <BuyHubLogo size={56} priority showWordmark wordmarkSuffix="Manage" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Operations console
        </h1>
        <p className="mt-4 text-[15px] font-medium leading-relaxed text-slate-600">
          Operations console for admins, suppliers, and delivery. Sign in to open
          your dashboard.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={AUTH_ROUTES.signIn}
            className="inline-flex h-12 items-center justify-center rounded-xl px-6 text-sm font-semibold text-white shadow-md transition hover:opacity-95 active:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            Sign in
          </Link>
          <Link
            href={AUTH_ROUTES.signUp}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200/90 bg-white px-6 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            Request access
          </Link>
        </div>
      </div>
    </div>
  );
}
