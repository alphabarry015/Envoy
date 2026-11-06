ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.templates FROM anon, authenticated;
