\set ON_ERROR_STOP on
\timing on

-- Run only against the isolated yqaa_test database. Everything below is
-- session-local (TEMP tables/functions) and disappears when psql exits.

create temporary table bench_sources (
  source_key text primary key,
  active boolean not null
);

create temporary table bench_chunks (
  chunk_key text primary key,
  source_key text not null,
  site text not null,
  repository text not null,
  source_url text not null,
  title text,
  section_title text,
  jurisdiction text,
  body text not null,
  topic_tags text[] not null,
  fetched_at timestamptz not null,
  lastmod timestamptz,
  authority_tier smallint not null,
  search_vector tsvector not null
);

insert into bench_sources(source_key, active)
select 'source-' || n, n % 19 <> 0
from generate_series(1, 5000) as n;

insert into bench_chunks(
  chunk_key, source_key, site, repository, source_url, title, section_title,
  jurisdiction, body, topic_tags, fetched_at, lastmod, authority_tier, search_vector
)
select
  'chunk-' || n,
  'source-' || (((n - 1) / 5) + 1),
  (array['support','caseworks','market','usa','canada'])[((n - 1) % 5) + 1],
  'benchmark/knowledge',
  'https://example.test/' || (((n - 1) / 5) + 1),
  case
    when n % 97 = 0 then 'Canadien immigraiton study permitt support'
    when n % 31 = 0 then 'Canada immigration study permit support rules'
    when n % 11 = 0 then 'Customer support contact and account help'
    else 'Public knowledge topic ' || (n % 400) || ' source ' || n
  end,
  case
    when n % 43 = 0 then 'Study permit eligibility and immigration rules'
    when n % 17 = 0 then 'Customer support and contact information'
    else 'Topic details ' || (n % 250)
  end,
  case when n % 7 = 0 then 'United States'
       when n % 3 = 0 then 'Canada'
       else null end,
  case
    when n % 31 = 0 then 'Canada immigration study permit rules and application guidance.'
    when n % 11 = 0 then 'Contact customer support for account assistance.'
    else 'General publicly available knowledge content for benchmark row ' || n || '.'
  end,
  case when n % 31 = 0 then array['immigration','study permit']::text[]
       when n % 11 = 0 then array['support','account']::text[]
       else array['general']::text[] end,
  now() - ((n % 90) || ' hours')::interval,
  null,
  (n % 5 + 1)::smallint,
  to_tsvector('english',
    coalesce(case when n % 31 = 0 then 'Canada immigration study permit support'
                  when n % 11 = 0 then 'Customer support contact account help'
                  else 'Public knowledge topic ' || (n % 400) end, '') || ' ' ||
    coalesce(case when n % 43 = 0 then 'Study permit eligibility immigration rules'
                  when n % 17 = 0 then 'Customer support contact information'
                  else 'Topic details' end, '') || ' ' ||
    case when n % 31 = 0 then 'immigration study permit rules and application guidance'
         when n % 11 = 0 then 'contact customer support account assistance'
         else 'general publicly available knowledge content' end
  )
from generate_series(1, 25000) as n;

create index bench_chunks_search_gin on bench_chunks using gin(search_vector);
create index bench_chunks_title_trgm on bench_chunks using gin(title gin_trgm_ops);
create index bench_chunks_section_trgm on bench_chunks using gin(section_title gin_trgm_ops);
create index bench_chunks_source on bench_chunks(source_key);
analyze bench_sources;
analyze bench_chunks;

create function pg_temp.bench_query_parts(p_query text)
returns table(query_text text, strict_tsq tsquery, broad_tsq tsquery,
              policy_intent boolean, support_intent boolean,
              market_intent boolean, legal_overview_intent boolean)
language sql immutable as $$
  select
    nullif(btrim(coalesce(p_query,'')), ''),
    case when nullif(btrim(coalesce(p_query,'')), '') is null then null
         else websearch_to_tsquery('english', p_query) end,
    case when nullif(btrim(coalesce(p_query,'')), '') is null
           or cardinality(tsvector_to_array(to_tsvector('english', p_query))) = 0 then null
         else to_tsquery('english', array_to_string(tsvector_to_array(to_tsvector('english', p_query)), ' | ')) end,
    coalesce(p_query ~* '\m(terms|privacy|refund|support|policy|contact|help)\M', false),
    coalesce(p_query ~* '\m(help|helpdesk|contact|ticket|customer service|live agent|support team|technical support|account issue)\M'
      or (p_query ~* '\msupport\M' and p_query !~* '\msupport[[:space:]]+(letter|document|evidence)\M'), false),
    coalesce(p_query ~* '\m(find|hire|book|browse|shop|service|provider|gig|marketplace|consultation)\M', false),
    coalesce(p_query ~* '\m(legal|law|rights|overview|rules|tenant|immigration)\M', false)
$$;

create function pg_temp.bench_old(p_query text, p_jurisdiction text, p_limit integer)
returns table(chunk_key text, source_url text, jurisdiction text, score double precision, authority_tier smallint)
language sql stable as $$
  with q as (select * from pg_temp.bench_query_parts(p_query)),
  scored as (
    select c.chunk_key, c.source_url, c.jurisdiction, c.authority_tier, c.fetched_at,
      (case when q.strict_tsq is not null and c.search_vector @@ q.strict_tsq then ts_rank_cd(c.search_vector,q.strict_tsq,32)*18 else 0 end
       + case when q.broad_tsq is not null and c.search_vector @@ q.broad_tsq then ts_rank_cd(c.search_vector,q.broad_tsq,32)*7 else 0 end
       + similarity(coalesce(c.title,''),coalesce(q.query_text,''))*4
       + similarity(coalesce(c.section_title,''),coalesce(q.query_text,''))*2.5
       + case when exists(select 1 from unnest(c.topic_tags) tag where q.query_text ilike '%'||tag||'%') then 1.25 else 0 end
       + case when c.site='support' and q.support_intent then 5 else 0 end
       + case when c.site='market' and q.market_intent then 3.5 else 0 end
       + case when c.site='caseworks' and q.legal_overview_intent then 2.5 else 0 end
       + case when c.site='support' then 0.55 else 0 end
       + case when p_jurisdiction is not null and lower(coalesce(c.jurisdiction,''))=lower(p_jurisdiction) then 5 else 0 end
       - case when p_jurisdiction is not null and c.jurisdiction is not null and lower(c.jurisdiction)<>lower(p_jurisdiction) then 7 else 0 end
       - case when not q.policy_intent and c.source_url ~* '/(?:terms(?:-of-service)?|privacy(?:-policy)?|refund(?:-policy)?|support|contact)/?$' then 3.5 else 0 end
       + c.authority_tier::double precision*0.06) as score
    from bench_chunks c join bench_sources s using(source_key) cross join q
    where s.active and q.query_text is not null and (
      (q.strict_tsq is not null and c.search_vector @@ q.strict_tsq)
      or (q.broad_tsq is not null and c.search_vector @@ q.broad_tsq)
      or similarity(coalesce(c.title,''),q.query_text)>0.08
      or similarity(coalesce(c.section_title,''),q.query_text)>0.08
    )
  ),
  diversified as (
    select *, row_number() over(partition by source_url order by score desc,authority_tier desc,fetched_at desc,chunk_key) as source_rank
    from scored where score>0
  )
  select chunk_key,source_url,jurisdiction,score,authority_tier
  from diversified where source_rank<=2
  order by score desc,authority_tier desc,fetched_at desc limit greatest(1,least(coalesce(p_limit,12),24))
$$;

create function pg_temp.bench_new(p_query text, p_jurisdiction text, p_limit integer)
returns table(chunk_key text, source_url text, jurisdiction text, score double precision, authority_tier smallint)
language sql stable set pg_trgm.similarity_threshold = '0.08' as $$
  with q as (select * from pg_temp.bench_query_parts(p_query)),
  candidates as materialized (
    select c.chunk_key from bench_chunks c cross join q where q.query_text is not null and q.strict_tsq is not null and c.search_vector @@ q.strict_tsq
    union
    select c.chunk_key from bench_chunks c cross join q where q.query_text is not null and q.broad_tsq is not null and c.search_vector @@ q.broad_tsq
    union
    select c.chunk_key from bench_chunks c cross join q where q.query_text is not null and c.title % q.query_text and similarity(coalesce(c.title,''),q.query_text)>0.08
    union
    select c.chunk_key from bench_chunks c cross join q where q.query_text is not null and c.section_title % q.query_text and similarity(coalesce(c.section_title,''),q.query_text)>0.08
  ),
  scored as (
    select c.chunk_key,c.source_url,c.jurisdiction,c.authority_tier,c.fetched_at,
      (case when q.strict_tsq is not null and c.search_vector @@ q.strict_tsq then ts_rank_cd(c.search_vector,q.strict_tsq,32)*18 else 0 end
       + case when q.broad_tsq is not null and c.search_vector @@ q.broad_tsq then ts_rank_cd(c.search_vector,q.broad_tsq,32)*7 else 0 end
       + similarity(coalesce(c.title,''),coalesce(q.query_text,''))*4
       + similarity(coalesce(c.section_title,''),coalesce(q.query_text,''))*2.5
       + case when exists(select 1 from unnest(c.topic_tags) tag where q.query_text ilike '%'||tag||'%') then 1.25 else 0 end
       + case when c.site='support' and q.support_intent then 5 else 0 end
       + case when c.site='market' and q.market_intent then 3.5 else 0 end
       + case when c.site='caseworks' and q.legal_overview_intent then 2.5 else 0 end
       + case when c.site='support' then 0.55 else 0 end
       + case when p_jurisdiction is not null and lower(coalesce(c.jurisdiction,''))=lower(p_jurisdiction) then 5 else 0 end
       - case when p_jurisdiction is not null and c.jurisdiction is not null and lower(c.jurisdiction)<>lower(p_jurisdiction) then 7 else 0 end
       - case when not q.policy_intent and c.source_url ~* '/(?:terms(?:-of-service)?|privacy(?:-policy)?|refund(?:-policy)?|support|contact)/?$' then 3.5 else 0 end
       + c.authority_tier::double precision*0.06) as score
    from candidates k join bench_chunks c using(chunk_key) join bench_sources s using(source_key) cross join q
    where s.active and q.query_text is not null
  ),
  diversified as (
    select *, row_number() over(partition by source_url order by score desc,authority_tier desc,fetched_at desc,chunk_key) as source_rank
    from scored where score>0
  )
  select chunk_key,source_url,jurisdiction,score,authority_tier
  from diversified where source_rank<=2
  order by score desc,authority_tier desc,fetched_at desc limit greatest(1,least(coalesce(p_limit,12),24))
$$;

-- Compare the old and new access paths and report actual plans/timing.
set pg_trgm.similarity_threshold = 0.08;
explain (analyze, buffers, summary)
select count(*) from bench_chunks c cross join pg_temp.bench_query_parts('Canada immigration study permit support') q
where (c.search_vector @@ q.strict_tsq) or (c.search_vector @@ q.broad_tsq)
   or similarity(coalesce(c.title,''),q.query_text)>0.08
   or similarity(coalesce(c.section_title,''),q.query_text)>0.08;

explain (analyze, buffers, summary)
with q as (select * from pg_temp.bench_query_parts('Canada immigration study permit support')),
candidates as materialized (
  select c.chunk_key from bench_chunks c cross join q where c.search_vector @@ q.strict_tsq
  union select c.chunk_key from bench_chunks c cross join q where c.search_vector @@ q.broad_tsq
  union select c.chunk_key from bench_chunks c cross join q where c.title % q.query_text and similarity(coalesce(c.title,''),q.query_text)>0.08
  union select c.chunk_key from bench_chunks c cross join q where c.section_title % q.query_text and similarity(coalesce(c.section_title,''),q.query_text)>0.08
)
select count(*) from candidates;
reset pg_trgm.similarity_threshold;

explain (analyze, buffers, summary)
select * from pg_temp.bench_old('Canada immigration study permit support','Canada',24);

explain (analyze, buffers, summary)
select * from pg_temp.bench_new('Canada immigration study permit support','Canada',24);

do $$
declare
  diff_count bigint;
  inactive_count bigint;
  per_source_max bigint;
  jurisdiction_wins boolean;
begin
  with old_rows as (select * from pg_temp.bench_old('Canada immigration study permit support','Canada',24)),
       new_rows as (select * from pg_temp.bench_new('Canada immigration study permit support','Canada',24)),
       diff as ((select * from old_rows except all select * from new_rows)
                union all (select * from new_rows except all select * from old_rows))
  select count(*) into diff_count from diff;
  if diff_count <> 0 then raise exception 'old/new ranked results differ: % rows', diff_count; end if;

  with old_rows as (select * from pg_temp.bench_old('immigrationx','Canada',24)),
       new_rows as (select * from pg_temp.bench_new('immigrationx','Canada',24)),
       diff as ((select * from old_rows except all select * from new_rows)
                union all (select * from new_rows except all select * from old_rows))
  select count(*) into diff_count from diff;
  if diff_count <> 0 then raise exception 'trigram-only ranked results differ: % rows', diff_count; end if;

  select count(*) into inactive_count
  from pg_temp.bench_new('Canada immigration study permit support','Canada',24) r
  join bench_chunks c using(chunk_key) join bench_sources s using(source_key)
  where not s.active;
  if inactive_count <> 0 then raise exception 'inactive source leaked into results'; end if;

  select coalesce(max(n),0) into per_source_max from (
    select count(*) n from pg_temp.bench_new('Canada immigration study permit support','Canada',24) group by source_url
  ) grouped;
  if per_source_max > 2 then raise exception 'source diversification cap failed: %', per_source_max; end if;

  select bool_or(jurisdiction='Canada') into jurisdiction_wins
  from pg_temp.bench_new('Canada immigration study permit support','Canada',24);
  if not coalesce(jurisdiction_wins,false) then raise exception 'jurisdiction-aware ranking failed'; end if;

  raise notice 'PASS: ranked outputs identical; active-source, jurisdiction, and max-two-per-source invariants hold';
end
$$;
