-- Default wishlist for every storefront user
ALTER TABLE public.shopping_lists
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS shopping_lists_one_default_per_user
  ON public.shopping_lists (user_id)
  WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.ensure_default_shopping_list(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.shopping_lists
    WHERE user_id = p_user_id
      AND is_default = true
  ) THEN
    INSERT INTO public.shopping_lists (user_id, name, is_default)
    VALUES (p_user_id, 'Wishlist', true);
  END IF;
END;
$$;

-- Existing users without a default list
INSERT INTO public.shopping_lists (user_id, name, is_default)
SELECT u.id, 'Wishlist', true
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.shopping_lists sl
  WHERE sl.user_id = u.id
    AND sl.is_default = true
);

CREATE OR REPLACE FUNCTION public.trg_users_default_shopping_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_default_shopping_list(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_default_shopping_list ON public.users;

CREATE TRIGGER users_default_shopping_list
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_users_default_shopping_list();
