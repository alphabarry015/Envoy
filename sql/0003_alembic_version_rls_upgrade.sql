ALTER TABLE public.alembic_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alembic_version FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alembic_version FROM anon, authenticated;
