REVOKE ALL ON FUNCTION public.upsert_envoy_auth_user(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_envoy_auth_user(uuid, text, text, text, text) TO postgres;
REVOKE ALL ON FUNCTION public.sync_envoy_user_from_auth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_envoy_user_from_auth() TO postgres, supabase_auth_admin, service_role;
