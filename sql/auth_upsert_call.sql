SELECT public.upsert_envoy_auth_user(
    CAST(:id AS uuid), :email, :password, :role, :status)
