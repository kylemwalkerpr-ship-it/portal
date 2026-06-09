-- fix_escrow_status_trigger.sql
--
-- BUG: the BEFORE UPDATE trigger escrow_on_order_status_change() on
-- public.orders reads platform settings with `where id = 'default'`, but
-- public.platform_settings has NO `id` column — its key column is `key`.
-- So every order status change (attorney "Start order", consultant "accept",
-- any /status transition) threw `column "id" does not exist`, the UPDATE was
-- aborted, and the order stayed stuck in its prior status.
--
-- Fix: read settings by `key = 'default'`. Function body is otherwise identical.

CREATE OR REPLACE FUNCTION public.escrow_on_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  auto_days integer := 7;
  is_enabled boolean := true;
begin
  -- Only react to status changes
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Read auto-release config (platform_settings is keyed by `key`, not `id`).
  select coalesce(escrow_auto_release_days, 7),
         coalesce(escrow_auto_release_enabled, true)
    into auto_days, is_enabled
    from public.platform_settings
   where key = 'default'
   limit 1;

  -- Status: completed → schedule auto-release
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then
    if is_enabled and new.escrow_status = 'held' then
      new.auto_release_eligible_at := now() + (auto_days * interval '1 day');
      insert into public.escrow_events (order_id, event_type, amount, balance_after, actor_role, reason, metadata)
      values (new.id, 'auto_release_scheduled', null, new.escrow_amount, 'system',
              format('Order completed — auto-release in %s days', auto_days),
              jsonb_build_object('eligible_at', new.auto_release_eligible_at));
    end if;
  end if;

  -- Status: revision_requested while completed → cancel scheduled auto-release
  if new.status = 'revision_requested' and old.status = 'completed' then
    if new.auto_release_eligible_at is not null then
      insert into public.escrow_events (order_id, event_type, balance_after, actor_role, reason)
      values (new.id, 'auto_release_cancelled', new.escrow_amount, 'system',
              'Auto-release cancelled — revision requested');
      new.auto_release_eligible_at := null;
    end if;
  end if;

  -- Status: cancelled → refund the held amount
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if new.escrow_status = 'held' and new.escrow_amount > 0 then
      new.escrow_status := 'refunded';
      new.escrow_refunded_amount := coalesce(new.escrow_refunded_amount, 0) + new.escrow_amount;
      new.escrow_amount := 0;
      insert into public.escrow_events (order_id, event_type, amount, balance_after, actor_role, reason)
      values (new.id, 'refund', -1 * coalesce(new.escrow_refunded_amount, 0), 0, 'system',
              'Order cancelled — funds refunded');
    end if;
  end if;

  -- Status: refunded → mirror to escrow
  if new.status = 'refunded' and new.escrow_status <> 'refunded' then
    new.escrow_status := 'refunded';
    if coalesce(new.escrow_amount, 0) > 0 then
      new.escrow_refunded_amount := coalesce(new.escrow_refunded_amount, 0) + new.escrow_amount;
      new.escrow_amount := 0;
    end if;
  end if;

  return new;
end;
$function$;
