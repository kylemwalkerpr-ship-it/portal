-- ============================================================================
-- 20260919_reward_dedupe_full_unique.sql
--
-- Make reward-event idempotency compatible with PostgREST/Supabase bulk upsert.
-- The original 20260903 index was partial (`WHERE dedupe_key IS NOT NULL`).
-- PostgreSQL cannot infer that partial index for `ON CONFLICT (dedupe_key)`
-- unless the conflict predicate is also supplied, which supabase-js `upsert`
-- cannot express via `onConflict`.
--
-- A normal UNIQUE index is the correct invariant here: PostgreSQL permits
-- multiple NULL values in a UNIQUE index, so legacy/non-keyed audit rows remain
-- valid while every non-null dedupe_key stays globally unique.
-- ============================================================================

DROP INDEX IF EXISTS public.uq_reward_events_dedupe;

CREATE UNIQUE INDEX uq_reward_events_dedupe
  ON public.seo_reward_events (dedupe_key);

COMMENT ON INDEX public.uq_reward_events_dedupe IS
  'Global reward-event idempotency key; non-partial so ON CONFLICT (dedupe_key) bulk upserts are valid. Multiple NULL keys remain allowed by PostgreSQL UNIQUE semantics.';

NOTIFY pgrst, 'reload schema';
