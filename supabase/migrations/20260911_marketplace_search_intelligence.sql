-- Marketplace Search Intelligence
-- First-party, privacy-preserving demand events and weighted gig search.
-- Raw events are service-role only; aggregated signals are also internal-only.

-- ── 1. Search demand + attribution events ───────────────────────────────────
create table if not exists public.marketplace_search_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('search', 'gig_click', 'conversion')),
  raw_query text,
  normalized_query text,
  source text not null check (source in ('search_bar', 'tag_click', 'suggestion_click', 'category', 'related_search')),
  suggestion_type text check (suggestion_type is null or suggestion_type in ('tag', 'gig', 'category', 'query', 'recent')),
  result_count integer check (result_count is null or result_count >= 0),
  category_context text,
  filter_context jsonb not null default '{}'::jsonb,
  session_hash text,
  gig_id uuid references public.gigs(id) on delete set null,
  parent_search_event_id uuid references public.marketplace_search_events(id) on delete set null,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  constraint marketplace_search_event_shape check (
    (event_type = 'search' and normalized_query is not null and length(normalized_query) >= 2)
    or (event_type in ('gig_click', 'conversion') and gig_id is not null and parent_search_event_id is not null)
  )
);

create index if not exists idx_marketplace_search_events_query_created
  on public.marketplace_search_events (normalized_query, created_at desc)
  where event_type = 'search';
create index if not exists idx_marketplace_search_events_session_created
  on public.marketplace_search_events (session_hash, created_at desc)
  where session_hash is not null;
create index if not exists idx_marketplace_search_events_parent
  on public.marketplace_search_events (parent_search_event_id, event_type);
create index if not exists idx_marketplace_search_events_zero_results
  on public.marketplace_search_events (created_at desc, normalized_query)
  where event_type = 'search' and result_count = 0;

alter table public.marketplace_search_events enable row level security;
revoke all on table public.marketplace_search_events from public, anon, authenticated;
grant select, insert, update, delete on table public.marketplace_search_events to service_role;

comment on table public.marketplace_search_events is
  'Private Marketplace demand telemetry. Stores only safe search text plus a one-way session hash; never IP addresses, user agents, emails, or profile identifiers.';
comment on column public.marketplace_search_events.session_hash is
  'One-way hash of an ephemeral browser-session token. Used only for aggregate unique-demand estimates and anti-spam.';
comment on column public.marketplace_search_events.parent_search_event_id is
  'Links a gig click or future conversion to the executed search that produced it.';

-- ── 2. Weighted Marketplace search document ─────────────────────────────────
-- Keep an ordinary tsvector maintained by a trigger instead of a generated
-- column: array_to_string(text[]) is STABLE rather than IMMUTABLE on Postgres,
-- so it is not valid inside a generated-column expression.
alter table public.gigs
  add column if not exists marketplace_search_vector tsvector;

create or replace function public.update_marketplace_gig_search_vector()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.marketplace_search_vector :=
      setweight(to_tsvector('simple', coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(array_to_string(new.tags, ' '), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(new.pitch, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(new.category, '') || ' ' || coalesce(new.subcategory, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

update public.gigs
set marketplace_search_vector =
      setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(pitch, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(category, '') || ' ' || coalesce(subcategory, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(description, '')), 'C')
where marketplace_search_vector is null;

drop trigger if exists trg_marketplace_gig_search_vector on public.gigs;
create trigger trg_marketplace_gig_search_vector
before insert or update of title, tags, pitch, category, subcategory, description
on public.gigs
for each row execute function public.update_marketplace_gig_search_vector();

create index if not exists idx_gigs_marketplace_search_vector
  on public.gigs using gin (marketplace_search_vector);

-- Returns candidate ids + relevance metadata. Tags are deliberate intent
-- metadata, so they share title's A weight and exact tag matches get a modest
-- additional boost. Marketplace quality/rank remains a separate signal in the
-- application and raw demand volume never changes gig rank.
create or replace function public.marketplace_search_matches(
  p_query text,
  p_limit integer default 400
)
returns table (gig_id uuid, text_rank real, exact_tag_match boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with input as (
    select
      plainto_tsquery('simple', left(trim(p_query), 80)) as tsq,
      regexp_replace(lower(trim(p_query)), '[^a-z0-9]+', '', 'g') as compact_q
  )
  select
    g.id,
    (
      ts_rank_cd(g.marketplace_search_vector, input.tsq, 32)
      + case when exists (
          select 1
          from unnest(coalesce(g.tags, '{}'::text[])) tag
          where regexp_replace(lower(tag), '[^a-z0-9]+', '', 'g') = input.compact_q
        ) then 0.35 else 0 end
    )::real as text_rank,
    exists (
      select 1
      from unnest(coalesce(g.tags, '{}'::text[])) tag
      where regexp_replace(lower(tag), '[^a-z0-9]+', '', 'g') = input.compact_q
    ) as exact_tag_match
  from public.gigs g
  cross join input
  where g.status = 'active'
    and g.marketplace_search_vector @@ input.tsq
  order by text_rank desc, g.rank_score desc nulls last, g.id
  limit least(greatest(coalesce(p_limit, 400), 1), 500);
$$;

revoke all on function public.marketplace_search_matches(text, integer) from public, anon, authenticated;
grant execute on function public.marketplace_search_matches(text, integer) to service_role;

-- ── 3. Internal aggregate for SEO/search intelligence ────────────────────────
create or replace view public.marketplace_search_intelligence
with (security_invoker = true)
as
select
  s.normalized_query,
  count(*)::bigint as search_count,
  count(distinct s.session_hash)::bigint as unique_sessions,
  count(*) filter (where s.result_count = 0)::bigint as zero_result_count,
  round(
    (count(*) filter (where s.result_count = 0))::numeric / nullif(count(*), 0),
    4
  ) as zero_result_rate,
  round(avg(s.result_count)::numeric, 2) as avg_result_count,
  max(s.created_at) as last_searched_at,
  count(*) filter (where s.created_at >= now() - interval '7 days')::bigint as searches_7d,
  count(*) filter (
    where s.created_at >= now() - interval '14 days'
      and s.created_at < now() - interval '7 days'
  )::bigint as searches_previous_7d,
  count(c.id)::bigint as click_count,
  round(count(c.id)::numeric / nullif(count(*), 0), 4) as ctr,
  count(v.id)::bigint as conversion_count,
  round(count(v.id)::numeric / nullif(count(*), 0), 4) as search_to_conversion_rate
from public.marketplace_search_events s
left join public.marketplace_search_events c
  on c.parent_search_event_id = s.id and c.event_type = 'gig_click'
left join public.marketplace_search_events v
  on v.parent_search_event_id = s.id and v.event_type = 'conversion'
where s.event_type = 'search'
group by s.normalized_query;

revoke all on table public.marketplace_search_intelligence from public, anon, authenticated;
grant select on table public.marketplace_search_intelligence to service_role;

comment on view public.marketplace_search_intelligence is
  'Internal aggregate inputs for Marketplace demand and the SEO Master Engine: frequency, unique demand, recency/velocity, zero-result rate, CTR, conversion and observed result supply. No opportunity formula is hard-coded.';

-- ── 4. Internal suggestion candidates ────────────────────────────────────────
-- Historical queries only become suggestible after a small k-anonymity floor;
-- tag/title candidates still pass application-layer privacy filtering.
create or replace function public.marketplace_search_suggestions(
  p_query text,
  p_limit integer default 10
)
returns table (kind text, label text, slug text, score numeric, demand_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with input as (
    select lower(trim(left(p_query, 80))) as q
  ),
  tag_candidates as (
    select
      'tag'::text as kind,
      tag::text as label,
      null::text as slug,
      (case when lower(tag) = input.q then 100 else 70 end + count(*)::int)::numeric as score,
      0::bigint as demand_count
    from public.gigs g
    cross join input
    cross join lateral unnest(coalesce(g.tags, '{}'::text[])) tag
    where g.status = 'active'
      and length(input.q) >= 2
      and lower(tag) like '%' || input.q || '%'
    group by tag, input.q
  ),
  gig_candidates as (
    select
      'gig'::text as kind,
      g.title::text as label,
      g.slug::text as slug,
      (case when lower(g.title) like input.q || '%' then 60 else 45 end + coalesce(g.rank_score, 0))::numeric as score,
      0::bigint as demand_count
    from public.gigs g
    cross join input
    where g.status = 'active'
      and length(input.q) >= 2
      and lower(g.title) like '%' || input.q || '%'
    order by score desc
    limit 8
  ),
  query_candidates as (
    select
      'query'::text as kind,
      i.normalized_query::text as label,
      null::text as slug,
      (35 + least(i.search_count, 25))::numeric as score,
      i.search_count as demand_count
    from public.marketplace_search_intelligence i
    cross join input
    where i.search_count >= 3
      and i.unique_sessions >= 2
      and i.normalized_query like '%' || input.q || '%'
    order by score desc, i.last_searched_at desc
    limit 6
  )
  select kind, label, slug, score, demand_count
  from (
    select * from tag_candidates
    union all
    select * from gig_candidates
    union all
    select * from query_candidates
  ) candidates
  order by score desc, label
  limit least(greatest(coalesce(p_limit, 10), 1), 15);
$$;

revoke all on function public.marketplace_search_suggestions(text, integer) from public, anon, authenticated;
grant execute on function public.marketplace_search_suggestions(text, integer) to service_role;
