-- ERP RBAC roles. ADD VALUE cannot be used in the same transaction as the new labels.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'salesman';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'sales_manager';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'store_keeper';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'staff';
