\set ON_ERROR_STOP on

begin;

-- Disposable PR #200-shaped table. It carries the columns owned by the
-- evidence-contract and execution-lease migrations so this test can prove the
-- provider-parity migration only adds its two nullable text columns plus the
-- documented comments — no grants, no RLS, no other object, no data rewrite.
create table public.content_jobs (
  id uuid primary key,
  opportunity_id text,
  contract_id text,
  contract_hash text,
  status text not null,
  execution_stage text,
  execution_owner text,
  execution_attempt integer not null default 0,
  execution_lease_expires_at timestamptz,
  requested_model text,
  actual_model text,
  ai_provider text
);

-- A historical legacy pin must survive the additive migration verbatim.
insert into public.content_jobs(id, status, execution_stage, ai_provider, execution_attempt)
values ('00000000-0000-0000-0000-000000000001', 'drafting', 'drafting', 'entrim-deepseek', 0);

\ir ../../supabase/migrations/20260916122441_content_studio_provider_parity.sql
-- Additive + if-not-exists: re-applying the review candidate is a no-op.
\ir ../../supabase/migrations/20260916122441_content_studio_provider_parity.sql

do $test$
declare
  missing_columns integer;
  actual_type text;
  error_type text;
  actual_nullable text;
  error_nullable text;
  ai_comment text;
  actual_comment text;
  error_comment text;
  unexpected integer;
  legacy_pin text;
begin
  select count(*) into missing_columns
    from (values ('actual_provider'), ('provider_error_class')) as expected(column_name)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'content_jobs'
        and c.column_name = expected.column_name
   );
  if missing_columns <> 0 then
    raise exception 'provider-parity migration did not add both columns (% missing)', missing_columns;
  end if;

  select data_type, is_nullable into actual_type, actual_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'content_jobs' and column_name = 'actual_provider';
  select data_type, is_nullable into error_type, error_nullable
    from information_schema.columns
   where table_schema = 'public' and table_name = 'content_jobs' and column_name = 'provider_error_class';
  if actual_type is distinct from 'text' then
    raise exception 'actual_provider type is %, expected text', coalesce(actual_type, 'missing');
  end if;
  if error_type is distinct from 'text' then
    raise exception 'provider_error_class type is %, expected text', coalesce(error_type, 'missing');
  end if;
  if actual_nullable is distinct from 'YES' or error_nullable is distinct from 'YES' then
    raise exception 'provider-parity columns must stay nullable additive additions';
  end if;

  select col_description('public.content_jobs'::regclass, attnum) into ai_comment
    from pg_attribute
   where attrelid = 'public.content_jobs'::regclass and attname = 'ai_provider';
  select col_description('public.content_jobs'::regclass, attnum) into actual_comment
    from pg_attribute
   where attrelid = 'public.content_jobs'::regclass and attname = 'actual_provider';
  select col_description('public.content_jobs'::regclass, attnum) into error_comment
    from pg_attribute
   where attrelid = 'public.content_jobs'::regclass and attname = 'provider_error_class';

  if ai_comment is distinct from 'Requested/owner provider pin. Commissioned values: grok | deepseek-v41-flash. Legacy values are historical and non-executable.' then
    raise exception 'ai_provider comment differs from the reviewed migration: %', coalesce(ai_comment, 'missing');
  end if;
  if actual_comment is distinct from 'Commissioned pin that produced the accepted artifact; null until first successful provider completion.' then
    raise exception 'actual_provider comment differs from the reviewed migration: %', coalesce(actual_comment, 'missing');
  end if;
  if error_comment is distinct from 'Granular provider failure class: auth|quota|rate_limit|timeout|malformed|empty|unavailable|destination_violation|unusable_generation|selection_required.' then
    raise exception 'provider_error_class comment differs from the reviewed migration: %', coalesce(error_comment, 'missing');
  end if;

  -- No new relations, no new grants: the migration is columns + comments only.
  select count(*) into unexpected
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and c.relname <> 'content_jobs';
  if unexpected <> 0 then
    raise exception 'provider-parity migration created % unexpected relation(s)', unexpected;
  end if;

  select count(*) into unexpected
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'content_jobs';
  if unexpected <> 0 then
    raise exception 'provider-parity migration added % table grant(s)', unexpected;
  end if;

  -- Existing historical data is never rewritten by the migration.
  select ai_provider into legacy_pin
    from public.content_jobs
   where id = '00000000-0000-0000-0000-000000000001';
  if legacy_pin is distinct from 'entrim-deepseek' then
    raise exception 'migration rewrote historical ai_provider value: %', coalesce(legacy_pin, 'null');
  end if;
end;
$test$;

rollback;
