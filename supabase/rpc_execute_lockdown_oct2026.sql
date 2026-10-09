-- rpc_execute_lockdown_oct2026.sql
-- Applied to production 2026-10-09 via Supabase MCP apply_migration
-- (name: rpc_execute_lockdown_oct2026). Idempotent: safe to re-run.
--
-- Why: SECURITY DEFINER functions in `public` were executable by `anon`
-- and `authenticated` through PostgREST (/rest/v1/rpc/*). Supabase advisor
-- lints 0028/0029. The money functions are stubs today, but escrow v2 will
-- give them real bodies, so lock them to the server now.
--
-- Callers verified before revoking:
--   * No app code calls these via supabase.rpc(); portal server code uses the
--     service-role client.
--   * on_support_ticket_decided() (SECURITY DEFINER, owner postgres) calls the
--     money functions as postgres -> unaffected.
--   * pg_cron jobs run as postgres -> unaffected.
--   * RLS policies on support_macros, disputes, moderation_flags and
--     support_notifications call is_admin / is_support_or_admin /
--     current_profile_role as `authenticated` -> authenticated KEEPS execute.
--   * Trigger / event-trigger functions are not callable via RPC; trigger
--     firing does not check EXECUTE.

-- 1) Money functions: server only.
revoke execute on function public.refund_order_full(uuid)           from public, anon, authenticated;
revoke execute on function public.refund_order_partial(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.release_escrow_now(uuid)          from public, anon, authenticated;
grant  execute on function public.refund_order_full(uuid)           to service_role;
grant  execute on function public.refund_order_partial(uuid, bigint) to service_role;
grant  execute on function public.release_escrow_now(uuid)          to service_role;

-- 2) Role helpers: no anonymous access; RLS (authenticated) still needs them.
revoke execute on function public.is_admin(uuid)            from public, anon;
revoke execute on function public.is_support_or_admin(uuid) from public, anon;
revoke execute on function public.current_profile_role()    from public, anon;
grant  execute on function public.is_admin(uuid)            to authenticated, service_role;
grant  execute on function public.is_support_or_admin(uuid) to authenticated, service_role;
grant  execute on function public.current_profile_role()    to authenticated, service_role;

-- 3) Trigger / event-trigger helpers: remove the PUBLIC and anon grants.
revoke execute on function public.rls_auto_enable()                        from public, anon;
revoke execute on function public.gigs_real_order_count_guard()            from public, anon;
revoke execute on function public.guard_provider_earnings_payable()        from public, anon;
revoke execute on function public.on_support_ticket_decided()              from public, anon;
revoke execute on function public.orders_refresh_gig_order_count()         from public, anon;
revoke execute on function public.prevent_non_admin_stripe_bypass_update() from public, anon;
revoke execute on function public.profiles_refresh_gig_order_count()       from public, anon;
