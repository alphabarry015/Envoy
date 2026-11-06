CREATE OR REPLACE FUNCTION public.sync_envoy_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $envoy$
DECLARE
    v_meta jsonb;
    v_role text;
    v_status text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.users WHERE id = OLD.id;
        RETURN OLD;
    END IF;

    IF NEW.is_anonymous OR NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.deleted_at IS NOT NULL THEN
        UPDATE public.users
        SET status = 'suspended', updated_at = now()
        WHERE id = NEW.id;
        RETURN NEW;
    END IF;

    v_meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
        || COALESCE(NEW.raw_app_meta_data, '{}'::jsonb);
    v_role := CASE
        WHEN v_meta->>'envoy_role' IN ('admin', 'user') THEN v_meta->>'envoy_role'
        WHEN v_meta->>'role' IN ('admin', 'user') THEN v_meta->>'role'
        ELSE NULL
    END;

    v_status := CASE
        WHEN NEW.banned_until IS NOT NULL AND NEW.banned_until > now() THEN 'suspended'
        WHEN NEW.email_confirmed_at IS NULL AND NULLIF(NEW.encrypted_password, '') IS NULL THEN 'pending'
        ELSE 'active'
    END;

    INSERT INTO public.users (
        id,
        email,
        hashed_password,
        role,
        status,
        can_create_api_keys,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        lower(NEW.email),
        NULLIF(NEW.encrypted_password, ''),
        COALESCE(v_role, 'user')::user_role,
        v_status::user_status,
        true,
        COALESCE(NEW.created_at, now()),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        hashed_password = COALESCE(EXCLUDED.hashed_password, public.users.hashed_password),
        role = COALESCE(v_role::user_role, public.users.role),
        status = EXCLUDED.status,
        invite_token = CASE WHEN EXCLUDED.status = 'active' THEN NULL ELSE public.users.invite_token END,
        invite_token_expires_at = CASE
            WHEN EXCLUDED.status = 'active' THEN NULL
            ELSE public.users.invite_token_expires_at
        END,
        updated_at = now();

    RETURN NEW;
END;
$envoy$
