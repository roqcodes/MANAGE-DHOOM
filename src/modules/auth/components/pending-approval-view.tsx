import type { UserProfile } from "@/common/auth/types";

import { SignOutForm } from "@/modules/auth/components/sign-out-form";

export function PendingApprovalView({ profile }: { profile: UserProfile }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-slate-50 px-6 py-10">
      <section className="w-full max-w-xl rounded-[32px] border border-slate-200 bg-white p-8 shadow-[0_10px_20px_rgba(26,26,46,0.05)]">
        <div className="space-y-4">
          <div className="inline-flex rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-amber-700">
            Approval Pending
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-slate-900">
              Your access request is under review.
            </h1>
            <p className="text-sm leading-6 text-slate-500">
              {profile.email || "This account"} exists, but an administrator must
              verify the role before the management portal becomes available.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
            Requested role:{" "}
            <span className="font-bold uppercase text-slate-900">{profile.role}</span>
          </div>
          <SignOutForm />
        </div>
      </section>
    </main>
  );
}
