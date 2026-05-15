-- =============================================================================
-- unified_conversations_backfill.sql
--
-- Ingests every historic message from order_messages and inquiry_messages
-- into the unified conversation_messages table. Run ONCE after
-- unified_conversations.sql.
--
-- Idempotent: uses ref_message_id to skip rows already ingested.
-- Safe to re-run.
-- =============================================================================

-- ─── 1. Order messages ─────────────────────────────────────────────────────
-- Each order_messages row maps to a conversation between the order's client
-- and consultant (= attorney for attorney orders).
insert into public.conversation_messages
  (conversation_id, sender_id, type, body, ref_order_id, ref_message_id, created_at)
select
  public.get_or_create_conversation(o.client_id, o.consultant_id, 'order', o.id),
  case
    when om.sender_role = 'client'    then o.client_id
    when om.sender_role in ('attorney', 'consultant') then o.consultant_id
    else coalesce(om.sender_id, o.consultant_id)
  end as sender_id,
  case
    when om.body is null or om.body = '' then 'system'
    else 'text'
  end as type,
  om.body,
  om.order_id,
  om.id,
  om.created_at
from public.order_messages om
join public.orders o on o.id = om.order_id
where o.client_id is not null
  and o.consultant_id is not null
  and o.client_id <> o.consultant_id
  and not exists (
    select 1 from public.conversation_messages cm where cm.ref_message_id = om.id
  );

-- ─── 2. Inquiry messages ──────────────────────────────────────────────────
-- Conversation between the inquiry client and target attorney profile.
insert into public.conversation_messages
  (conversation_id, sender_id, type, body, ref_inquiry_id, ref_message_id, created_at)
select
  public.get_or_create_conversation(i.client_profile_id, i.target_attorney_profile_id, 'inquiry', i.id),
  case
    when im.sender_role = 'client'   then i.client_profile_id
    when im.sender_role = 'attorney' then i.target_attorney_profile_id
    else coalesce(im.sender_profile_id, i.target_attorney_profile_id)
  end as sender_id,
  case when im.body is null or im.body = '' then 'system' else 'text' end,
  im.body,
  im.inquiry_id,
  im.id,
  im.created_at
from public.inquiry_messages im
join public.inquiries i on i.id = im.inquiry_id
where i.client_profile_id is not null
  and i.target_attorney_profile_id is not null
  and i.client_profile_id <> i.target_attorney_profile_id
  and not exists (
    select 1 from public.conversation_messages cm where cm.ref_message_id = im.id
  );

-- ─── 3. Recompute conversations.last_message_* from the merged data ───────
update public.conversations c
   set last_message_at = m.created_at,
       last_message_id = m.id,
       updated_at      = now()
  from (
    select distinct on (conversation_id)
      conversation_id, id, created_at
    from public.conversation_messages
    order by conversation_id, created_at desc
  ) m
 where m.conversation_id = c.id;

-- ─── Summary ──────────────────────────────────────────────────────────────
-- Returns row counts so you can verify in the editor.
select
  (select count(*) from public.conversations)         as conversations_total,
  (select count(*) from public.conversation_messages) as messages_total,
  (select count(*) from public.conversation_messages where ref_order_id is not null)   as messages_from_orders,
  (select count(*) from public.conversation_messages where ref_inquiry_id is not null) as messages_from_inquiries;
