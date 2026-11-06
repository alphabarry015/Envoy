ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users FROM anon, authenticated;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_keys FROM anon, authenticated;

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domains FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.domains FROM anon, authenticated;

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_logs FROM anon, authenticated;

ALTER TABLE public.suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppression_list FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.suppression_list FROM anon, authenticated;
