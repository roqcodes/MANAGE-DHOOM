import type { ReactNode } from "react";
import { format } from "date-fns";
import { Building2, UserRound } from "lucide-react";

import type { UserProfile } from "@/common/auth/types";
import type { VendorProfileRecord } from "@/modules/vendor/types";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-slate-100 py-4 first:pt-0 last:border-b-0 last:pb-0">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <div className="mt-2 text-[15px] font-semibold leading-snug text-slate-900">
        {children}
      </div>
    </div>
  );
}

export function VendorProfilePanel({
  user,
  vendor,
}: {
  user: UserProfile;
  vendor: VendorProfileRecord | null;
}) {
  const initial = user.name?.[0]?.toUpperCase() ?? "V";

  return (
    <div className="space-y-8">
      {/* Identity */}
      <div className="flex flex-col gap-6 rounded-[28px] border border-slate-100/80 bg-gradient-to-br from-white via-white to-slate-50/90 p-8 shadow-[0_8px_40px_rgba(26,26,46,0.06)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[#1A1A2E] text-2xl font-black text-white shadow-inner">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
              Signed in as
            </p>
            <h2 className="mt-1.5 truncate text-2xl font-extrabold tracking-tight text-slate-900">
              {user.name?.trim() || "Vendor"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {user.email ?? "No email on file"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {user.is_verified ? (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-100">
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-800 ring-1 ring-amber-100">
              Pending approval
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start lg:gap-10">
        {/* Account */}
        <section className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_24px_rgba(26,26,46,0.05)]">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-7 py-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
              <UserRound size={20} className="text-[#2563EB]" strokeWidth={2} />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Account</h3>
              <p className="text-xs font-medium text-slate-500">
                Login and contact on file
              </p>
            </div>
          </div>
          <div className="px-7 pb-2 pt-1">
            <Field label="Full name">{user.name?.trim() || "—"}</Field>
            <Field label="Email">{user.email ?? "—"}</Field>
            <Field label="Phone">{user.phone ?? "—"}</Field>
          </div>
        </section>

        {/* Vendor */}
        <section className="overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_24px_rgba(26,26,46,0.05)]">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-7 py-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
              <Building2 size={20} className="text-[#2563EB]" strokeWidth={2} />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Supplier</h3>
              <p className="text-xs font-medium text-slate-500">
                How we list you in the network
              </p>
            </div>
          </div>
          <div className="px-7 pb-2 pt-1">
            {vendor ? (
              <>
                <Field label="Business name">
                  {vendor.name?.trim() || "—"}
                </Field>
                <Field label="Business contact">{vendor.contact?.trim() || "—"}</Field>
                <Field label="Listing status">
                  {vendor.is_active !== false ? (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-800">
                      Active
                    </span>
                  ) : (
                    <span className="font-semibold text-red-600">Inactive</span>
                  )}
                </Field>
                {vendor.created_at && (
                  <Field label="Onboarded">
                    {format(new Date(vendor.created_at), "MMMM d, yyyy")}
                  </Field>
                )}
                <Field label="Vendor ID">
                  <code className="mt-1 block w-full break-all rounded-xl bg-slate-50 px-3 py-2.5 font-mono text-[12px] font-normal leading-relaxed text-slate-700">
                    {vendor.id}
                  </code>
                </Field>
              </>
            ) : (
              <p className="py-8 text-center text-sm font-medium leading-relaxed text-slate-500">
                No supplier record is linked to this login yet. Contact DHOOM TRADING
                if something looks wrong.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
