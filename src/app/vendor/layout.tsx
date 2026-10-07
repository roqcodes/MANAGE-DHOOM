import type { ReactNode } from "react";

import { VendorSidebar } from "@/modules/vendor/components/vendor-sidebar";
import { requireVendorAreaAccess } from "@/modules/auth/services/auth-guard.service";

export const dynamic = "force-dynamic";

export default async function VendorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await requireVendorAreaAccess();

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      <VendorSidebar profile={profile} />
      <main className="grid h-full flex-1 grid-rows-[auto_1fr] overflow-hidden">
        <div className="h-[56px] border-b border-slate-100 bg-white px-6 flex items-center">
           <h1 className="text-sm font-bold text-slate-900">Vendor Portal</h1>
        </div>
        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </main>
    </div>
  );
}
