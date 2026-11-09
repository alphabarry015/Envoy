ALTER TABLE public.provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.provider_settings FROM anon, authenticated;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.login_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.templates FROM anon, authenticated;
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'envoy_role' - 'role'
WHERE raw_user_meta_data ? 'envoy_role' OR raw_user_meta_data ? 'role';
UPDATE auth.users AS a
SET raw_app_meta_data = COALESCE(a.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('envoy_role', u.role::text)
FROM public.users AS u
WHERE u.id = a.id
