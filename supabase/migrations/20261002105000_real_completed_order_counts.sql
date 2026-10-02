-- Real completed-order counts for gigs (seller cards, gig pages, rankings).
--
-- Before: gigs.order_count was a stored counter bumped at checkout (order
-- creation), so cancelled orders and owner test purchases counted as
-- "completed orders". Every reader (gig page, seller cards, seller profile,
-- trust bar, recompute_gig_rank) sums or shows this column.
--
-- After: gigs.order_count is derived. It only counts orders that
--   * are attributed to the gig (orders.gig_id; checkout already sends it),
--   * reached a successful terminal status: completed or released,
--   * were not refunded,
--   * were placed by a buyer who is not the gig's own provider, not staff
--     (admin/support) and not flagged profiles.is_test_account.
-- A guard trigger on gigs pins order_count to that truth on every insert or
-- order_count write (so the checkout "+1" and any seed values are overridden),
-- and a trigger on orders refreshes the gig when an order changes.
-- Historical orders carry no gig_id, so existing counts become 0.
-- Neither trigger can block an order or gig write: failures only warn.

alter table public.orders add column if not exists gig_id uuid;
create index if not exists orders_gig_id_idx on public.orders (gig_id) where gig_id is not null;

alter table public.profiles add column if not exists is_test_account boolean not null default false;

create or replace function public.real_completed_order_count(p_gig_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.orders o
  join public.gigs g on g.id = o.gig_id
  left join public.profiles b on b.id = o.client_id
  where o.gig_id = p_gig_id
    and o.status in ('completed', 'released')
    and coalesce(o.refunded_amount, 0) = 0
    and coalesce(o.refund_status, '') not in ('succeeded', 'refunded')
    and o.client_id is not null
    and o.client_id <> g.provider_id
    and coalesce(b.is_test_account, false) = false
    and coalesce(b.role, '') not in ('admin', 'support');
$$;

create or replace function public.gigs_real_order_count_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    new.order_count := coalesce(public.real_completed_order_count(new.id), 0);
  exception when others then
    raise warning 'gigs_real_order_count_guard: %', sqlerrm;
    if tg_op = 'UPDATE' then
      new.order_count := old.order_count;
    else
      new.order_count := 0;
    end if;
  end;
  return new;
end;
$$;

drop trigger if exists gigs_real_order_count_guard on public.gigs;
create trigger gigs_real_order_count_guard
  before insert or update of order_count on public.gigs
  for each row execute function public.gigs_real_order_count_guard();

create or replace function public.refresh_gig_real_order_count(p_gig_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_gig_id is null then
    return;
  end if;
  -- The guard trigger recomputes the value; this write just fires it.
  update public.gigs set order_count = order_count where id = p_gig_id;
exception when others then
  raise warning 'refresh_gig_real_order_count(%): %', p_gig_id, sqlerrm;
end;
$$;

create or replace function public.orders_refresh_gig_order_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_op in ('UPDATE', 'DELETE') and old.gig_id is not null then
      perform public.refresh_gig_real_order_count(old.gig_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.gig_id is not null
       and (tg_op = 'INSERT' or new.gig_id is distinct from old.gig_id
            or new.status is distinct from old.status
            or new.client_id is distinct from old.client_id
            or new.refunded_amount is distinct from old.refunded_amount
            or new.refund_status is distinct from old.refund_status) then
      perform public.refresh_gig_real_order_count(new.gig_id);
    end if;
  exception when others then
    raise warning 'orders_refresh_gig_order_count: %', sqlerrm;
  end;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_refresh_gig_order_count on public.orders;
create trigger orders_refresh_gig_order_count
  after insert or update or delete on public.orders
  for each row execute function public.orders_refresh_gig_order_count();

create or replace function public.profiles_refresh_gig_order_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gig uuid;
begin
  begin
    for v_gig in
      select distinct o.gig_id from public.orders o
      where o.client_id = new.id and o.gig_id is not null
    loop
      perform public.refresh_gig_real_order_count(v_gig);
    end loop;
  exception when others then
    raise warning 'profiles_refresh_gig_order_count: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists profiles_refresh_gig_order_count on public.profiles;
create trigger profiles_refresh_gig_order_count
  after update of is_test_account, role on public.profiles
  for each row
  when (old.is_test_account is distinct from new.is_test_account or old.role is distinct from new.role)
  execute function public.profiles_refresh_gig_order_count();

revoke all on function public.real_completed_order_count(uuid) from public, anon, authenticated;
revoke all on function public.refresh_gig_real_order_count(uuid) from public, anon, authenticated;

-- Backfill: recompute every gig that currently shows a stored count.
update public.gigs set order_count = order_count where coalesce(order_count, 0) <> 0;
