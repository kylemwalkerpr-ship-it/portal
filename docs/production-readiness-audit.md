# Production Readiness Audit — yousafe-portal
**Date:** 2026-06-10 · **Target:** Fiverr-grade scale across users, orders, finances

## P0 — Money correctness (fix before scaling)

### 1. Checkout is not idempotent (`app/api/checkout/order/route.ts`)
- No idempotency key. A double-click, network retry, or browser refresh on POST creates **two charges / two wallet debits / two orders**.
- **Fix:** Client generates a UUID per checkout attempt, sent as `Idempotency-Key` header. Server inserts into a new `idempotency_keys` table (unique constraint) before charging; on conflict, return the original result.

### 2. Charge → order creation is non-atomic
- Flow is `provider.charge()` → `createPaidOrder()` → `creditEarning()`. If order creation throws after a successful card charge, the customer is **charged with no order** and no automatic void/refund.
- Wallet path is the same: `debit()` succeeds, then `createPaidOrder()` can fail — money gone, no order, no compensation.
- **Fix:** (a) For wallet: move debit + order insert into a single Postgres RPC (transaction) like the existing `wallet_debit` RPC pattern. (b) For cards: on order-create failure, attempt `provider.void/refund` and log to a `payment_incidents` table for reconciliation.

### 3. `creditEarning` failures are swallowed
- Wrapped in try/catch with only `console.error` — the provider silently never gets paid. At scale this is undetectable revenue leakage.
- **Fix:** Outbox pattern — insert a `pending_earnings` row in the same transaction as the order; a cron (`app/api/cron`) drains it. Earnings can never be lost.

### 4. Webhook replay protection (`app/api/webhooks/authorizenet`)
- Status updates keyed by `authnet_transaction_id` are mostly idempotent, but there is no event-id dedupe table. A replayed `refund.created` combined with any credit logic can double-apply.
- **Fix:** `webhook_events(event_id unique)` insert-first guard.

### 5. Missing DB uniqueness on financial references
- No unique constraint found on `wallet_transactions.reference` — a retried topup with the same gateway transaction id can double-credit.
- **Fix:** Partial unique index on `(type, reference)` where reference is not null.

**Good:** wallet mutations already go through Supabase RPCs (`wallet_credit`/`wallet_debit`) — single source of truth. Build on this pattern.

## P1 — Cloudflare Worker CPU limits

### Root cause is documented in your own wrangler.toml
The Free plan's ~10 ms CPU ceiling vs the ~10 MB OpenNext bundle cold-start parse → Error 1102. **No refactor eliminates this entirely; upgrade to Workers Paid and set `[limits] cpu_ms`.** Code work below reduces frequency and cost:

1. **Shrink the worker bundle.** Large static data is bundled into every isolate: `lib/translations.ts` (1.8k lines), `lib/seoKnowledgeBase.ts` (1.5k), `lib/intake-questions.ts`, `lib/chatKnowledgeBase.ts`, `lib/categories.ts` (~6k lines combined). Move to KV/R2 JSON fetched at runtime (cached), or static JSON served from ASSETS.
2. **pdf-lib in 5 API routes** (`templates/render`, `templates/fill/.../checkout`, `templates/download`, `wallet/debit`). PDF generation is the heaviest CPU consumer per-request. Cache generated PDFs in R2 keyed by template+inputs; generate once.
3. **115 `select('*')` calls in app/api.** Over-fetching inflates JSON parse CPU and egress. Replace with explicit column lists (worst offenders first: orders, gigs, messages list endpoints).
4. **KV PAGE_CACHE is underused** — only `lib/cache.ts` touches it. Apply to hot public reads: `/api/gigs`, `/api/providers`, `/api/marketplace`, `/api/attorneys`, `/api/consultants` with short TTL (30–60 s) + tag invalidation on writes.
5. **Middleware runs on every request** including static-ish marketplace pages; keep matcher tight and avoid work on public GETs.

## P2 — Admin dashboard architecture

Current state: ~15,000 lines of untyped `.jsx` in `components/design/`, with `admin.jsx` (2,971 lines) holding ALL navigation as client state (`page`, `selectedUser`, `selectedOrder`, every modal flag). Only 4 admin sections have real routes (`tickets`, `orders`, `attorney-applications`, `consultant-applications`).

Problems at scale: no deep-linking/bookmarking for admins, one giant client bundle on first paint, state resets on refresh, modals scattered and inconsistent, no TypeScript safety on financial admin actions.

**Fix plan:**
1. Promote each admin section to a real route under `app/dashboard/admin/*` (users, orders, gigs, financials, wallets, payouts, escrow, tickets, applications, analytics, templates). URL = state.
2. Shared `AdminShell` (sidebar + header) via layout.tsx; sections lazy-load.
3. Convert `.jsx` → `.tsx` incrementally, starting with financial surfaces (wallets, payouts, escrow, financials).
4. One generic `AdminDrawer`/`AdminModal` primitive with consistent confirm/audit-log behavior; every admin mutation writes an audit event.
5. Sidebar grouped intuitively: **Overview** (dashboard, analytics) · **People** (users, applications) · **Commerce** (orders, gigs, escrow) · **Finance** (wallets, payouts, financials) · **Support** (tickets) · **Content** (templates, SEO).

## P3 — UI/UX consistency

- Mixed `.jsx`/`.tsx` and two styling sources (`globals.css`, `portal-themes.css`); consolidate into one token set (colors, spacing, radii, typography) consumed everywhere.
- Define a small primitive library (Button, Card, Drawer, Modal, Table, Badge, EmptyState) and replace ad-hoc per-page styles — that is what gives the "simple yet sophisticated" consistency.
- Oversized client components (`GigSEOAnalytics` 2.1k lines, `GigBuilderWizard` 2.1k, `UnifiedInbox` 1.8k) should split by tab/step and lazy-load — improves both perceived UX and worker/bundle weight.

## Suggested implementation order
1. P0.1–P0.2 (idempotency key + atomic wallet checkout RPC) — highest financial risk
2. P0.3–P0.5 (earnings outbox, webhook dedupe, unique constraints)
3. P1.1–P1.2 (bundle slim-down, PDF caching) + Workers Paid upgrade
4. P2 admin route split + shell
5. P1.3–P1.4 (select columns, KV caching) — mechanical, can be batched
6. P3 design tokens + primitives

Each step is independently shippable and testable.
