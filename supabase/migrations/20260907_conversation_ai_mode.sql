-- Part B: SuperGrok AI closer — conversation AI state
-- Safe to re-run. Stores ai_mode and reply bookkeeping in conversations.metadata.

alter table public.conversations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.conversations.metadata is
  'Messenger extras. ai_mode: auto|paused|off; ai_last_reply_at; ai_last_trigger_message_id; ai_disclosed';

create index if not exists conversations_ai_mode_idx
  on public.conversations ((metadata->>'ai_mode'))
  where metadata ? 'ai_mode';

notify pgrst, 'reload schema';
