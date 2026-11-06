CREATE INDEX IF NOT EXISTS ix_email_logs_user_created_at
ON public.email_logs (user_id, created_at DESC);
