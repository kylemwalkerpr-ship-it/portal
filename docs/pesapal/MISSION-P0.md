# Codex Mission: Phase P0 + P0.5 (Payment schema + admin provider controls)
- **Repo:** kylemwalkerpr-ship-it/portal. The branch `feat/payments-p0-admin-controls` is cut from the commit that is live right now. The supervisor confirms live parity before the branch is cut.
- **Runner:** Codex CLI on Kyle's Mac, model **gpt-6-luna, reasoning effort max**.
- **Design skill:** Taste Skill v2, read `~/.codex/skills/design-taste-frontend/SKILL.md` before any UI work (mirror: `/workspace/taste-skill-v2/SKILL.md`).
- **Spec:** `/workspace/pesapal/ARCHITECTURE.md` §3, §3b, §3c (the source of truth; supervisor copies it to `docs/pesapal/ARCHITECTURE.md` in the branch).
- **Supervisor:** Grok Bot builds, tests, reviews, deploys and opens the PR. Codex edits files only.

## Goal
Add an admin-controlled payment-provider layer and change nothing customers see. After this phase, today's NMI, Authorize.Net and manual checkout must behave **exactly** as it does now, with the seeded settings reproducing the current setup. Pesapal is registered in settings only: disabled and owner-test-only, with **no adapter and no API calls**. The adapter comes in P1.

## Deliverables
1. **Migration (PROPOSED ONLY):** `supabase/migrations/<ts>_payment_provider_settings.sql`
   - Tables: `payment_provider_settings`, `payment_method_settings`, `payment_global_settings` (one row with `country_default_routing_enabled=false` and `fx_markup_bps=0`), `payment_settings_audit` (append-only, filled by trigger), `payment_attempts`, `payment_ledger_entries` (with charged and USD amounts), `fx_rates`.
   - RLS is enabled on all of them, with no anon or authenticated policies.
   - Seed: today's providers. Pesapal `enabled=false, test_mode_owner_only=true`. Payhip is **not** included.
   - Also include a `-- ROLLBACK` section. **Do not run it.** Kyle or Grok applies it via Supabase MCP after a backup.
2. **Registry:** `lib/payments/registry.ts`, the capability registry. nmi, authorizenet and manual mirror their current behaviour and are USD-only. pesapal covers card, mpesa and airtel, with `currencies:['USD','GBP']`. Logos go in `public/payments/*.svg`.
3. **Settings layer:**
   - `lib/payments/settings.ts`: version-keyed cache, 30-second TTL.
   - `lib/payments/availability.ts`: `getAvailableMethods`, `assertMethodAllowed`, with a $5 USD-equivalent minimum. Country is ignored while the dormant flag is off.
   - `lib/payments/fx.ts`: ECB cross-rate maths, the quote with a 30-minute lock, half-up rounding, CAD and AUD charged as USD. Pure functions only. The fetch cron comes in P3.
4. **Enforcement:** call `assertMethodAllowed` in `app/api/payments/charge`, `app/api/checkout/order`, `app/api/mobile/checkout/order`, `app/api/wallet/topup` and `app/api/templates/fill/[sessionId]/checkout`. It runs after server pricing and before any gateway call. A disabled method returns 409 `method_unavailable`. The all-disabled fallback returns the `invoice_request` path, with no charge.
5. **API:** `GET /api/payments/methods`, no-store, client-safe fields only. Extend `app/api/admin/payment-settings` with GET and PATCH.
   - PATCH requires the admin role **and** a profile id listed in the `PAYMENT_SETTINGS_OWNER_IDS` env var (Kyle only).
   - It validates against the registry, uses optimistic `version` checks, requires a `reason`, and writes the audit log.
   - It sends an alert email to `kylemwalker.pr@gmail.com` through the existing mailer. If that fails, it logs a `payment_incidents` row and doesn't block the change.
6. **Admin UI:** `app/admin/payments/providers/page.tsx` (+ components under `components/admin/payments/`), built per Taste Skill v2.
   - Provider cards with on/off, test mode and allowlist.
   - A method grid with currencies, limits and drag-to-reorder priority.
   - Default selector, health, and an audit-log viewer.
   - Warnings before the last live method is turned off.
   - An "N open payments" counter that blocks retiring a provider.

## Write scope (allowed)
`lib/payments/**` (do not change the nmi/authorizenet/manual adapters beyond imports), the 5 routes above, `app/api/payments/methods/**`, `app/api/admin/payment-settings/**`, `app/admin/payments/**`, `components/admin/payments/**`, `public/payments/**`, `supabase/migrations/<new file>`, `tests/**` / `__tests__/**`, `docs/pesapal/**`.

**Forbidden:**
- Payhip files (`app/payhip-product/**`, `app/api/admin/templates/payhip-*`, payhip workflows)
- War Room, Studio drafts #348/#354
- `wrangler.toml`, `package.json`/lockfiles, `.github/**`, `scripts/**`
- Stripe, in any form
- Webhook routes
- refund/payout/escrow routes (those are P6)

## Tests (must pass locally; CI is billing-locked)
- Unit tests:
  - registry validation
  - availability (enabled/disabled, owner-test allowlist, currency, the $5 minimum, country ignored while the flag is off)
  - the cache refreshes when `version` is bumped
  - fx (ECB cross-rate, rounding, 30-minute lock expiry, CAD/AUD charged as USD, GBP charged as GBP)
- API tests:
  - a non-admin PATCH gets 403
  - an admin who isn't on the owner list gets 403
  - unknown provider or method gets 400
  - a version conflict gets 409
  - one audit row per change
  - the alert email is attempted
  - order creation with a disabled method gets 409
  - all-disabled creates no gateway call
  - `/api/payments/methods` never contains secret-like keys (grep for `SECRET|KEY|TOKEN` values)
- Regression: the current NMI new-card, saved-card and wallet checkout paths are unchanged with the seeded settings, via snapshot or contract tests.
- Playwright: the admin page at 390, 768 and 1440 px, plus an axe accessibility check. The supervisor takes screenshots.
- `npm run build`, typecheck, lint, `node scripts/check-unverified-claims.mjs`.

## Rules / stop conditions
- **No live keys and no Pesapal or ECB network calls.** Use mocks only. Never read, print or commit `.env*` or secrets (including `CLERK_SECRET_KEY`).
- **Do not apply the migration** or connect to Supabase. No `git push`, no deploy, no PR. The supervisor does all of those.
- **Stop and report** if any of these happen:
  - a needed change falls outside the write scope
  - the live schema has to be known in order to continue (ask the supervisor for a read-only check)
  - any existing test fails before your change
  - the regression on the current checkout can't be guaranteed
  - the build or tests fail after two fix attempts
- Finish with: the branch committed locally (no push), `docs/pesapal/P0-REPORT.md` (files changed, test output, open issues), and the migration file path.

## Run addendum (supervisor, Oct 16 2026 12:3x ET)
- Worktree: `~/Documents/GitHub/portal-worktrees/payments-p0`, branch `feat/payments-p0-admin-controls` at the live commit `496d398b` (Worker version 7ad2d6fe, deploy message main=496d398b). The spec is in `docs/pesapal/ARCHITECTURE.md`.
- **Owner id (not a secret):** `PAYMENT_SETTINGS_OWNER_IDS=d90e74a5-b4cf-4f3e-81ed-9ef71e7235a7`. This is the `admin@yousafeconsultancy.com` admin profile. Kyle's gmail profile `bb085d7a-…` has role `client`, so it can't pass the admin check. Put this in `.env.example` (or `docs/pesapal/env.example`) and the tests only, not in any real env file.
- **Design skills for the admin providers page:** read `~/.codex/skills/frontend-design/SKILL.md` and `~/.codex/skills/impeccable/SKILL.md` (+ the relevant `reference/*.md`). Follow them over Taste Skill. **Do not run `scripts/impeccable` or download any impeccable engine or binary.** Use its written guidance only. Match the existing portal admin design tokens and components.
- Don't touch `~/Documents/GitHub/yousafe-consultancy` or any process or port belonging to it. Use a different dev port, 3107, if you need one.
- Don't run `npm install`/`pnpm install` with network changes to the lockfile. node_modules may be symlinked or copied by the supervisor. If dependencies are missing, stop and report.
- When done: commit locally (no push) and write `docs/pesapal/P0-REPORT.md`.
