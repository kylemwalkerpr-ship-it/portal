-- Harden live support/internal Supabase objects without assuming they exist
-- on every fresh replay. This migration changes privileges only; it does not
-- redefine function bodies or view queries.

do $$
begin
  if to_regprocedure('public.support_notify(uuid,text,text,text,text,text)') is not null then
    execute 'revoke execute on function public.support_notify(uuid,text,text,text,text,text) from public, anon, authenticated';
    execute 'grant execute on function public.support_notify(uuid,text,text,text,text,text) to service_role';
  end if;

  if to_regprocedure('public.support_log_action(uuid,text,text,text,text,jsonb)') is not null then
    execute 'revoke execute on function public.support_log_action(uuid,text,text,text,text,jsonb) from public, anon, authenticated';
    execute 'grant execute on function public.support_log_action(uuid,text,text,text,text,jsonb) to service_role';
  end if;

  if to_regclass('public.content_job_health_summary') is not null then
    execute 'alter view public.content_job_health_summary set (security_invoker = true)';
    execute 'revoke all privileges on table public.content_job_health_summary from public, anon, authenticated';
    execute 'grant select on table public.content_job_health_summary to service_role';
  end if;

  if to_regclass('public.inquiry_engagement') is not null then
    execute 'alter view public.inquiry_engagement set (security_invoker = true)';
    execute 'revoke all privileges on table public.inquiry_engagement from public, anon, authenticated';
    execute 'grant select on table public.inquiry_engagement to service_role';
  end if;

  if to_regclass('public.seo_backlink_dashboard') is not null then
    execute 'alter view public.seo_backlink_dashboard set (security_invoker = true)';
    execute 'revoke all privileges on table public.seo_backlink_dashboard from public, anon, authenticated';
    execute 'grant select on table public.seo_backlink_dashboard to service_role';
  end if;

  if to_regclass('public.support_user_notes_v') is not null then
    execute 'alter view public.support_user_notes_v set (security_invoker = true)';
    execute 'revoke all privileges on table public.support_user_notes_v from public, anon, authenticated';
    execute 'grant select on table public.support_user_notes_v to service_role';
  end if;
end
$$;
