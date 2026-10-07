export enum UserRole {
  Admin = "admin",
  Manager = "manager",
  Delivery = "delivery",
  Vendor = "vendor",
}

export type AuthMode = "sign-in" | "request";

export type RequestAccessRole =
  | UserRole.Admin
  | UserRole.Delivery
  | UserRole.Vendor;

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
  mode: AuthMode;
  isRequestMode: boolean;
  role: RequestAccessRole;
  form: AuthFormState;
  showPassword: boolean;
  isPending: boolean;
  actionState: AuthActionState;
  formAction: (payload: FormData) => void;
  onModeToggle: () => void;
  onRoleChange: (role: RequestAccessRole) => void;
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
}

export const ALLOWED_PORTAL_ROLES: readonly UserRole[] = [
  UserRole.Admin,
  UserRole.Manager,
  UserRole.Vendor,
  UserRole.Delivery,
];

export const INITIAL_AUTH_ACTION_STATE: AuthActionState = {
  errorMessage: null,
  successMessage: null,
};

export const REQUEST_ACCESS_ROLES: readonly RequestAccessRole[] = [
  UserRole.Admin,
  UserRole.Delivery,
  UserRole.Vendor,
];
