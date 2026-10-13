import type { RbacSession } from "@/modules/rbac/lib/permission-catalog";

export enum UserRole {
  SuperAdmin = "super_admin",
  Admin = "admin",
  Manager = "manager",
  SalesManager = "sales_manager",
  Salesman = "salesman",
  Accountant = "accountant",
  StoreKeeper = "store_keeper",
  Staff = "staff",
  Delivery = "delivery",
  Vendor = "vendor",
}

export type AuthMode = "sign-in" | "request";

export interface AuthScreenProps {
  initialMode?: AuthMode;
}

export interface AuthActionState {
  errorMessage: string | null;
  successMessage: string | null;
}

export interface AuthFormState {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface AuthScreenViewProps {
  form: AuthFormState;
  showPassword: boolean;
  isPending: boolean;
  actionState: AuthActionState;
  formAction: (payload: FormData) => void;
  onFieldChange: <K extends keyof AuthFormState>(
    field: K,
    value: AuthFormState[K],
  ) => void;
  onPasswordVisibilityToggle: () => void;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole | null;
  is_verified: boolean | null;
  /** From Supabase Auth metadata when signed in via OAuth (e.g. Google). */
  avatar_url?: string | null;
  rbac?: RbacSession | null;
}

export const ADMIN_AREA_ROLES: readonly UserRole[] = [
  UserRole.SuperAdmin,
  UserRole.Admin,
  UserRole.Manager,
  UserRole.SalesManager,
  UserRole.Salesman,
  UserRole.Accountant,
  UserRole.StoreKeeper,
  UserRole.Staff,
];

export const ALLOWED_PORTAL_ROLES: readonly UserRole[] = [
  ...ADMIN_AREA_ROLES,
  UserRole.Vendor,
  UserRole.Delivery,
];

export const INITIAL_AUTH_ACTION_STATE: AuthActionState = {
  errorMessage: null,
  successMessage: null,
};
