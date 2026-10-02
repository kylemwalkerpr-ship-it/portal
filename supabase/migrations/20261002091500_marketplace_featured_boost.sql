-- Market home: curated featured flag lifts high-intent gigs in default sort and search.
--
-- The featured flag is the existing `gigs.featured_until` column (admin
-- "feature_days" already writes it). While it is in the future:
--   1. recompute_gig_rank adds a featured boost of 1.0 to rank_score. Organic
--      scores top out near 1.25, and 201 of ~223 active gigs sit at 0, so
--      featured gigs lead the default listing sort (rank_score desc) and the
--      build-time landing grid, and keep that place when a metric event
--      recomputes their rank.
--   2. marketplace_search_matches adds 0.5 to text_rank, so a featured gig
--      that MATCHES the query ranks first for it (OPT, I-765, F-1, SOP,
--      editing ...). Non-matching gigs are never injected into results.
-- Everything else in both functions is unchanged from the live definitions.
-- No data is changed here; featuring specific gigs is a separate data step.

create or replace function public.recompute_gig_rank(target_gig uuid)
 returns numeric
 language plpgsql
as $function$
declare
  g                record;
  m                record;
  sls              record;
  slt              record;
  recency          numeric := 0.5;
  new_boost        numeric := 0;
  promo_boost      numeric := 0;
  featured_boost   numeric := 0;
  seller_mult      numeric := 0.80;
  log_orders       numeric := 0;
  ctr              numeric := 0;
  content_sc       numeric := 0;
  score            numeric := 0;
begin
  select * into g from public.gigs where id = target_gig;
  if not found then return 0; end if;

  select * into m from public.gig_metrics where gig_id = target_gig;

  -- Resolve seller level multiplier from latest snapshot
  select sls.* into sls
  from public.seller_level_snapshots sls
  where sls.provider_profile_id = g.provider_id
    and sls.provider_type = g.provider_type
  limit 1;

  if found then
    -- Map snapshot level → threshold multiplier
    select slt.rank_multiplier into seller_mult
    from public.seller_level_thresholds slt
    where slt.level = case sls.level
      when 'top_attorney'    then 'top_rated'
      when 'top_consultant'  then 'top_rated'
      else sls.level
    end
    limit 1;
    if seller_mult is null then
      seller_mult := 0.80;
    end if;
  else
    -- Fall back to new_seller multiplier
    select slt.rank_multiplier into seller_mult
    from public.seller_level_thresholds slt
    where slt.level = 'new_seller';
    if seller_mult is null then seller_mult := 0.80; end if;
  end if;

  if g.published_at is not null then
    recency := greatest(
      0.5,
      1 - (least(180, extract(day from now() - g.published_at)) / 360)
    );
    if g.order_count < 5
       and g.review_count < 3
       and g.published_at > now() - interval '14 days'
    then
      new_boost := 0.15;
    end if;
  end if;

  if g.boost_until > now() then
    promo_boost := 0.10;
  end if;

  -- Curated featured flag (Market home "Most requested"): lead the default sort.
  if g.featured_until > now() then
    featured_boost := 1.0;
  end if;

  log_orders  := least(ln(greatest(g.order_count, 0) + 1), 5) / 5;
  ctr         := least(coalesce(m.click_through_rate, 0), 1);
  content_sc  := least(coalesce(g.content_score, 0), 100) / 100;

  score :=
    ((least(g.avg_rating, 5) / 5) * 0.30)
    + (log_orders                  * 0.25)
    + (ctr                         * 0.15)
    + (recency                     * 0.15)
    + (seller_mult                 * 0.10)
    + (content_sc                  * 0.05)
    + new_boost
    + promo_boost
    + featured_boost;

  update public.gigs
  set rank_score = round(score, 4), updated_at = now()
  where id = target_gig;

  return round(score, 4);
end;
$function$;

create or replace function public.marketplace_search_matches(p_query text, p_limit integer default 400)
 returns table(gig_id uuid, text_rank real, exact_tag_match boolean)
 language sql
 stable
 set search_path to 'public'
as $function$
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
      -- Curated featured flag: a featured gig that matches ranks first.
      + case when g.featured_until > now() then 0.5 else 0 end
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
$function$;
