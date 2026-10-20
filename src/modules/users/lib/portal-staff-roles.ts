import { UserRole } from "@/common/auth/types";

/** Role stored on access request until a super admin assigns a real ERP role. */
export const PORTAL_ACCESS_REQUEST_ROLE = UserRole.Staff;

export type AssignableErpStaffRole = {
  slug: UserRole;
  label: string;
  rbacSlug: string;
};

export const ASSIGNABLE_ERP_STAFF_ROLES: readonly AssignableErpStaffRole[] = [
  { slug: UserRole.Salesman, label: "Sales Counter", rbacSlug: "salesman" },
  { slug: UserRole.SalesManager, label: "Sales Manager", rbacSlug: "sales_manager" },
  { slug: UserRole.Accountant, label: "Accountant", rbacSlug: "accountant" },
  { slug: UserRole.StoreKeeper, label: "Store Keeper", rbacSlug: "store_keeper" },
  { slug: UserRole.Admin, label: "Admin", rbacSlug: "admin" },
  { slug: UserRole.SuperAdmin, label: "Super Admin", rbacSlug: "super_admin" },
];

export function erpStaffRoleLabel(role: string | null): string {
  const match = ASSIGNABLE_ERP_STAFF_ROLES.find((r) => r.slug === role);
  if (match) return match.label;
  if (role === UserRole.Staff) return "Pending assignment";
  if (role === UserRole.Vendor) return "Vendor";
  if (role === UserRole.Manager) return "Manager (legacy)";
  return role?.replace(/_/g, " ") ?? "—";
}
