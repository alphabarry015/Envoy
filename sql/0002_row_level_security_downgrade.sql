GRANT ALL ON TABLE public.users TO anon, authenticated;
ALTER TABLE public.users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.api_keys TO anon, authenticated;
ALTER TABLE public.api_keys NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.domains TO anon, authenticated;
ALTER TABLE public.domains NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.domains DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.email_logs TO anon, authenticated;
ALTER TABLE public.email_logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.suppression_list TO anon, authenticated;
ALTER TABLE public.suppression_list NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.suppression_list DISABLE ROW LEVEL SECURITY;
