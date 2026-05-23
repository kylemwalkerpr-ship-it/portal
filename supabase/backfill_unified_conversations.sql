-- One-shot backfill: populate `conversations` + `conversation_messages`
-- from historical `inquiry_messages` and `order_messages` so the unified
-- UnifiedInbox surfaces threads that pre-date the mirror-on-write code.
--
-- HOW TO RUN:
--   1. Open Supabase Dashboard → SQL Editor for the prod project
--      (krggzrxxnqfsbbklatxl).
--   2. Paste this entire file, click Run.
--   3. Re-running is safe — every INSERT guards against duplicates via
--      a NOT EXISTS check on (ref_message_id, ref_order_id) keys.
--
-- WHY: until commit <next>, several send-sites
--   (client/attorney-chats, attorney/chats, attorney/inquiries,
--   consultant/messages) wrote only to the legacy per-surface tables
--   and skipped the mirrorMessage() call. Those messages never appear
--   in the unified Messages tab.

BEGIN;

-- ── INQUIRY MESSAGES ────────────────────────────────────────────────
-- Pair each historical inquiry_message with its (client, attorney)
-- counterparts and route into a conversation per pair + inquiry.
WITH paired AS (
  SELECT
    im.id                                      AS msg_id,
    im.inquiry_id,
    im.sender_profile_id,
    im.sender_role,
    im.body,
    im.created_at,
    i.client_profile_id,
    CASE
      WHEN im.sender_role = 'attorney' THEN im.sender_profile_id
      WHEN im.sender_role = 'client'   THEN COALESCE(
        i.target_attorney_profile_id,
        i.claimed_by_attorney_id
      )
    END                                        AS attorney_profile_id
  FROM public.inquiry_messages im
  JOIN public.inquiries i ON i.id = im.inquiry_id
  WHERE im.body IS NOT NULL
    AND im.sender_profile_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_messages cm
      WHERE cm.ref_message_id = im.id
    )
),
resolved AS (
  SELECT
    msg_id,
    inquiry_id,
    sender_profile_id,
    body,
    created_at,
    client_profile_id,
    attorney_profile_id
  FROM paired
  WHERE attorney_profile_id IS NOT NULL
    AND client_profile_id   IS NOT NULL
    AND attorney_profile_id <> client_profile_id
)
INSERT INTO public.conversation_messages
  (conversation_id, sender_id, type, body, ref_inquiry_id, ref_message_id, created_at, metadata)
SELECT
  public.get_or_create_conversation(
    LEAST(r.client_profile_id, r.attorney_profile_id),
    GREATEST(r.client_profile_id, r.attorney_profile_id),
    'inquiry'::text,
    r.inquiry_id::text
  ),
  r.sender_profile_id,
  'text',
  r.body,
  r.inquiry_id,
  r.msg_id,
  r.created_at,
  '{"backfilled": true}'::jsonb
FROM resolved r
ON CONFLICT DO NOTHING;

-- ── ORDER MESSAGES ──────────────────────────────────────────────────
-- Each order has a single client + single provider (attorney or
-- consultant). Route every order_message into a single conversation
-- keyed by the order.
WITH paired AS (
  SELECT
    om.id                AS msg_id,
    om.order_id,
    om.sender_id,
    om.body,
    om.created_at,
    o.client_id,
    COALESCE(o.attorney_id, o.consultant_id) AS provider_id
  FROM public.order_messages om
  JOIN public.orders o ON o.id = om.order_id
  WHERE om.body IS NOT NULL
    AND om.sender_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_messages cm
      WHERE cm.ref_message_id = om.id
    )
),
resolved AS (
  SELECT *
  FROM paired
  WHERE provider_id IS NOT NULL
    AND client_id   IS NOT NULL
    AND provider_id <> client_id
)
INSERT INTO public.conversation_messages
  (conversation_id, sender_id, type, body, ref_order_id, ref_message_id, created_at, metadata)
SELECT
  public.get_or_create_conversation(
    LEAST(r.client_id, r.provider_id),
    GREATEST(r.client_id, r.provider_id),
    'order'::text,
    r.order_id::text
  ),
  r.sender_id,
  'text',
  r.body,
  r.order_id,
  r.msg_id,
  r.created_at,
  '{"backfilled": true}'::jsonb
FROM resolved r
ON CONFLICT DO NOTHING;

-- ── REPORT ──────────────────────────────────────────────────────────
-- Surface a quick count so you can sanity-check what landed.
SELECT
  'inquiry_messages_backfilled'  AS metric,
  COUNT(*) FILTER (WHERE ref_message_id IS NOT NULL AND ref_inquiry_id IS NOT NULL AND metadata->>'backfilled' = 'true') AS rows
FROM public.conversation_messages
UNION ALL
SELECT
  'order_messages_backfilled',
  COUNT(*) FILTER (WHERE ref_message_id IS NOT NULL AND ref_order_id IS NOT NULL AND metadata->>'backfilled' = 'true')
FROM public.conversation_messages;

COMMIT;
