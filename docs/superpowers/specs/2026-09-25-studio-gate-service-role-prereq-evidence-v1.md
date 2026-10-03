# Studio gate service-role prerequisite evidence v1

**Revision basis:** `main` at `a77a4626c7223a25c7f70e11a8031d85aa52d396`\
**Scope:** app credential guards, browser subscription, and regression tests only. This prerequisite includes no migration or production mutation, provider call, merge, or deployment.

## Credential boundary

`seo_gate_runs` writes and history/status reads, plus `studio_specialist_signals` list/insert/update, now use a dedicated client. It accepts only a structurally valid legacy JWT with a non-`none` algorithm and `role: service_role`, trying `SUPABASE_SERVICE_ROLE_JWT` before `SUPABASE_SERVICE_ROLE_KEY` and continuing to the latter when the preferred value is malformed or claims another role. It never falls back to anon. Missing, malformed, anon, authenticated, other-role, and unsupported new secret-key credentials are denied. The decoded role is only a local preflight claim check; it does not verify the JWT signature or establish actual authority. Runtime proof of the active Worker role remains **UNKNOWN / UNPROVEN**. The shared admin client's existing degraded-anon behavior remains available to unrelated paths.

Gate evaluation and its mandatory verdict remain in memory when persistence is unavailable (`recorded: false`). Specialist feed operations preserve their fail-open results (empty list / `{ ok: false }`). Admin route checks remain in place. The browser no longer subscribes to `seo_gate_runs`; the other six SEO Realtime tables, authenticated gate API fetch, and existing polling remain.

Supabase's current docs describe `service_role` JWT and secret API keys as server-side privileged credentials and warn that RLS bypass depends on the request not carrying a user access token. This implementation follows the repository's supabase-js-compatible legacy JWT precedence. [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [JWT claims](https://supabase.com/docs/guides/auth/jwt-fields), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Changelog scan found no relevant breaking change to this credential path; 2026 breaking changes found concerned unrelated APIs/schema exposure.

## Live applied ledger (raw rows)

Project `yousafe-saas` (`krggzrxxnqfsbbklatxl`), database `postgres`. Read 2026-09-25 11:59:57.595724+00.

```text
20260914_content_studio_evidence_contract.sql|6d9cfaf327b0f2813e97a4e3abeb0c8812140172ab5985e0b47223098b6d48d4|2026-09-16 07:53:44.755092+00|39e43edbb06ba47893235ba0a6972eb0cff59db2|adoption-baseline
20260915_content_studio_execution_lease.sql|d7c3d7bd10141bc1ada29a02d71a78afc6d3ff5952dcc3b4c4b2b8b2401793f0|2026-09-16 07:53:44.755092+00|39e43edbb06ba47893235ba0a6972eb0cff59db2|adoption-baseline
20260916122441_content_studio_provider_parity.sql|554a2a5c044d0037626738af4fe55c8e48f49659c8138a4531085f3f496fbf86|2026-09-16 13:34:33.420263+00|958de55ccba51d87221584a0caee645f25f0048f|ci-runner
20260917173300_base_table_least_privilege.sql|355eb0e63ff1cae553cac07e330bf0e8207a0ceafbfb9e362856c5c0b5f4a277|2026-09-17 18:14:03.941539+00|5429e5a124aa25df7d771fada50741a234a21d3b|ci-runner
20260920130000_seo_interlinks_verification_truth.sql|51ff7a204c9c18b3128cf4335b136c1381a1b4232aaedb3bdb639bc57fce9a01|2026-09-21 03:01:53.096291+00|ab6305a7c5c362f01b46947e53be0e462772c88e|ci-runner
```

All five current migration file hashes and each source-revision file hash match the pinned digest.

## Poststate observed

Read 2026-09-25 11:59:55.184436+00. This is database grant/policy evidence only; it does **not** establish the active Worker credential or role.

- `content_jobs`, `content_studio_evidence_items`, `content_studio_stage_events`, and `content_studio_writing_contracts`: RLS enabled; FORCE RLS disabled; anon SELECT/INSERT denied; authenticated SELECT denied; service_role SELECT allowed; policy counts in that order: `1, 0, 0, 0`.
- `seo_gate_runs` and `studio_specialist_signals`: RLS enabled; FORCE RLS disabled; anon SELECT/INSERT allowed; authenticated SELECT allowed; service_role SELECT allowed; one policy on each.
- Active Worker service-role authority: **UNKNOWN / UNPROVEN**. The Cloudflare model connector was denied and Opera was disconnected; Playwright was security-verification-only. No credential was inspected or exposed here.
- A0.2 and A0.3 remain held. P9–P13 remain open. No gate was advanced.

## Exact release order

1. Close A0.2 with protected, non-secret proof of the actual active Worker's Supabase role. Do not infer it from database grants or local configuration.
2. Close A0.3 by reconciling the applied ledger and privilege state and reviewing a separate forward-only migration for the two open tables. This change contains no migration.
3. Sol reviews this branch and owns any PR. Required repository checks must pass; merge to `main` only through that review path.
4. Deploy only from `main` through `.github/workflows/deploy.yml`.
5. If separately authorized, apply the reviewed privilege migration through the repository's official migration workflow after service-role authority is proven and guarded code is live; verify anon/authenticated denial and service-role access, then record evidence. Otherwise leave current open grants and the A0.3 hold explicit.

No production sequence is cleared now because steps 1–2 remain gated and runtime authority is unproven.

## Local verification

- `git diff --check`: passed.
- Jev broker routed Codex at confidence `0.95` and `0.94`. The initial worker could not call Jev directly; Sol did.
- After Sol linked the existing root `node_modules`, five focused Jest suites passed (`5` suites, `63/63` tests, including the fallback regression), and `npx tsc --noEmit` passed. The P11 latest-metadata fixture adds the new service-role factory mock; its focused Jest regression passed (1/1). On the combined tree, full Jest reported 519 passed suites, 2 skipped, 5,806 passed tests, 4 skipped, with no failed tests; Jest emitted an open-handle exit warning. TypeScript `tsc --noEmit` and staged and unstaged `git diff --check` passed on 2026-09-29. These local checks do not establish active Worker authority.
- The initial worker could not stage through the Git parent index in its sandbox. Sol preserved and reconciled those changes before committing after the focused/full checks and independent Luna review.
