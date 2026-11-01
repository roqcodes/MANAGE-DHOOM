-- Per-user favourite ERP reports (Reports hub shortcuts).

BEGIN;

ALTER TABLE public.user_erp_preferences
  ADD COLUMN IF NOT EXISTS favorite_report_slugs text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.user_erp_preferences.favorite_report_slugs IS
  'Ordered list of ERP report slugs pinned by this user on the Reports hub.';

NOTIFY pgrst, 'reload schema';

COMMIT;
