-- =============================================================================
-- 20260811_table_guarantees.sql
--
-- Table guarantees: every table referenced by portal server code must exist.
-- Audit (2026-08-11) found these tables queried by API routes / libs but with
-- no CREATE TABLE ever applied to the live Supabase project:
--
--   gig_version_history     (gig_management_v2.sql existed but was never applied)
--   seller_level_thresholds (gig_management_v2.sql existed but was never applied)
--   order_status_counts     (order_scalability.sql existed but was never applied)
--   attorney_chats          (no SQL anywhere)
--   inquiry_threads         (no SQL anywhere)
--   documents               (no SQL anywhere)
--   consultant_ratings      (no SQL anywhere)
--   messages                (no SQL anywhere; legacy startConversation helper)
--
-- ai_provider_keys + ai_settings are covered by migrations/ai_provider_keys.sql
-- (now included in the apply workflow) — this file only backstops them in case
-- that migration is not applied, using CREATE TABLE IF NOT EXISTS so both are
-- safe to run in any order.
--
-- Everything is idempotent: safe to re-run at any time.
-- =============================================================================

-- ─── ai_provider_keys (backstop of migrations/ai_provider_keys.sql) ───────
CREATE TABLE IF NOT EXISTS public.ai_provider_keys (
  provider TEXT PRIMARY KEY,
  api_key TEXT,
  base_url TEXT,
  model TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_provider_keys_enabled
  ON public.ai_provider_keys (enabled);
ALTER TABLE public.ai_provider_keys ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_provider_keys'
      AND policyname = 'ai_provider_keys_deny_anon'
  ) THEN
    CREATE POLICY "ai_provider_keys_deny_anon" ON public.ai_provider_keys
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- ─── ai_settings (backstop) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_settings'
      AND policyname = 'ai_settings_deny_anon'
  ) THEN
    CREATE POLICY "ai_settings_deny_anon" ON public.ai_settings
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- ─── gig_version_history ───────────────────────────────────────────────────
-- From gig_management_v2.sql (never applied). Admin gig moderation snapshots.
CREATE TABLE IF NOT EXISTS public.gig_version_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id          uuid        NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  version_num     integer     NOT NULL,
  changed_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by_role text,
  snapshot        jsonb       NOT NULL,
  change_summary  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gig_version_history_gig_idx
  ON public.gig_version_history (gig_id, version_num DESC);
ALTER TABLE public.gig_version_history ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gig_version_history'
      AND policyname = 'gig_version_history_deny_anon'
  ) THEN
    CREATE POLICY "gig_version_history_deny_anon" ON public.gig_version_history
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- ─── seller_level_thresholds ───────────────────────────────────────────────
-- From gig_management_v2.sql (never applied) + gig_scalability.sql updates.
CREATE TABLE IF NOT EXISTS public.seller_level_thresholds (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  level                 text          NOT NULL UNIQUE
    CHECK (level IN ('new_seller','level_1','level_2','top_rated')),
  min_orders            integer       NOT NULL DEFAULT 0,
  min_avg_rating        numeric(3,2)  NOT NULL DEFAULT 0,
  min_completion_pct    numeric(5,2)  NOT NULL DEFAULT 0,
  min_tenure_days       integer       NOT NULL DEFAULT 0,
  rank_multiplier       numeric(4,2)  NOT NULL DEFAULT 1.0,
  created_at            timestamptz   NOT NULL DEFAULT now()
);
ALTER TABLE public.seller_level_thresholds ADD COLUMN IF NOT EXISTS gig_limit integer NOT NULL DEFAULT 5;
INSERT INTO public.seller_level_thresholds
  (level, min_orders, min_avg_rating, min_completion_pct, min_tenure_days, rank_multiplier, gig_limit)
VALUES
  ('new_seller',  0,   0,    0,    0,   0.80, 5),
  ('level_1',    10,   4.6,  90,   60,  1.00, 10),
  ('level_2',    50,   4.7,  95,   365, 1.10, 15),
  ('top_rated', 100,   4.8,  98,   730, 1.25, 20)
ON CONFLICT (level) DO NOTHING;
ALTER TABLE public.seller_level_thresholds ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'seller_level_thresholds'
      AND policyname = 'seller_level_thresholds_deny_anon'
  ) THEN
    CREATE POLICY "seller_level_thresholds_deny_anon" ON public.seller_level_thresholds
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- ─── order_status_counts ───────────────────────────────────────────────────
-- From order_scalability.sql (never applied). Refreshed by
-- refresh_order_status_counts() for the admin summary strip.
CREATE TABLE IF NOT EXISTS public.order_status_counts (
  status        text PRIMARY KEY,
  count         bigint NOT NULL DEFAULT 0,
  total_amount  numeric(18,2) NOT NULL DEFAULT 0,
  last_updated  timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.refresh_order_status_counts()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.order_status_counts;
  INSERT INTO public.order_status_counts (status, count, total_amount, last_updated)
  SELECT
    status,
    COUNT(*) AS count,
    COALESCE(SUM(total_amount), 0) AS total_amount,
    now() AS last_updated
  FROM public.orders
  GROUP BY status;
END;
$$;
ALTER TABLE public.order_status_counts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_status_counts'
      AND policyname = 'order_status_counts_deny_anon'
  ) THEN
    CREATE POLICY "order_status_counts_deny_anon" ON public.order_status_counts
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- ─── attorney_chats ────────────────────────────────────────────────────────
-- Pre-intake chat threads between students and attorneys.
-- Columns derived from app/api/attorney/conversations/route.ts and
-- app/api/student/conversations/route.ts.
CREATE TABLE IF NOT EXISTS public.attorney_chats (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  attorney_id         uuid        REFERENCES public.attorneys(id) ON DELETE CASCADE,
  client_profile_id   uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_name         text,
  client_email        text,
  last_message        text,
  last_message_at     timestamptz,
  pending_offers      integer     NOT NULL DEFAULT 0,
  unread_for_attorney integer     NOT NULL DEFAULT 0,
  unread_for_client   integer     NOT NULL DEFAULT 0,
  presence            text,
  status              text        NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attorney_chats_attorney_idx
  ON public.attorney_chats (attorney_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS attorney_chats_client_idx
  ON public.attorney_chats (client_profile_id, last_message_at DESC);
ALTER TABLE public.attorney_chats ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'attorney_chats'
      AND policyname = 'attorney_chats_deny_anon'
  ) THEN
    CREATE POLICY "attorney_chats_deny_anon" ON public.attorney_chats
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- ─── inquiry_threads ───────────────────────────────────────────────────────
-- Attorney threads attached to an inquiry (used by client inquiries search).
CREATE TABLE IF NOT EXISTS public.inquiry_threads (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id    uuid        NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  attorney_id   uuid        NOT NULL REFERENCES public.attorneys(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'open',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inquiry_id, attorney_id)
);
CREATE INDEX IF NOT EXISTS inquiry_threads_attorney_idx
  ON public.inquiry_threads (attorney_id);
ALTER TABLE public.inquiry_threads ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'inquiry_threads'
      AND policyname = 'inquiry_threads_deny_anon'
  ) THEN
    CREATE POLICY "inquiry_threads_deny_anon" ON public.inquiry_threads
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- ─── documents ─────────────────────────────────────────────────────────────
-- Generic user document vault (optional in this codebase; lib/documentStorage
-- checks it when present). shared_with is an array of profile ids.
CREATE TABLE IF NOT EXISTS public.documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  bucket        text,
  path          text,
  file_name     text,
  size_bytes    bigint,
  mime_type     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_owner_idx
  ON public.documents (owner_id, created_at DESC);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'documents'
      AND policyname = 'documents_deny_anon'
  ) THEN
    CREATE POLICY "documents_deny_anon" ON public.documents
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- ─── consultant_ratings ────────────────────────────────────────────────────
-- Ratings left for consultants (analog of attorney_ratings).
CREATE TABLE IF NOT EXISTS public.consultant_ratings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id       uuid        NOT NULL REFERENCES public.consultants(id) ON DELETE CASCADE,
  client_profile_id   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  stars               integer     NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consultant_ratings_consultant_idx
  ON public.consultant_ratings (consultant_id, created_at DESC);
ALTER TABLE public.consultant_ratings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'consultant_ratings'
      AND policyname = 'consultant_ratings_deny_anon'
  ) THEN
    CREATE POLICY "consultant_ratings_deny_anon" ON public.consultant_ratings
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- ─── messages (legacy startConversation helper) ────────────────────────────
-- lib/startConversation.ts inserts { conversation_id, sender_id, content }.
-- Kept alongside conversation_messages for backwards compat.
CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  content         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx
  ON public.messages (conversation_id, created_at ASC);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages'
      AND policyname = 'messages_deny_anon'
  ) THEN
    CREATE POLICY "messages_deny_anon" ON public.messages
      FOR ALL TO anon USING (false) WITH CHECK (false);
  END IF;
END;
$$;

-- Notify PostgREST to reload the schema so new tables are immediately visible.
NOTIFY pgrst, 'reload schema';
