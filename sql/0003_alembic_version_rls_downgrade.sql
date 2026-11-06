GRANT ALL ON TABLE public.alembic_version TO anon, authenticated;
ALTER TABLE public.alembic_version NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.alembic_version DISABLE ROW LEVEL SECURITY;
