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
  'Private Marketplace demand telemetry. Stores only privacy-filtered search text plus a one-way session hash; never IP addresses, user agents, emails, or profile identifiers.';
comment on column public.marketplace_search_events.session_hash is
  'One-way hash of an ephemeral browser-session token. Used only for aggregate unique-demand estimates and anti-spam.';
comment on column public.marketplace_search_events.parent_search_event_id is
  'Links a gig click or future conversion to the executed search that produced it.';

-- ── 2. Tag privacy boundary + weighted Marketplace search document ──────────
-- Protect the data at the database boundary too: every gig write passes
-- through this sanitizer, regardless of whether tags came from the builder,
-- an AI helper, an import, or a future API route. It removes obvious personal
-- identifiers and credential-number patterns while preserving service phrases
-- such as "bar admission strategy" that contain no identifier.
create or replace function public.marketplace_sanitize_tags(input_tags text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(clean_tag order by ord), '{}'::text[])
  from (
    select clean_tag, ord
    from (
      select
        btrim(regexp_replace(tag, '\s+', ' ', 'g')) as clean_tag,
        ord
      from unnest(coalesce(input_tags, '{}'::text[])) with ordinality as u(tag, ord)
    ) normalized
    where length(clean_tag) between 2 and 60
      and clean_tag !~* '[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}'
      and clean_tag !~* 'https?://'
      and clean_tag !~* '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
      and not (
        clean_tag ~* '\m(bar|licen[cs]e|registration|credential|roll|practi[cs]ing certificate|admission number|attorney number|solicitor number|law society|rcic|cicc|marn|sra)\M'
        and clean_tag ~* '(#|\mno\.?|\mnumber\M|\mid\M|\midentifier\M)?[[:space:]]*[A-Z]{0,5}[-[:space:]]?[0-9]{4,}\M'
      )
      and clean_tag !~* '\m[A-Z]{1,5}[-[:space:]]?[0-9]{5,}\M'
      and clean_tag !~* '\m[0-9]{5,}\M'
    order by ord
    limit 5
  ) safe_tags;
$$;

-- Search aliases intentionally normalize only syntax, not meaning. This makes
-- common form/visa spellings equivalent (H-1B/H1B, F-1/F1, I-485/I485,
-- N-400/N400) without introducing stemming or a demand-driven ranking loop.
create or replace function public.marketplace_search_alias_text(input_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        lower(coalesce(input_text, '')),
        '\m([a-z])[-[:space:]]?([0-9]{1,3}[a-z]?)\M',
        '\1\2',
        'g'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

alter table public.gigs
  add column if not exists marketplace_search_vector tsvector;

create or replace function public.update_marketplace_gig_search_vector()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tags := public.marketplace_sanitize_tags(new.tags);
  new.marketplace_search_vector :=
      setweight(to_tsvector('simple', coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('simple', public.marketplace_search_alias_text(new.title)), 'A')
    || setweight(to_tsvector('simple', coalesce(array_to_string(new.tags, ' '), '')), 'A')
    || setweight(to_tsvector('simple', public.marketplace_search_alias_text(array_to_string(new.tags, ' '))), 'A')
    || setweight(to_tsvector('simple', coalesce(new.pitch, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(new.category, '') || ' ' || coalesce(new.subcategory, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(new.description, '')), 'C');
  return new;
end;
$$;

-- Clean any legacy tag identifiers before they can enter suggestions/search.
update public.gigs
set tags = public.marketplace_sanitize_tags(tags)
where tags is distinct from public.marketplace_sanitize_tags(tags);

update public.gigs
set marketplace_search_vector =
      setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', public.marketplace_search_alias_text(title)), 'A')
    || setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'A')
    || setweight(to_tsvector('simple', public.marketplace_search_alias_text(array_to_string(tags, ' '))), 'A')
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
      plainto_tsquery('simple', public.marketplace_search_alias_text(left(trim(p_query), 80))) as tsq,
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
-- Aggregate searches and engagement independently so multiple clicks and a
-- conversion cannot multiply the search denominator through a join product.
create or replace view public.marketplace_search_intelligence
with (security_invoker = true)
as
with searches as (
  select
    normalized_query,
    count(*)::bigint as search_count,
    count(distinct session_hash)::bigint as unique_sessions,
    count(*) filter (where result_count = 0)::bigint as zero_result_count,
    round(
      (count(*) filter (where result_count = 0))::numeric / nullif(count(*), 0),
      4
    ) as zero_result_rate,
    round(avg(result_count)::numeric, 2) as avg_result_count,
    max(created_at) as last_searched_at,
    count(*) filter (where created_at >= now() - interval '7 days')::bigint as searches_7d,
    count(*) filter (
      where created_at >= now() - interval '14 days'
        and created_at < now() - interval '7 days'
    )::bigint as searches_previous_7d
  from public.marketplace_search_events
  where event_type = 'search'
  group by normalized_query
), engagement as (
  select
    parent.normalized_query,
    count(child.id) filter (where child.event_type = 'gig_click')::bigint as click_count,
    count(distinct parent.id) filter (where child.event_type = 'gig_click')::bigint as clicked_search_count,
    count(child.id) filter (where child.event_type = 'conversion')::bigint as conversion_count,
    count(distinct parent.id) filter (where child.event_type = 'conversion')::bigint as converted_search_count
  from public.marketplace_search_events child
  join public.marketplace_search_events parent
    on parent.id = child.parent_search_event_id
   and parent.event_type = 'search'
  where child.event_type in ('gig_click', 'conversion')
  group by parent.normalized_query
)
select
  s.normalized_query,
  s.search_count,
  s.unique_sessions,
  s.zero_result_count,
  s.zero_result_rate,
  s.avg_result_count,
  s.last_searched_at,
  s.searches_7d,
  s.searches_previous_7d,
  coalesce(e.click_count, 0)::bigint as click_count,
  coalesce(e.clicked_search_count, 0)::bigint as clicked_search_count,
  round(coalesce(e.clicked_search_count, 0)::numeric / nullif(s.search_count, 0), 4) as ctr,
  coalesce(e.conversion_count, 0)::bigint as conversion_count,
  coalesce(e.converted_search_count, 0)::bigint as converted_search_count,
  round(coalesce(e.converted_search_count, 0)::numeric / nullif(s.search_count, 0), 4) as search_to_conversion_rate
from searches s
left join engagement e using (normalized_query);

revoke all on table public.marketplace_search_intelligence from public, anon, authenticated;
grant select on table public.marketplace_search_intelligence to service_role;

comment on view public.marketplace_search_intelligence is
  'Internal aggregate inputs for Marketplace demand and the SEO Master Engine: frequency, unique demand, recency/velocity, zero-result rate, search-level CTR, conversion and observed result supply. No opportunity formula is hard-coded.';

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
    select public.marketplace_search_alias_text(left(trim(p_query), 80)) as q
  ),
  tag_candidates as (
    select
      'tag'::text as kind,
      tag::text as label,
      null::text as slug,
      (case when public.marketplace_search_alias_text(tag) = input.q then 100 else 70 end + count(*)::int)::numeric as score,
      0::bigint as demand_count
    from public.gigs g
    cross join input
    cross join lateral unnest(coalesce(g.tags, '{}'::text[])) tag
    where g.status = 'active'
      and length(input.q) >= 2
      and public.marketplace_search_alias_text(tag) like '%' || input.q || '%'
    group by tag, input.q
  ),
  gig_candidates as (
    select
      'gig'::text as kind,
      g.title::text as label,
      g.slug::text as slug,
      (case when public.marketplace_search_alias_text(g.title) like input.q || '%' then 60 else 45 end + coalesce(g.rank_score, 0))::numeric as score,
      0::bigint as demand_count
    from public.gigs g
    cross join input
    where g.status = 'active'
      and length(input.q) >= 2
      and public.marketplace_search_alias_text(g.title) like '%' || input.q || '%'
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
