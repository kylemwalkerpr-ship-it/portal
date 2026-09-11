-- Search Intelligence metric precision follow-up.
-- Keep total demand separate from searches where result supply was actually
-- observed. Direct gig-suggestion clicks intentionally record result_count as
-- NULL, so they must not dilute the zero-result rate.

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
      (count(*) filter (where result_count = 0))::numeric
      / nullif(count(*) filter (where result_count is not null), 0),
      4
    ) as zero_result_rate,
    round(avg(result_count)::numeric, 2) as avg_result_count,
    max(created_at) as last_searched_at,
    count(*) filter (where created_at >= now() - interval '7 days')::bigint as searches_7d,
    count(*) filter (
      where created_at >= now() - interval '14 days'
        and created_at < now() - interval '7 days'
    )::bigint as searches_previous_7d,
    count(*) filter (where result_count is not null)::bigint as measured_search_count
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
  round(coalesce(e.converted_search_count, 0)::numeric / nullif(s.search_count, 0), 4) as search_to_conversion_rate,
  s.measured_search_count
from searches s
left join engagement e using (normalized_query);

revoke all on table public.marketplace_search_intelligence from public, anon, authenticated;
grant select on table public.marketplace_search_intelligence to service_role;

comment on view public.marketplace_search_intelligence is
  'Internal Marketplace/SEO demand aggregate. zero_result_rate uses only searches with an observed result_count; measured_search_count exposes that denominator. Raw demand, click, conversion and recency inputs remain separate and no opportunity formula is hard-coded.';
