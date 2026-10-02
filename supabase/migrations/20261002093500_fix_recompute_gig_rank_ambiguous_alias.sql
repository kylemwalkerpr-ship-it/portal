-- Fix recompute_gig_rank: every call failed with 42702 "column reference sls.* is ambiguous".
--
-- The PL/pgSQL record variables `sls` / `slt` shared their names with the
-- table aliases in the seller-level lookups, so Postgres could not tell the
-- variable from the alias and raised before any score was written. The
-- gig-metrics route swallows the error, which is why ~200 active gigs still
-- carry rank_score 0. The table aliases are renamed (snap / thr); scoring
-- logic, weights and the featured boost from 20261002091500 are unchanged.
-- Verified against production data with a session-temporary copy of this
-- body (no writes) before shipping.

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
  select snap.* into sls
  from public.seller_level_snapshots snap
  where snap.provider_profile_id = g.provider_id
    and snap.provider_type = g.provider_type
  limit 1;

  if found then
    -- Map snapshot level → threshold multiplier
    select thr.rank_multiplier into seller_mult
    from public.seller_level_thresholds thr
    where thr.level = case sls.level
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
    select thr.rank_multiplier into seller_mult
    from public.seller_level_thresholds thr
    where thr.level = 'new_seller';
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
