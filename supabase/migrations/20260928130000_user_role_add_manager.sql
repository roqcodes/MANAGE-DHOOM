-- Portal RBAC uses role 'manager' (see UserRole.Manager, staff RLS, metrics).
-- Without this label, Postgres raises 22P02 when comparing or filtering on 'manager'.

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'manager';
