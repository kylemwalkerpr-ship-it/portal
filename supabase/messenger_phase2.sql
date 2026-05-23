-- All Phase-2 schema changes in one defensive migration. Run via Supabase SQL Editor.
begin;

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  pinned_at       timestamptz,
  archived_at     timestamptz,
  muted_until     timestamptz,
  deleted_at      timestamptz,
  starred_message_ids uuid[] not null default '{}',
  primary key (conversation_id, profile_id)
);

create table if not exists public.conversation_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.conversation_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, profile_id, emoji)
);

alter table public.conversation_messages
  add column if not exists reply_to_id uuid references public.conversation_messages(id) on delete set null;

alter table public.conversations
  add column if not exists type text not null default 'dm' check (type in ('dm','group'));

commit;
