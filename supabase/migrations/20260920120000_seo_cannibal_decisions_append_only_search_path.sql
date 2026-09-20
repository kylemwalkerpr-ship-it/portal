-- ============================================================================
-- 20260920120000_seo_cannibal_decisions_append_only_search_path.sql
--
-- Post-P4 Supabase advisor remediation (additive, function-only).
--
-- Advisor finding: public.seo_cannibal_decisions_append_only has a mutable
-- search_path. The P4 migration (20260920090000_p4_cannibal_decisions.sql) is
-- already applied and stays byte-for-byte untouched. This migration carries the
-- fix instead of rewriting history.
--
-- The trigger body is a single RAISE EXCEPTION with no relation, type or
-- function references, so an empty search_path cannot break it. `alter function
-- ... set` is the smallest DDL that changes proconfig (the value the advisor
-- reads) without re-declaring the body, and it converges if re-run.
--
-- Deliberately out of scope: every other pre-existing advisor finding.
-- ============================================================================

alter function public.seo_cannibal_decisions_append_only()
  set search_path = '';
