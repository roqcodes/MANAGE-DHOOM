import Link from "next/link";

import { BRAND_ACCENT } from "@/modules/brand/lib/brand";
import { LEGAL_ROUTES } from "@/modules/legal/lib/legal-site";
import { SUPPORT_EMAIL } from "@/modules/legal/content/support-contact";

export function SupportContactPanel() {
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("DHOOM Trading support")}`;

  return (
    <div className="space-y-6">
      <a
        href={mailto}
        className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-slate-300"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Primary contact
        </span>
        <span className="text-lg font-semibold text-slate-900">{SUPPORT_EMAIL}</span>
        <span className="text-sm font-medium" style={{ color: BRAND_ACCENT }}>
          Send email →
        </span>
      </a>

      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600">
        <p className="font-semibold text-slate-900">Before you write</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Order status: open the app → Orders</li>
          <li>Password reset: Sign in → Forgot password</li>
          <li>Delete account:{" "}
            <Link href={LEGAL_ROUTES.deleteAccount} className="font-medium underline">
              Delete account page
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
