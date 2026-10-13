-- Incremental successor to the applied YQAA full-replacement finalizer.
-- Stable source_key and source_key:chunk_index identities let unchanged
-- indexed chunks remain physically untouched between verified snapshots.

create or replace function public.finalize_yqaa_knowledge_ingestion(p_run_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_started_at timestamptz;
  v_newer_run_id text;
  v_expected_sources integer;
  v_expected_chunks integer;
  v_staged_sources integer;
  v_staged_chunks integer;
  v_source_count integer;
  v_chunk_count integer;
  v_site_counts jsonb;
begin
  if nullif(btrim(coalesce(p_run_id,'')), '') is null then
    raise exception 'run id required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('yqaa_knowledge_ingestion', 0));

  select status, started_at, source_count, chunk_count
    into v_status, v_started_at, v_expected_sources, v_expected_chunks
    from public.yqaa_knowledge_ingestion_runs
   where run_id = p_run_id
   for update;

  if not found then
    raise exception 'unknown YQAA ingestion run %', p_run_id;
  end if;

  if v_status <> 'running' then
    raise exception 'YQAA ingestion run % is %, expected running', p_run_id, v_status;
  end if;

  -- A newer complete run wins. Incomplete running runs do not fence this run.
  select newer.run_id
    into v_newer_run_id
    from public.yqaa_knowledge_ingestion_runs as newer
   where newer.run_id <> p_run_id
     and (newer.started_at, newer.run_id) > (v_started_at, p_run_id)
     and (
       newer.status = 'completed'
       or (
         newer.status = 'running'
         and coalesce(newer.source_count, 0) > 0
         and coalesce(newer.chunk_count, 0) > 0
         and (
           select count(*)
             from public.yqaa_knowledge_sources_staging as staged_sources
            where staged_sources.ingestion_run_id = newer.run_id
         ) = newer.source_count
         and (
           select count(*)
             from public.yqaa_knowledge_chunks_staging as staged_chunks
            where staged_chunks.ingestion_run_id = newer.run_id
         ) = newer.chunk_count
       )
     )
   order by newer.started_at desc, newer.run_id desc
   limit 1;

  if found then
    update public.yqaa_knowledge_ingestion_runs
       set completed_at = now(),
           status = 'rejected',
           problems = jsonb_build_array(jsonb_build_object(
             'code', 'superseded_by_newer_run',
             'run_id', left(v_newer_run_id, 200)
           ))
     where run_id = p_run_id
       and status = 'running';

    delete from public.yqaa_knowledge_chunks_staging
     where ingestion_run_id = p_run_id;
    delete from public.yqaa_knowledge_sources_staging
     where ingestion_run_id = p_run_id;

    return jsonb_build_object(
      'run_id', p_run_id,
      'status', 'rejected',
      'problem', jsonb_build_object(
        'code', 'superseded_by_newer_run',
        'run_id', left(v_newer_run_id, 200)
      )
    );
  end if;

  if coalesce(v_expected_sources, 0) <= 0 or coalesce(v_expected_chunks, 0) <= 0 then
    raise exception 'YQAA ingestion run % has empty expected counts', p_run_id;
  end if;

  select count(*) into v_staged_sources
    from public.yqaa_knowledge_sources_staging
   where ingestion_run_id = p_run_id;

  select count(*) into v_staged_chunks
    from public.yqaa_knowledge_chunks_staging
   where ingestion_run_id = p_run_id;

  if v_staged_sources <> v_expected_sources then
    raise exception
      'YQAA ingestion run % source count mismatch: staged %, expected %',
      p_run_id, v_staged_sources, v_expected_sources;
  end if;

  if v_staged_chunks <> v_expected_chunks then
    raise exception
      'YQAA ingestion run % chunk count mismatch: staged %, expected %',
      p_run_id, v_staged_chunks, v_expected_chunks;
  end if;

  -- Remove missing sources first so a source URL whose stable key changed can
  -- be inserted without violating the live source_url uniqueness constraint.
  -- Its chunks are removed by the existing source FK cascade.
  delete from public.yqaa_knowledge_sources as live
   where not exists (
     select 1
       from public.yqaa_knowledge_sources_staging as staged
      where staged.ingestion_run_id = p_run_id
        and staged.source_key = live.source_key
   );

  -- A successful crawl verifies every source. Refresh source freshness and
  -- current-run provenance even when its chunk contents are unchanged.
  insert into public.yqaa_knowledge_sources (
    source_key, site, repository, base_url, source_url, path, title,
    jurisdiction, source_kind, authority_tier, http_status, content_hash,
    fetched_at, last_seen_at, lastmod, active, metadata, ingestion_run_id
  )
  select
    source_key, site, repository, base_url, source_url, path, title,
    jurisdiction, source_kind, authority_tier, http_status, content_hash,
    fetched_at, last_seen_at, lastmod, true, metadata, p_run_id
  from public.yqaa_knowledge_sources_staging
  where ingestion_run_id = p_run_id
  on conflict (source_key) do update set
    site = excluded.site,
    repository = excluded.repository,
    base_url = excluded.base_url,
    source_url = excluded.source_url,
    path = excluded.path,
    title = excluded.title,
    jurisdiction = excluded.jurisdiction,
    source_kind = excluded.source_kind,
    authority_tier = excluded.authority_tier,
    http_status = excluded.http_status,
    content_hash = excluded.content_hash,
    fetched_at = excluded.fetched_at,
    last_seen_at = excluded.last_seen_at,
    lastmod = excluded.lastmod,
    active = true,
    metadata = excluded.metadata,
    ingestion_run_id = excluded.ingestion_run_id;

  -- Stable chunk keys make removals exact. No blanket delete touches retained
  -- rows, so their heap tuple and indexed search representation remain intact.
  delete from public.yqaa_knowledge_chunks as live
   where not exists (
     select 1
       from public.yqaa_knowledge_chunks_staging as staged
      where staged.ingestion_run_id = p_run_id
        and staged.chunk_key = live.chunk_key
   );

  insert into public.yqaa_knowledge_chunks (
    chunk_key, source_key, site, repository, source_url, title, section_title,
    chunk_index, jurisdiction, topic_tags, body, content_hash, authority_tier,
    fetched_at, lastmod, metadata, ingestion_run_id
  )
  select
    chunk_key, source_key, site, repository, source_url, title, section_title,
    chunk_index, jurisdiction, topic_tags, body, content_hash, authority_tier,
    fetched_at, lastmod, metadata, p_run_id
  from public.yqaa_knowledge_chunks_staging
  where ingestion_run_id = p_run_id
  on conflict (chunk_key) do update set
    source_key = excluded.source_key,
    site = excluded.site,
    repository = excluded.repository,
    source_url = excluded.source_url,
    title = excluded.title,
    section_title = excluded.section_title,
    chunk_index = excluded.chunk_index,
    jurisdiction = excluded.jurisdiction,
    topic_tags = excluded.topic_tags,
    body = excluded.body,
    content_hash = excluded.content_hash,
    authority_tier = excluded.authority_tier,
    fetched_at = excluded.fetched_at,
    lastmod = excluded.lastmod,
    metadata = excluded.metadata,
    ingestion_run_id = excluded.ingestion_run_id
  where (
    public.yqaa_knowledge_chunks.source_key,
    public.yqaa_knowledge_chunks.site,
    public.yqaa_knowledge_chunks.repository,
    public.yqaa_knowledge_chunks.source_url,
    public.yqaa_knowledge_chunks.title,
    public.yqaa_knowledge_chunks.section_title,
    public.yqaa_knowledge_chunks.chunk_index,
    public.yqaa_knowledge_chunks.jurisdiction,
    public.yqaa_knowledge_chunks.topic_tags,
    public.yqaa_knowledge_chunks.body,
    public.yqaa_knowledge_chunks.content_hash,
    public.yqaa_knowledge_chunks.authority_tier,
    public.yqaa_knowledge_chunks.lastmod,
    public.yqaa_knowledge_chunks.metadata
  ) is distinct from (
    excluded.source_key,
    excluded.site,
    excluded.repository,
    excluded.source_url,
    excluded.title,
    excluded.section_title,
    excluded.chunk_index,
    excluded.jurisdiction,
    excluded.topic_tags,
    excluded.body,
    excluded.content_hash,
    excluded.authority_tier,
    excluded.lastmod,
    excluded.metadata
  );

  select count(*)::integer into v_source_count
    from public.yqaa_knowledge_sources
   where ingestion_run_id = p_run_id;

  select
    coalesce(sum(site_chunks.chunks), 0)::integer,
    coalesce(
      jsonb_object_agg(
        site_chunks.site,
        site_chunks.sources
      ),
      '{}'::jsonb
    )
    into v_chunk_count, v_site_counts
    from (
      select
        sources.site,
        count(distinct sources.source_key)::integer as sources,
        count(chunks.chunk_key)::integer as chunks
      from public.yqaa_knowledge_sources as sources
      left join public.yqaa_knowledge_chunks as chunks
        on chunks.source_key = sources.source_key
      where sources.ingestion_run_id = p_run_id
      group by sources.site
    ) as site_chunks;

  if v_source_count <> v_staged_sources or v_chunk_count <> v_staged_chunks then
    raise exception
      'YQAA ingestion run % verified count mismatch: sources %/%, chunks %/%',
      p_run_id, v_source_count, v_staged_sources, v_chunk_count, v_staged_chunks;
  end if;

  update public.yqaa_knowledge_ingestion_runs
     set completed_at = now(),
         status = 'completed',
         source_count = v_source_count,
         chunk_count = v_chunk_count,
         site_counts = v_site_counts
   where run_id = p_run_id
     and status = 'running';

  delete from public.yqaa_knowledge_chunks_staging
   where ingestion_run_id = p_run_id;
  delete from public.yqaa_knowledge_sources_staging
   where ingestion_run_id = p_run_id;

  return jsonb_build_object(
    'run_id', p_run_id,
    'source_count', v_source_count,
    'chunk_count', v_chunk_count,
    'site_counts', v_site_counts
  );
end;
$$;

revoke all on function public.finalize_yqaa_knowledge_ingestion(text)
  from public, anon, authenticated;

grant execute on function public.finalize_yqaa_knowledge_ingestion(text)
  to service_role;

-- Keep the retrieval API unchanged while reporting the most recent verified
-- source fetch to freshness consumers. Chunk fetched_at remains the content
-- revision timestamp used for internal result ordering.
select similarity('yqaa', 'yqaa');

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
set pg_trgm.similarity_threshold = '0.08'
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
  candidate_keys as materialized (
    select c.chunk_key
    from public.yqaa_knowledge_chunks c
    cross join q0
    where q0.query_text is not null
      and q0.strict_tsq is not null
      and c.search_vector @@ q0.strict_tsq
    union
    select c.chunk_key
    from public.yqaa_knowledge_chunks c
    cross join q0
    where q0.query_text is not null
      and q0.broad_tsq is not null
      and c.search_vector @@ q0.broad_tsq
    union
    select c.chunk_key
    from public.yqaa_knowledge_chunks c
    cross join q0
    where q0.query_text is not null
      and c.title % q0.query_text
      and similarity(coalesce(c.title,''), q0.query_text) > 0.08
    union
    select c.chunk_key
    from public.yqaa_knowledge_chunks c
    cross join q0
    where q0.query_text is not null
      and c.section_title % q0.query_text
      and similarity(coalesce(c.section_title,''), q0.query_text) > 0.08
  ),
  scored as (
    select
      c.chunk_key,
      c.source_key,
      c.source_url,
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
    from candidate_keys ck
    join public.yqaa_knowledge_chunks c on c.chunk_key = ck.chunk_key
    join public.yqaa_knowledge_sources s on s.source_key = c.source_key
    cross join q0
    where s.active
      and q0.query_text is not null
  ),
  diversified as (
    select *,
      row_number() over (
        partition by source_url
        order by score desc, authority_tier desc, fetched_at desc, chunk_key
      ) as source_rank
    from scored
    where score > 0
  ),
  selected_keys as materialized (
    select chunk_key, score, authority_tier, fetched_at
    from diversified
    where source_rank <= 2
    order by score desc, authority_tier desc, fetched_at desc
    limit (select result_limit from q0)
  )
  select
    c.chunk_key, c.source_key, c.site, c.repository, c.source_url, c.title,
    c.section_title, c.jurisdiction, c.body, c.topic_tags, s.fetched_at,
    c.lastmod, c.authority_tier, selected.score
  from selected_keys selected
  join public.yqaa_knowledge_chunks c on c.chunk_key = selected.chunk_key
  join public.yqaa_knowledge_sources s on s.source_key = c.source_key
  where s.active
  order by selected.score desc, selected.authority_tier desc, selected.fetched_at desc;
$$;

revoke all on function public.search_yqaa_knowledge(text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.search_yqaa_knowledge(text,text,text,integer)
  to service_role;

notify pgrst, 'reload schema';
