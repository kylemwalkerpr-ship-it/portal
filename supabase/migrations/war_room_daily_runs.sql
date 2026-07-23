-- Daily War Room automation reports (midday Africa/Nairobi)
create table if not exists public.war_room_daily_runs (
  id bigserial primary key,
  run_id text not null unique,
  scheduled_for text,
  started_at timestamptz,
  finished_at timestamptz,
  gsc_source text,
  site_url text,
  summary text,
  work_json jsonb not null default '[]'::jsonb,
  shipped_count int not null default 0,
  failed_count int not null default 0,
  skipped_count int not null default 0,
  report_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists war_room_daily_runs_started_at_idx
  on public.war_room_daily_runs (started_at desc);

comment on table public.war_room_daily_runs is
  'SEO War Room daily automation logs: top plays shipped + canonical URLs';
