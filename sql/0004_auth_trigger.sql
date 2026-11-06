DROP TRIGGER IF EXISTS on_auth_user_sync_envoy ON auth.users;

CREATE TRIGGER on_auth_user_sync_envoy
AFTER INSERT OR UPDATE OR DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_envoy_user_from_auth();
