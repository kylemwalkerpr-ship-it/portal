create table if not exists public.yqaa_knowledge_ingestion_runs (
  run_id text primary key,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running'
    check (status in ('running','completed','rejected','failed')),
  source_count integer not null default 0,
  chunk_count integer not null default 0,
  site_counts jsonb not null default '{}'::jsonb,
  problems jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.yqaa_knowledge_sources (
  source_key text primary key,
  site text not null,
  repository text not null,
  base_url text not null,
  source_url text not null unique,
  path text not null default '/',
  title text,
  jurisdiction text,
  source_kind text not null default 'live_html',
  authority_tier smallint not null default 3 check (authority_tier between 1 and 5),
  http_status integer,
  content_hash text not null,
  fetched_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  lastmod timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.yqaa_knowledge_chunks (
  chunk_key text primary key,
  source_key text not null references public.yqaa_knowledge_sources(source_key) on delete cascade,
  site text not null,
  repository text not null,
  source_url text not null,
  title text,
  section_title text,
  chunk_index integer not null,
  jurisdiction text,
  topic_tags text[] not null default '{}'::text[],
  body text not null,
  content_hash text not null,
  authority_tier smallint not null default 3 check (authority_tier between 1 and 5),
  fetched_at timestamptz not null default now(),
  lastmod timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector,
  unique (source_key, chunk_index)
);

create or replace function public.yqaa_knowledge_chunks_search_vector()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.search_vector :=
    to_tsvector(
      'english'::regconfig,
      coalesce(new.title,'') || ' ' ||
      coalesce(new.section_title,'') || ' ' ||
      coalesce(array_to_string(new.topic_tags,' '),'') || ' ' ||
      coalesce(new.body,'')
    );
  return new;
end;
$$;

drop trigger if exists yqaa_knowledge_chunks_search_vector_trg
  on public.yqaa_knowledge_chunks;
create trigger yqaa_knowledge_chunks_search_vector_trg
before insert or update of title, section_title, topic_tags, body
on public.yqaa_knowledge_chunks
for each row execute function public.yqaa_knowledge_chunks_search_vector();

create index if not exists yqaa_knowledge_sources_site_idx
  on public.yqaa_knowledge_sources(site);
create index if not exists yqaa_knowledge_sources_jurisdiction_idx
  on public.yqaa_knowledge_sources(jurisdiction);
create index if not exists yqaa_knowledge_sources_active_seen_idx
  on public.yqaa_knowledge_sources(active, last_seen_at desc);
create index if not exists yqaa_knowledge_chunks_site_idx
  on public.yqaa_knowledge_chunks(site);
create index if not exists yqaa_knowledge_chunks_jurisdiction_idx
  on public.yqaa_knowledge_chunks(jurisdiction);
create index if not exists yqaa_knowledge_chunks_source_idx
  on public.yqaa_knowledge_chunks(source_key);
create index if not exists yqaa_knowledge_chunks_search_gin
  on public.yqaa_knowledge_chunks using gin(search_vector);
create index if not exists yqaa_knowledge_chunks_title_trgm
  on public.yqaa_knowledge_chunks using gin(title gin_trgm_ops);
create index if not exists yqaa_knowledge_chunks_section_trgm
  on public.yqaa_knowledge_chunks using gin(section_title gin_trgm_ops);

alter table public.yqaa_knowledge_ingestion_runs enable row level security;
alter table public.yqaa_knowledge_sources enable row level security;
alter table public.yqaa_knowledge_chunks enable row level security;

revoke all on public.yqaa_knowledge_ingestion_runs from anon, authenticated;
revoke all on public.yqaa_knowledge_sources from anon, authenticated;
revoke all on public.yqaa_knowledge_chunks from anon, authenticated;

grant select, insert, update, delete
  on public.yqaa_knowledge_ingestion_runs to service_role;
grant select, insert, update, delete
  on public.yqaa_knowledge_sources to service_role;
grant select, insert, update, delete
  on public.yqaa_knowledge_chunks to service_role;

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
  q as (
    select
      query_text,
      origin_site,
      jurisdiction_filter,
      result_limit,
      case when query_text is null then null
           else websearch_to_tsquery('english'::regconfig, query_text)
      end as tsq
    from args
  ),
  ranked as (
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
          when q.tsq is not null
            then ts_rank_cd(c.search_vector, q.tsq, 32) * 12.0
          else 0
        end
        + greatest(
            similarity(coalesce(c.title,''), coalesce(q.query_text,'')),
            similarity(coalesce(c.section_title,''), coalesce(q.query_text,''))
          ) * 2.0
        + case
            when q.origin_site is not null and c.site = q.origin_site then 1.25
            else 0
          end
        + case
            when q.jurisdiction_filter is not null
              and lower(coalesce(c.jurisdiction,'')) = lower(q.jurisdiction_filter)
              then 4.0
            else 0
          end
        + (c.authority_tier::double precision * 0.15)
      ) as score
    from public.yqaa_knowledge_chunks c
    join public.yqaa_knowledge_sources s on s.source_key = c.source_key
    cross join q
    where s.active
      and q.query_text is not null
      and (
        (q.tsq is not null and c.search_vector @@ q.tsq)
        or similarity(coalesce(c.title,''), q.query_text) > 0.08
        or similarity(coalesce(c.section_title,''), q.query_text) > 0.08
      )
  )
  select *
  from ranked
  order by score desc, authority_tier desc, fetched_at desc
  limit (select result_limit from q);
$$;

revoke all on function public.search_yqaa_knowledge(text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.search_yqaa_knowledge(text,text,text,integer)
  to service_role;

comment on table public.yqaa_knowledge_sources is
  'Public YouSafe estate pages verified from deployed surfaces. No private Portal/account/order/message data.';
comment on table public.yqaa_knowledge_chunks is
  'Section-level public evidence for YQAA retrieval with provenance, freshness and server-side full-text ranking.';
