-- Ranking-only follow-up. Preserve PR #305's indexed rows and weighted vectors.

create or replace function public.search_yqaa_knowledge(
  p_query text,
  p_origin_site text default null,
  p_jurisdiction text default null,
  p_limit integer default 12
)
returns table (
  chunk_key text,
  source_key text,
  site text,
  repository text,
  source_url text,
  title text,
  section_title text,
  jurisdiction text,
  body text,
  topic_tags text[],
  fetched_at timestamptz,
  lastmod timestamptz,
  authority_tier smallint,
  score double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with args as (
    select
      nullif(btrim(coalesce(p_query,'')), '') as query_text,
      nullif(btrim(coalesce(p_origin_site,'')), '') as origin_site,
      nullif(btrim(coalesce(p_jurisdiction,'')), '') as jurisdiction_filter,
      greatest(1, least(coalesce(p_limit,12), 24)) as result_limit
  ),
  q0 as (
    select
      query_text,
      origin_site,
      jurisdiction_filter,
      result_limit,
      case
        when query_text is null then null
        else websearch_to_tsquery('english'::regconfig, query_text)
      end as strict_tsq,
      case
        when query_text is null then null
        when cardinality(tsvector_to_array(to_tsvector('english'::regconfig, query_text))) = 0 then null
        else to_tsquery(
          'english'::regconfig,
          array_to_string(
            tsvector_to_array(to_tsvector('english'::regconfig, query_text)),
            ' | '
          )
        )
      end as broad_tsq,
      coalesce(query_text ~* '\m(terms|privacy|refund|support|policy|contact|help)\M', false) as policy_intent,
      coalesce(
        query_text ~* '\m(help|helpdesk|contact|ticket|customer service|live agent|support team|technical support|account issue)\M'
        or (query_text ~* '\msupport\M' and query_text !~* '\msupport[[:space:]]+(letter|document|evidence)\M'),
        false
      ) as support_intent,
      coalesce(query_text ~* '\m(find|hire|book|browse|shop|service|provider|gig|marketplace|consultation)\M', false) as market_intent,
      coalesce(query_text ~* '\m(legal|law|rights|overview|rules|tenant|immigration)\M', false) as legal_overview_intent
    from args
  ),
  scored as (
    select
      c.chunk_key,
      c.source_key,
      c.site,
      c.repository,
      c.source_url,
      c.title,
      c.section_title,
      c.jurisdiction,
      c.body,
      c.topic_tags,
      c.fetched_at,
      c.lastmod,
      c.authority_tier,
      (
        case
          when q0.strict_tsq is not null and c.search_vector @@ q0.strict_tsq
          then ts_rank_cd(c.search_vector, q0.strict_tsq, 32) * 18.0
          else 0
        end
        + case
            when q0.broad_tsq is not null and c.search_vector @@ q0.broad_tsq
            then ts_rank_cd(c.search_vector, q0.broad_tsq, 32) * 7.0
            else 0
          end
        + similarity(coalesce(c.title,''), coalesce(q0.query_text,'')) * 4.0
        + similarity(coalesce(c.section_title,''), coalesce(q0.query_text,'')) * 2.5
        + case
            when exists (
              select 1
              from unnest(c.topic_tags) tag
              where q0.query_text ilike '%' || tag || '%'
            ) then 1.25
            else 0
          end
        + case
            when q0.origin_site is not null and c.site = q0.origin_site then 0.55
            else 0
          end
        + case
            when q0.jurisdiction_filter is not null
             and lower(coalesce(c.jurisdiction,'')) = lower(q0.jurisdiction_filter)
            then 5.0
            else 0
          end
        - case
            when q0.jurisdiction_filter is not null
             and c.jurisdiction is not null
             and lower(c.jurisdiction) <> lower(q0.jurisdiction_filter)
            then 7.0 else 0
          end
        + case when q0.support_intent and c.site = 'support' then 5.0 else 0 end
        + case when q0.market_intent and c.site = 'market' then 3.5 else 0 end
        + case when q0.legal_overview_intent and c.site = 'caseworks' then 2.5 else 0 end
        + (c.authority_tier::double precision * 0.06)
        - case
            when not q0.policy_intent
             and c.source_url ~* '/(?:terms(?:-of-service)?|privacy(?:-policy)?|refund(?:-policy)?|support|contact)/?$'
            then 3.5
            else 0
          end
      ) as score
    from public.yqaa_knowledge_chunks c
    join public.yqaa_knowledge_sources s on s.source_key = c.source_key
    cross join q0
    where s.active
      and q0.query_text is not null
      and (
        (q0.strict_tsq is not null and c.search_vector @@ q0.strict_tsq)
        or (q0.broad_tsq is not null and c.search_vector @@ q0.broad_tsq)
        or similarity(coalesce(c.title,''), q0.query_text) > 0.08
        or similarity(coalesce(c.section_title,''), q0.query_text) > 0.08
      )
  ),
  diversified as (
    select *,
      row_number() over (
        partition by source_url
        order by score desc, authority_tier desc, fetched_at desc, chunk_key
      ) as source_rank
    from scored
    where score > 0
  )
  select
    chunk_key, source_key, site, repository, source_url, title, section_title,
    jurisdiction, body, topic_tags, fetched_at, lastmod, authority_tier, score
  from diversified
  where source_rank <= 2
  order by score desc, authority_tier desc, fetched_at desc
  limit (select result_limit from q0);
$$;

revoke all on function public.search_yqaa_knowledge(text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.search_yqaa_knowledge(text,text,text,integer)
  to service_role;
