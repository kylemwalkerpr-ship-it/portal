-- Phase 3 sanitization: server-only lockdown of tables readable by the public
-- anon key.
--
-- Production baseline (read-only anon probe, 2026-10-03): using only the
-- public NEXT_PUBLIC_SUPABASE_ANON_KEY, PostgREST returned real rows from the
-- tables below, including marketplace orders (requirements, delivery links),
-- order status history, support chat conversations (visitor name, email,
-- phone) and messages, support presence, and the internal SEO engine tables.
-- Their migrations created FOR ALL policies granted to public with
-- USING (true) / WITH CHECK (true) and granted table privileges to anon and
-- authenticated, so anonymous clients could also write.
--
-- Every application read/write of these tables runs server-side through the
-- service-role admin client (portal lib/supabase.ts; support-saas
-- createSupabaseAdminClient). No browser code queries them. Browser realtime
-- listeners (portal Content Studio SEO desk, support-saas inbox) fall back to
-- their authenticated server refresh/polling paths; anonymous realtime must
-- not stream these rows anyway.
--
-- Same pattern as 20260917173300_base_table_least_privilege.sql: keep RLS on,
-- drop every policy that grants a client role, recreate one explicit
-- service-role-only policy, revoke client-role table privileges. Additive,
-- idempotent, and guarded by to_regclass so fresh replays without a given
-- table still succeed. public.services (public catalogue) is intentionally
-- untouched.

do $$
declare
  t text;
  entry record;
  owned text[] := array[
    'orders',
    'order_status_history',
    'chat_conversations',
    'chat_messages',
    'chat_notifications',
    'support_presence',
    'gsc_tokens',
    'gsc_snapshots',
    'mission_log',
    'cannibal_merges',
    'content_job_reviews',
    'content_rhythm_alerts',
    'site_health_pages',
    'studio_specialist_signals',
    'seo_ahrefs_snapshots',
    'seo_cluster_plans',
    'seo_engine_config',
    'seo_engine_runs',
    'seo_forecast_runs',
    'seo_gate_runs',
    'seo_gsc_rows',
    'seo_intelligence_snapshots',
    'seo_interlinks',
    'seo_knowledge',
    'seo_lifecycle_stages',
    'seo_llm_visibility',
    'seo_model_calibration',
    'seo_ranking_scores',
    'seo_reward_events',
    'seo_topic_nodes',
    'seo_topic_edges'
  ];
begin
  foreach t in array owned loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    for entry in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and roles && array['public', 'anon', 'authenticated']::name[]
    loop
      execute format('drop policy if exists %I on public.%I', entry.policyname, t);
    end loop;

    execute format('drop policy if exists %I on public.%I', 'Service role full access', t);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      'Service role full access', t
    );

    execute format('revoke all privileges on table public.%I from public, anon, authenticated', t);
    execute format('grant all privileges on table public.%I to service_role', t);
  end loop;
end
$$;

notify pgrst, 'reload schema';
