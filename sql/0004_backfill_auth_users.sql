SELECT public.upsert_envoy_auth_user(
    id,
    email,
    hashed_password,
    role::text,
    status::text
)
FROM public.users;
