"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ClipboardList, User } from "lucide-react";

import type { UserProfile } from "@/common/auth/types";

import { BuyHubLogo } from "@/modules/brand/components/buyhub-logo";

const NAV_ITEMS = [
  { name: "Dashboard", href: "/vendor", icon: LayoutDashboard },
  { name: "Supply", href: "/vendor/products", icon: Package },
  { name: "Purchase orders", href: "/vendor/purchase-orders", icon: ClipboardList },
  { name: "Profile", href: "/vendor/profile", icon: User },
] as const;

export function VendorSidebar({ profile }: { profile: UserProfile }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/vendor") return pathname === "/vendor";
    return pathname.startsWith(href);
  }

  const initial = profile.name?.[0]?.toUpperCase() ?? "V";

  return (
    <aside className="flex h-full w-[250px] shrink-0 flex-col border-e border-slate-100 bg-white">
      <div className="flex items-center gap-3 px-6 py-6">
        <BuyHubLogo size={32} />
        <span className="rounded-md bg-slate-900/5 px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-600">
          Vendor
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3.5 rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors",
                active
                  ? "bg-[#2563EB]/5 text-[#2563EB]"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              ].join(" ")}
            >
              <Icon
                size={20}
                className={active ? "text-[#2563EB]" : "text-slate-400"}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-4">
        <Link
          href="/vendor/profile"
          className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 transition hover:bg-slate-100"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-extrabold text-white">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">
              {profile.name ?? "Vendor"}
            </p>
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
              View profile
            </p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
