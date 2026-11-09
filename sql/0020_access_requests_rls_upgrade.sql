ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.access_requests FROM anon, authenticated;
