ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.webhooks FROM anon, authenticated;
