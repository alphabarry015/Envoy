DROP TRIGGER IF EXISTS on_auth_user_sync_envoy ON auth.users;
DROP FUNCTION IF EXISTS public.sync_envoy_user_from_auth();
DROP FUNCTION IF EXISTS public.upsert_envoy_auth_user(uuid, text, text, text, text);
