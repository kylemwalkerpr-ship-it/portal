-- 20260808_cannibal_merges.sql — shared merge-decision history
-- One table, two writers:
--   source = 'command_center' → merges opened from the Command Center (Convex)
--   source = 'portal'         → merges opened from the deployed Content Studio
-- Both UIs read the same rows, so the audit trail is shared across products.
-- Idempotent: safe to re-run.

create table if not exists cannibal_merges (
  id uuid primary key default gen_random_uuid(),
  cluster_id text not null,                  -- deterministic stem-based cluster id
  source text not null default 'command_center'
    check (source in ('command_center', 'portal')),
  stem text not null default '',
  terms jsonb not null default '[]'::jsonb,  -- search terms in the cluster
  winner_url text not null,
  loser_urls jsonb not null default '[]'::jsonb,
  redirects_created integer not null default 0,
  pr_url text,
  pr_number integer,
  status text not null default 'merged'
    check (status in ('merged', 'skipped')),
  message text,
  merged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (cluster_id, source)                -- idempotent upsert per writer
);

create index if not exists idx_cannibal_merges_created
  on cannibal_merges (merged_at desc);
create index if not exists idx_cannibal_merges_cluster
  on cannibal_merges (cluster_id);

comment on table cannibal_merges is
  'Shared cannibal merge decisions — Command Center (Convex) and Content Studio (portal) write here, both read the same history';

alter table cannibal_merges enable row level security;

-- Admin-only: access controlled at the API route level via Clerk (requireAdminUser).
drop policy if exists "Admin full access" on cannibal_merges;
create policy "Admin full access" on cannibal_merges
  for all
  using (true)
  with check (true);
