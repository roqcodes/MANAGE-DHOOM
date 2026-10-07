import type { UserProfile } from "@/common/auth/types";

import { SignOutForm } from "@/modules/auth/components/sign-out-form";

export function RoleDashboardView({
  profile,
  title,
  description,
  roleLabel,
}: {
  profile: UserProfile;
  title: string;
  description: string;
  roleLabel: string;
}) {
  return (
    <main className="min-h-full bg-slate-50 px-6 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_10px_20px_rgba(26,26,46,0.05)] lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="inline-flex rounded-full bg-[#2563EB]/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-[#2563EB]">
              {roleLabel}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-extrabold text-slate-900">{title}</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-500">
                {description}
              </p>
            </div>
          </div>
          <SignOutForm />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Account
            </p>
            <h2 className="mt-3 text-xl font-bold text-slate-900">
              {profile.name || "DHOOM Trading User"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{profile.email || "No email"}</p>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Role
            </p>
            <h2 className="mt-3 text-xl font-bold uppercase text-slate-900">
              {profile.role}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Access is enforced by Supabase session + middleware guards.
            </p>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-6">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Verification
            </p>
            <h2 className="mt-3 text-xl font-bold text-emerald-600">
              {profile.is_verified ? "Verified" : "Pending"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Only verified accounts can reach protected role routes.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
