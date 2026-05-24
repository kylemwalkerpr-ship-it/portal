-- ────────────────────────────────────────────────────────────────────
-- Brief 47 — Inquiry full lifecycle: archive, delete-guard, 30d cron.
-- Idempotent. Runs after inquiries_pipeline.sql + inquiry_cleanup_cron.sql.
-- ────────────────────────────────────────────────────────────────────

-- 1. Extend status check constraint to include 'archived' and 'engaged'
--    ('engaged' is already used by the attorney-messages route — formalize it).
alter table public.inquiries
  drop constraint if exists inquiries_status_check;
alter table public.inquiries
  add constraint inquiries_status_check
  check (status in ('open','claimed','engaged','converted','closed','cancelled','archived'));

-- 2. Archive metadata columns.
alter table public.inquiries
  add column if not exists archived_at      timestamptz,
  add column if not exists archived_by_role text check (archived_by_role in ('client','admin','support','system')),
  add column if not exists archived_reason  text;

create index if not exists inquiries_archived_idx
  on public.inquiries(archived_at)
  where archived_at is not null;

-- 3. Trigger: refuse hard-delete when an order points at this inquiry.
--    Schema-side enforcement of "order-linked inquiries cannot be deleted,
--    only archived" — defensive against API bugs.
create or replace function public.prevent_inquiry_delete_if_order_exists()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.orders
     where source_inquiry_id = old.id
  ) then
    raise exception
      'INQUIRY_DELETE_BLOCKED: inquiry % is the source of one or more orders; archive instead.', old.id
      using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_block_inquiry_delete_with_order on public.inquiries;
create trigger trg_block_inquiry_delete_with_order
  before delete on public.inquiries
  for each row execute function public.prevent_inquiry_delete_if_order_exists();

-- 4. 30-day stale auto-delete cron.
--    Coexists with the 14-day close cron in inquiry_cleanup_cron.sql
--    (that one only sets status='closed'; this one hard-deletes).
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-stale-inquiries-30d') then
    perform cron.unschedule('purge-stale-inquiries-30d');
  end if;
end $$;

select cron.schedule(
  'purge-stale-inquiries-30d',
  '15 3 * * *',
  $job$
    delete from public.inquiries i
     where i.created_at < now() - interval '30 days'
       and i.archived_at is null
       and i.status not in ('converted')
       and not exists (
         select 1 from public.orders o where o.source_inquiry_id = i.id
       );
  $job$
);

-- 5. Realtime publication — ensure inquiries is in supabase_realtime so the
--    UI can subscribe to update/delete events. No-op if already present.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'inquiries'
  ) then
    execute 'alter publication supabase_realtime add table public.inquiries';
  end if;
end $$;
