-- 20260806_hardening.sql — P0-P3 hardening (idempotent, safe to re-run)
-- Portal is Supabase + Next.js + Cloudflare. This migration adds the
-- same guarantees already live in github-content-bot (Convex) so the
-- next Cloudflare build has the full suite.

-- ── content_jobs: idempotency + live verification + event log + revert flag ─
alter table content_jobs add column if not exists dedup_key text;
alter table content_jobs add column if not exists live_canonical_url text;
alter table content_jobs add column if not exists live_verified_at timestamptz;
alter table content_jobs add column if not exists live_status text check (live_status in ('verified','noindex','fetch_failed','needs_review','unverified'));
alter table content_jobs add column if not exists live_http_status integer;
alter table content_jobs add column if not exists live_word_count integer;
alter table content_jobs add column if not exists live_audit_score integer;
alter table content_jobs add column if not exists live_human_score integer;
alter table content_jobs add column if not exists live_has_noindex boolean;
alter table content_jobs add column if not exists live_purge_status text;
alter table content_jobs add column if not exists live_sitemap_status text;
alter table content_jobs add column if not exists live_indexnow_status text;
alter table content_jobs add column if not exists live_error text;
alter table content_jobs add column if not exists event_log jsonb default '[]'::jsonb;
alter table content_jobs add column if not exists needs_revert boolean default false;
alter table content_jobs add column if not exists revert_reason text;
create index if not exists idx_content_jobs_dedup on content_jobs (dedup_key) where dedup_key is not null;
create index if not exists idx_content_jobs_live_status on content_jobs (live_status);

-- ── P1-1: GSC snapshot versioning (daily payload + decay delta) ─────────────
create table if not exists gsc_snapshots (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  date_key text not null, -- YYYY-MM-DD UTC
  rows integer not null default 0,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (site_url, date_key)
);
create index if not exists idx_gsc_snapshots_site on gsc_snapshots (site_url, date_key desc);

-- ── P1-3: anchor ledger (PageRank-weighted interlink v2) ───────────────────
create table if not exists anchor_ledger (
  id uuid primary key default gen_random_uuid(),
  source_slug text not null,
  source_job_id uuid references content_jobs(id) on delete set null,
  target_url text not null,
  anchor text not null,
  weight double precision,
  created_at timestamptz not null default now()
);
create index if not exists idx_anchor_ledger_source on anchor_ledger (source_slug);
create index if not exists idx_anchor_ledger_target on anchor_ledger (target_url);

-- ── P1-2: crawl / sitemap / llms drift checks ─────────────────────────────
create table if not exists crawl_checks (
  id uuid primary key default gen_random_uuid(),
  site_url text not null,
  check_type text not null check (check_type in ('sitemap','llms','crawl_budget')),
  status text not null check (status in ('ok','drift','error')),
  detail text,
  checked_at timestamptz not null default now()
);
create index if not exists idx_crawl_checks_site_type on crawl_checks (site_url, check_type, checked_at desc);
