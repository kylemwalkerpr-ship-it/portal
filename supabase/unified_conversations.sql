-- =============================================================================
-- unified_conversations.sql
--
-- Fiverr-style unified messaging: one conversation per buyer↔seller pair,
-- polymorphic message types, last-read tracking. Audit-of-record stays in
-- order_messages / inquiry_messages — this layer is the inbox.
--
-- Safe to re-run. Run each block (delimited by blank lines) separately in the
-- Supabase SQL editor — JSONB defaults with newlines confuse the editor.
-- =============================================================================

-- ─── conversations: one row per participant pair ───────────────────────────
create table if not exists public.conversations (
  id                uuid primary key default gen_random_uuid(),
  participant_a     uuid not null references public.profiles(id) on delete cascade,
  participant_b     uuid not null references public.profiles(id) on delete cascade,
  context_kind      text not null default 'general',
  context_id        uuid,
  status            text not null default 'active',
  last_message_at   timestamptz,
  last_message_id   uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- enforce a < b at insert time so lookup is O(1) regardless of caller order
  constraint conversations_participants_ordered check (participant_a < participant_b),
  constraint conversations_status_check check (status in ('active', 'archived')),
  constraint conversations_context_kind_check check (context_kind in ('general', 'order', 'inquiry', 'gig')),
  unique (participant_a, participant_b)
);

create index if not exists conversations_a_last_idx on public.conversations (participant_a, last_message_at desc);
create index if not exists conversations_b_last_idx on public.conversations (participant_b, last_message_at desc);
create index if not exists conversations_context_idx on public.conversations (context_kind, context_id) where context_id is not null;
create index if not exists conversations_last_idx on public.conversations (last_message_at desc);

-- ─── conversation_messages: polymorphic message rows ───────────────────────
create table if not exists public.conversation_messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations(id) on delete cascade,
  sender_id         uuid not null references public.profiles(id) on delete set null,
  type              text not null default 'text',
  body              text,
  attachment_url    text,
  attachment_name   text,
  ref_offer_id      uuid,
  ref_order_id      uuid,
  ref_inquiry_id    uuid,
  ref_message_id    uuid,  -- backwards link to the legacy table row (order_messages.id or inquiry_messages.id)
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint conversation_messages_type_check check (type in ('text', 'attachment', 'offer', 'order_event', 'inquiry_event', 'system'))
);

create index if not exists conv_messages_conv_idx     on public.conversation_messages (conversation_id, created_at desc);
create index if not exists conv_messages_sender_idx   on public.conversation_messages (sender_id, created_at desc);
create index if not exists conv_messages_ref_order    on public.conversation_messages (ref_order_id)   where ref_order_id   is not null;
create index if not exists conv_messages_ref_inquiry  on public.conversation_messages (ref_inquiry_id) where ref_inquiry_id is not null;

-- ─── conversation_reads: last-read pointer per participant ─────────────────
create table if not exists public.conversation_reads (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  last_read_at     timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create index if not exists conv_reads_profile_idx on public.conversation_reads (profile_id, last_read_at desc);

-- ─── Helper: get-or-create the conversation between two participants ──────
-- Always returns a single uuid. Caller passes any two profile ids; the function
-- normalises ordering before lookup/insert.
create or replace function public.get_or_create_conversation(
  p_a uuid,
  p_b uuid,
  p_context_kind text default 'general',
  p_context_id uuid default null
) returns uuid
language plpgsql
as $$
declare
  lo uuid;
  hi uuid;
  conv_id uuid;
begin
  if p_a is null or p_b is null then
    raise exception 'Both participants required';
  end if;
  if p_a = p_b then
    raise exception 'Self-conversations are not allowed';
  end if;
  if p_a < p_b then lo := p_a; hi := p_b; else lo := p_b; hi := p_a; end if;

  select id into conv_id
    from public.conversations
   where participant_a = lo and participant_b = hi;

  if conv_id is null then
    insert into public.conversations (participant_a, participant_b, context_kind, context_id)
    values (lo, hi, coalesce(p_context_kind, 'general'), p_context_id)
    returning id into conv_id;
  end if;

  return conv_id;
end $$;

grant execute on function public.get_or_create_conversation(uuid, uuid, text, uuid) to anon, authenticated, service_role;

-- ─── Helper: keep conversations.last_message_* fresh ──────────────────────
create or replace function public.trg_conversation_messages_after_insert()
returns trigger language plpgsql as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_id = new.id,
         updated_at      = now()
   where id = new.conversation_id;
  return null;
end $$;

drop trigger if exists conv_messages_bump_conv on public.conversation_messages;
create trigger conv_messages_bump_conv
  after insert on public.conversation_messages
  for each row execute procedure public.trg_conversation_messages_after_insert();

-- ─── Unread helper: count distinct conversations with unread for profile ──
create or replace function public.conversation_unread_count(p_profile_id uuid)
returns integer
language sql stable
as $$
  select coalesce(count(distinct c.id), 0)::int
    from public.conversations c
    left join public.conversation_reads r
      on r.conversation_id = c.id and r.profile_id = p_profile_id
   where (c.participant_a = p_profile_id or c.participant_b = p_profile_id)
     and c.last_message_id is not null
     and exists (
       select 1 from public.conversation_messages m
        where m.conversation_id = c.id
          and m.sender_id <> p_profile_id
          and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
     );
$$;

grant execute on function public.conversation_unread_count(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
