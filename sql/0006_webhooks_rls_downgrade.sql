GRANT ALL ON TABLE public.webhooks TO anon, authenticated;
ALTER TABLE public.webhooks NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks DISABLE ROW LEVEL SECURITY;
