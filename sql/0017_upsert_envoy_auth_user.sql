CREATE OR REPLACE FUNCTION public.upsert_envoy_auth_user(
    p_id uuid,
    p_email text,
    p_password text,
    p_role text,
    p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $envoy$
DECLARE
    v_email text := lower(p_email);
    v_confirmed timestamptz;
BEGIN
    v_confirmed := CASE WHEN p_status = 'pending' THEN NULL ELSE now() END;

    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        invited_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        phone_change,
        phone_change_token,
        email_change_token_current,
        email_change_confirm_status,
        reauthentication_token,
        is_sso_user,
        is_anonymous,
        banned_until
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        p_id,
        'authenticated',
        'authenticated',
        v_email,
        NULLIF(p_password, ''),
        v_confirmed,
        CASE WHEN p_status = 'pending' THEN now() ELSE NULL END,
        '',
        '',
        '',
        '',
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'envoy_role', p_role),
        '{}'::jsonb,
        now(),
        now(),
        '',
        '',
        '',
        0,
        '',
        false,
        false,
        CASE
            WHEN p_status = 'suspended' THEN now() + interval '100 years'
            ELSE NULL
        END
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        encrypted_password = COALESCE(EXCLUDED.encrypted_password, auth.users.encrypted_password),
        email_confirmed_at = CASE
            WHEN p_status = 'pending' THEN NULL
            ELSE COALESCE(auth.users.email_confirmed_at, EXCLUDED.email_confirmed_at)
        END,
        raw_app_meta_data = EXCLUDED.raw_app_meta_data,
        raw_user_meta_data = COALESCE(auth.users.raw_user_meta_data, '{}'::jsonb) - 'envoy_role' - 'role',
        banned_until = EXCLUDED.banned_until,
        updated_at = now();

    INSERT INTO auth.identities (
        provider_id,
        user_id,
        identity_data,
        provider,
        created_at,
        updated_at
    ) VALUES (
        p_id::text,
        p_id,
        jsonb_build_object(
            'sub', p_id::text,
            'email', v_email,
            'email_verified', p_status = 'active'
        ),
        'email',
        now(),
        now()
    )
    ON CONFLICT (provider_id, provider) DO UPDATE SET
        identity_data = EXCLUDED.identity_data,
        updated_at = now();
END;
$envoy$
