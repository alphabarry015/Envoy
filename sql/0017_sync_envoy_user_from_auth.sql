CREATE OR REPLACE FUNCTION public.sync_envoy_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $envoy$
BEGIN
    -- Envoy owns accounts, roles and passwords. Supabase Auth sign-ups or
    -- user_metadata edits must never create or elevate an Envoy account.
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.users WHERE id = OLD.id;
        RETURN OLD;
    END IF;

    IF NEW.deleted_at IS NOT NULL
        OR (NEW.banned_until IS NOT NULL AND NEW.banned_until > now()) THEN
        UPDATE public.users
        SET status = 'suspended', updated_at = now()
        WHERE id = NEW.id AND status <> 'suspended';
    END IF;

    RETURN NEW;
END;
$envoy$
