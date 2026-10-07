import Link from "next/link";

export type VendorSupplyTab = "my" | "add";

export function VendorSupplyTabNav({ active }: { active: VendorSupplyTab }) {
  return (
    <div className="mb-6 flex gap-1 rounded-xl bg-slate-100/80 p-1">
      <Link
        href="/vendor/products"
        className={[
          "flex-1 rounded-lg px-4 py-2.5 text-center text-[13px] font-extrabold transition",
          active === "my"
            ? "bg-white text-[#2563EB] shadow-sm"
            : "text-slate-500 hover:text-slate-800",
        ].join(" ")}
      >
        My Supply
      </Link>
      <Link
        href="/vendor/products?tab=add"
        className={[
          "flex-1 rounded-lg px-4 py-2.5 text-center text-[13px] font-extrabold transition",
          active === "add"
            ? "bg-white text-[#2563EB] shadow-sm"
            : "text-slate-500 hover:text-slate-800",
        ].join(" ")}
      >
        Add Products
      </Link>
    </div>
  );
}
