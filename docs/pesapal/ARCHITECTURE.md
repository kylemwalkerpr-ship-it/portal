# Pesapal Integration: Architecture & Codex Mission Brief
Prepared Fri Oct 16 2026 (ET). Read-only planning; no code, DB, or deploy changes were made.
Baselines read: portal origin/main 496d398b, yousafe-consultancy c9b5b44, support-saas 45c143d, caseworks 8ae5c92.
Builder: Codex CLI on Kyle's Mac (gpt-6-luna, max effort) with Taste Skill v2 (~/.codex/skills/design-taste-frontend/). Supervisor reviews every PR.
Hard rules: never Stripe; NMI + Authorize.Net stay; no payment secrets in client code or logs; never print CLERK_SECRET_KEY; no War Room / Studio drafts #348/#354; squash-merge only; DB writes only via Supabase MCP after a backup; deploy via wrangler from Kyle's Mac with live-parity check (GH Actions billing-locked).
**Testing decision (Kyle, Oct 16): NO sandbox. Live-only testing behind an owner-only flag with $5 real payments, reconciled and then refunded, before customers see it.**

## 1. Inventory: order and payment touchpoints

### portal (market.yousafeconsultancy.com): the only place money is actually taken
Provider abstraction (the integration seam):
- `lib/payments/types.ts`: `PaymentProvider` interface; `PaymentMode` already includes `'hosted-redirect'` (unused so far). Methods: getClientConfig, charge, refund, vault*, supportsVault.
- `lib/payments/index.ts`: registry `{nmi, authorizenet, manual}`, default `PAYMENT_PROVIDER` env (default `nmi`); `getPaymentProvider(gatewayId)` routes by the gateway pinned on the order or card.
- `lib/payments/providers/{nmi,authorizenet,manual}.ts`, `lib/payments/clientTokenization.ts`, `components/payments/CardFields.tsx` (Collect.js / Accept.js).
Charge entry points:
- `app/api/payments/charge/route.ts`: catalogue items (template packs + services). Prices are resolved on the server, uses an idempotency key (`lib/idempotency.ts`), and records attribution.
- `app/api/checkout/order/route.ts` + `lib/checkoutOrders.ts`: gigs/offers/attorney_offers/consultant_offers. Takes wallet, saved_card, or new_card; non-gig sources are wallet-only. Includes platform-fee and net-payout math.
- `app/api/mobile/checkout/order/route.ts` + `lib/mobileCheckout.ts`: mobile app checkout.
- `app/api/wallet/topup/route.ts`, `app/api/wallet/payment-methods/*`, `app/api/mobile/wallet/payment-methods`: wallet top-up and vault.
- `app/api/templates/fill/[sessionId]/checkout/route.ts`: template-fill checkout.
- `components/messaging/OfferPaymentModal.tsx`: pay-an-offer modal in chat.
- UI: `app/marketplace/cart/page.tsx`, `components/cart/CartProvider.tsx`, `CartIcon.tsx`, `app/marketplace/order/success/page.tsx`, `components/orders/MarketplaceOrderExperience.tsx`, `components/design/landing/PaymentMethods.tsx`, `app/payhip-product/[slug]/page.tsx` (Payhip product pages).
- Config: `app/api/payments/config/route.ts` (public config only).
Webhooks: `app/api/webhooks/authorizenet/route.ts` (HMAC-SHA512, dedupes into `webhook_events`). NMI has no webhook route, so its results are synchronous.
Refund, payout, and escrow routes (server-only/admin; must stay locked):
- `app/api/admin/refund`, `admin/ledger/refund`, `admin/payouts/{refunds,release,connect,providers,run-weekly-batch}`, `admin/escrow/[id]/{refund,release,dispute,freeze,milestones,scope-changes}`, `admin/escrow/run-auto-releases`, `admin/wallet/topup-refund`, `admin/wallet/credit/[profileId]`, `admin/payment-incidents`, `admin/payment-settings`, `cron/weekly-payouts` (+ `.github/workflows/weekly-payouts.yml`).
- Orders: `app/api/orders/[id]/{cancel,status,escrow}`, `lib/orderCancellation.ts`, `lib/wallet.ts` (credit/debit).
Tables (from `supabase/*.sql`): `orders` (has `gateway`, currency, escrow columns), `template_orders` (conditional, has `gateway`), `student_payment_methods` (has `gateway`), wallets + wallet ledger (`wallet_nmi.sql`), `canonical_ledger.sql` (+ `lib/backfill-canonicalledger.ts`), escrow (`escrow_system_v2.sql`), `payment_acknowledgments`, `webhook_events` (default source 'authorizenet'), idempotency keys, `payment_incidents`, `offers`/`attorney_offers`/`consultant_offers`, `gigs`/`gig_tiers`, `services`.
*Supervisor TODO before Phase 1: confirm live column lists with a read-only Supabase MCP `list_tables` (the repo SQL may lag live).*

### support-saas
- `app/api/support/orders/[id]/refund/route.ts`, `lib/actions/support-{orders,escrow,wallet,disputes}.ts`, `components/support/RefundDialog.tsx`, Playwright refund specs. Support refunds must route by `orders.gateway`, which will include `pesapal`.
- `scripts/checkout-retirement-guard.mjs`: `checkout.yousafeconsultancy.com` is retired. Don't revive it.

### yousafe-consultancy (main, au, ca, uk, usa, landing-page)
- No payment code found. Money is collected through `/book/` routes (au/ca/uk/usa `app/book/page.tsx`), `shop-*` blog CTAs that link to Payhip/market, and the refund-policy/terms pages.
- Change here: CTAs go to the portal checkout, plus copy updates to the refund policy, terms, and payment-methods pages (M-Pesa, cards via Pesapal). There's no on-site checkout.

### caseworks
- `app/pricing/page.tsx`, `app/services/*`: pricing pages and CTAs only. Same approach: link to the portal checkout.

## 2. Pesapal API 3.0 (verified at developer.pesapal.com, Oct 16 2026)
Base: Live `https://pay.pesapal.com/v3`; sandbox `https://cybqa.pesapal.com/pesapalv3` (**not used, per Kyle**).
- **Auth**: `POST /api/Auth/RequestToken` with `{consumer_key, consumer_secret}` returns `{token, expiryDate}`. The token lasts about 5 minutes. Cache it in memory and refresh it about 30s before expiry. Send it as a Bearer token with `Accept`/`Content-Type: application/json`.
- **IPN registration**: `POST /api/URLSetup/RegisterIPN` with `{url, ipn_notification_type: "GET"|"POST"}` returns `ipn_id` (GUID). Register once (a script run by Kyle or an admin), then store the result as `PESAPAL_IPN_ID`. Listing: `GET /api/URLSetup/GetIpnList`. *I couldn't render this doc page, so the endpoint name is unverified.* The URL must be public. Pesapal's IPs change, so don't use an IP allowlist.
- **SubmitOrderRequest**: `POST /api/Transactions/SubmitOrderRequest`.
  - Required fields: `id` (merchant ref, unique, ≤50 chars, `[A-Za-z0-9-_.:]`), `currency`, `amount` (float), `description` (≤100 chars), `callback_url`, `notification_id`, `billing_address` (email or phone; optional `country_code`, names).
  - Optional fields: `cancellation_url`, `redirect_mode` (TOP_WINDOW|PARENT_WINDOW), `branch`.
  - Response: `{order_tracking_id, merchant_reference, redirect_url}`.
- **Redirect vs iframe**: `redirect_url` can be a full-page redirect or an iframe. Recommendation: use an iframe inside our checkout sheet on desktop, with `redirect_mode=PARENT_WINDOW`, and a full redirect on mobile or when the iframe is blocked (CSP `frame-src https://pay.pesapal.com`).
- **Callback**: the browser returns to `callback_url?OrderTrackingId&OrderMerchantReference&OrderNotificationType=CALLBACKURL`.
- **IPN**: GET or POST with `{OrderNotificationType: "IPNCHANGE", OrderTrackingId, OrderMerchantReference}`. **Neither carries a status.** We always call GetTransactionStatus. Reply with JSON `{orderNotificationType, orderTrackingId, orderMerchantReference, status: 200|500}`.
- **GetTransactionStatus**: `GET /api/Transactions/GetTransactionStatus?orderTrackingId=…`
  - Returns `status_code` (0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED), `amount`, `currency`, `payment_method`, `confirmation_code`, `payment_account` (masked), `merchant_reference`, `created_date`.
- **Refund**: `POST /api/Transactions/RefundRequest` with `{confirmation_code, amount, username, remarks}`.
  - Cards can be refunded fully or partially. Mobile money can only be refunded in full.
  - **Only one refund is allowed per payment.** Refunds are in the original currency.
  - A 200 means "received". The refund is then **manually approved by Pesapal/merchant**, so it's async and can't be confirmed instantly. Store `confirmation_code`.
- **Cancel**: `POST /api/Transactions/CancelOrder` with `{order_tracking_id}`. Used for unpaid orders. *Unverified (page did not render); confirm before use.*
- **Currencies/countries**: set by the merchant account (commonly KES, UGX, TZS, RWF, MWK, ZMW, USD, plus cards/M-Pesa/Airtel/MTN). **Kyle must confirm the currencies enabled on the account.** No card vaulting in this flow, so `supportsVault=false`.
- **Secrets** (server-only, never `NEXT_PUBLIC_`): `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_IPN_ID`, `PESAPAL_ENV=live`, `PESAPAL_IPN_TOKEN` (random path token for the IPN URL). Enable/disable and the owner allowlist now live in the admin settings tables (§3b), not env. Set them with `wrangler secret put` on the portal Worker (and as Supabase function secrets only if an edge function is used). Kyle types them in himself, and no agent echoes them.

## 3. Reconciliation design
**Adapter**: `lib/payments/providers/pesapal.ts`, `mode: 'hosted-redirect'`.
- Add `initiate(req) → {redirectUrl, trackingId}` to the interface as an optional `createHostedSession`. Keep `charge()` throwing for this provider.
- `refund(confirmationCode, amount)` maps to RefundRequest and returns `pending`.
- Register it in `index.ts`. **Do not change the default `PAYMENT_PROVIDER`.**

**Processor selection: admin-controlled (Kyle decision, Oct 16).** Fixed routing rules are removed. Which providers and methods are offered is decided entirely by the admin settings in §3b, and the server resolves it. `orders.gateway` is always recorded, and refunds, support and payouts route by it. Saved cards still go to the processor that stored them, if that processor is still active (§3b).

**Order/payment state machine** (`payment_attempts.status`):
`created → submitted (tracking id saved) → pending (buyer on Pesapal) → completed | failed | invalid | cancelled | expired`; `completed → refund_requested → refunded | refund_rejected`; `completed → reversed`.
- Business side effects happen **once**, on the transition into `completed`, inside a DB function with row lock + `where status <> 'completed'`. These are: mark the order paid, fund escrow, credit the wallet for top-ups, bind attribution, and send the receipt.
- Amount and currency in the status response must equal the attempt's server-resolved amount and currency. On a mismatch, raise `payment_incidents` and don't fulfil.

**IPN handler**: `app/api/webhooks/pesapal/[token]/route.ts` (GET+POST).
1. Constant-time check of the path token against `PESAPAL_IPN_TOKEN`.
2. Dedupe on `webhook_events(event_id = 'pesapal:'+trackingId+':'+status_code, source='pesapal')`.
3. Fetch GetTransactionStatus. Never trust the IPN body.
4. Apply the transition idempotently.
5. Reply with the required JSON, 200 on success. Reply 500 only on a transient failure so Pesapal retries.

**Callback page**: `app/checkout/pesapal/return/page.tsx` shows a "Confirming payment…" state. It calls a server route that runs the same status fetch and transition code, then shows success, failure, or still-pending.

**Polling fallback**: a cron route `app/api/cron/pesapal-reconcile` run by Cloudflare Cron Trigger (GH Actions is locked).
- Every 5 minutes, re-check attempts that have been `submitted/pending` for more than 2 minutes, with backoff up to 24h. After that, mark them `expired` (and CancelOrder, once it's verified).
- Also polls `refund_requested` attempts until they reach a final state.

**Nightly reconciliation** (03:00 ET):
- For every Pesapal attempt in the last 7 days, compare our state with GetTransactionStatus. Also check `orders` ↔ `payment_attempts` ↔ ledger sums.
- Write results to `payment_reconciliation_runs` / `_items`. Any mismatch is filed in `payment_incidents` and shown on the admin dashboard.
- Pesapal's settlement/statement export (CSV from the merchant dashboard) can be uploaded on the admin page for a fee and settlement match. Open question: is there an API for this?

**Proposed migration (NOT applied; supervisor applies via Supabase MCP after backup)**: `supabase/migrations/2026XXXX_pesapal_payments.sql`
```sql
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  merchant_reference text not null unique,            -- 'ys:'||short order id||':'||attempt n (<=50 chars)
  gateway text not null check (gateway in ('pesapal','nmi','authorizenet','manual')),
  order_id uuid references public.orders(id),
  template_order_id uuid,
  wallet_topup_id uuid,
  profile_id uuid not null,
  purpose text not null check (purpose in ('order','template','wallet_topup','offer','template_fill')),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  status text not null default 'created',
  provider_tracking_id text unique,                   -- Pesapal OrderTrackingId
  confirmation_code text,                             -- needed for RefundRequest
  payment_method text, payment_account_masked text,
  provider_status_code int, last_status_raw jsonb,
  refund_amount_minor bigint, refund_status text,
  is_test boolean not null default false,             -- owner live tests
  created_at timestamptz default now(), updated_at timestamptz default now(),
  completed_at timestamptz, next_poll_at timestamptz, poll_count int default 0
);
create index on public.payment_attempts (status, next_poll_at);
create table public.payment_ledger_entries (          -- append-only, double-entry
  id bigserial primary key,
  attempt_id uuid not null references public.payment_attempts(id),
  entry_type text not null check (entry_type in ('capture','refund','reversal','fee','adjustment')),
  amount_minor bigint not null, currency char(3) not null,
  provider_ref text, occurred_at timestamptz not null,
  created_at timestamptz default now(),
  unique (attempt_id, entry_type, provider_ref)       -- idempotency
);
create table public.payment_reconciliation_runs (id bigserial primary key, started_at timestamptz, finished_at timestamptz, checked int, mismatches int, summary jsonb);
alter table public.payment_attempts enable row level security;   -- no client policies: service-role only
alter table public.payment_ledger_entries enable row level security;
-- revoke all on both from anon, authenticated; ledger: no update/delete trigger.
```
- Also mirror completed captures into the existing canonical ledger with `source='pesapal'`, keeping one source of truth for analytics.
- `payment_attempts` is added for NMI/Authorize.Net later, optionally. For now it's Pesapal only.

## 3b. Admin-controlled payment providers (Kyle decision)
**Goal:** the admin turns providers and payment methods on and off in the portal dashboard, and the change takes effect without a redeploy. Checkout shows only what's live.

**Capability registry (code, server-side, `lib/payments/registry.ts`).** This is the source of truth for what each adapter *can* do. Admins cannot add capabilities through the UI.
- `{ provider: 'pesapal'|'nmi'|'authorizenet'|'manual'|'payhip'|<future>, mode, methods: [{ id:'card'|'mpesa'|'airtel'|'mtn'|'bank'|'wallet'|'invoice'|'payhip_link', label, logoAsset (local /public/payments/*.svg), currencies[], countries[], supportsRefund, supportsPartialRefund, supportsVault }] }`
- Adding a future provider means writing its adapter and registry entry. It then shows up in the admin panel automatically, disabled by default.
- **Payhip stays exactly as it is.** It is not in the registry, not in the shared checkout, not in the admin panel, and its pages, routes and workflows aren't modified. `app/payhip-product/[slug]` is out of scope.

**Settings tables (proposed migration, NOT applied):**
```sql
create table public.payment_provider_settings (
  provider text primary key,                 -- must exist in code registry (validated server-side)
  enabled boolean not null default false,
  test_mode_owner_only boolean not null default true,  -- live creds, visible only to allowlisted owners
  test_allowlist uuid[] not null default '{}',         -- profile ids
  priority int not null default 100,         -- lower = shown first / default
  is_default boolean not null default false, -- partial unique index: at most one true
  updated_by uuid, updated_at timestamptz default now(), version bigint not null default 1
);
create table public.payment_method_settings (
  provider text references public.payment_provider_settings(provider),
  method text not null,                      -- must exist in registry for that provider
  enabled boolean not null default false,
  currencies char(3)[],                      -- null = all registry-supported
  countries char(2)[],                       -- null = all
  priority int not null default 100,
  min_amount_minor bigint, max_amount_minor bigint,
  primary key (provider, method)
);
create table public.payment_settings_audit (   -- append-only
  id bigserial primary key, actor_profile_id uuid not null, actor_role text not null,
  action text not null, target text not null, before jsonb, after jsonb,
  reason text, ip inet, user_agent text, created_at timestamptz default now()
);
-- RLS on all three; NO anon/authenticated policies. Writes only via service-role in admin API.
-- Audit: trigger on both settings tables inserts before/after; block update/delete on audit table.
```
- **Change alerts:** every settings change (and every rejected attempt) sends an email to **kylemwalker.pr@gmail.com** through the portal's existing transactional mailer. It includes the before/after diff, actor, time (ET) and reason. If the email fails, a `payment_incidents` row is logged; a failed email does not block the change.
- **Country routing (dormant):** `payment_method_settings.countries` and a `country_default_routing_enabled boolean default false` flag (in a one-row `payment_global_settings` table) exist but are **off**. Provider choice and order are set by Kyle only. While the flag is off, the resolver ignores country entirely. A test confirms that. Turning it on later is an owner-only, audited change.
- Seed (part of the migration): the current state, which is NMI enabled and default, Authorize.Net as it is today, manual as it is today (Payhip not seeded; untouched), and Pesapal `enabled=false, test_mode_owner_only=true`.

**Admin API & UI.**
- Extend the existing `app/api/admin/payment-settings/route.ts` (GET/PATCH). **Only Kyle (owner admin) may change payment settings. No other role, including other admins, support or staff.** The server checks `requirePortalUser()`, `role==='admin'` AND `profile_id ∈ PAYMENT_SETTINGS_OWNER_IDS` (server secret, Kyle only). Anyone else gets a 403, and the attempt is audited. There's no co-sign flow.
- The server checks every change against the registry: unknown providers or methods, or currencies an adapter can't do, are rejected. It uses optimistic concurrency on `version` and requires a reason, which goes in the audit log.
- Checks before go-live: credentials present (a boolean check on the server; values are never returned), notification URL registered, and at least one completed owner test payment before `test_mode_owner_only` can be turned off. The UI warns about this.
- Dashboard page `app/admin/payments/providers`:
  - provider cards with on/off, test mode and allowlist
  - a per-method grid with currencies, countries, limits and priority, set by drag-to-reorder
  - default selector, health (last success, open incidents), and an audit-log viewer
  - Built per Taste Skill, admin-styled.

**Resolution (server, `lib/payments/availability.ts`).** `getAvailableMethods({profile, currency, country, amount, purpose})` returns methods joined from the registry and settings.
- A provider counts only if it's enabled, and for a test-mode provider, only if the profile is on its allowlist.
- A method counts only if it's enabled and the currency and amount fit (country only when the dormant country flag is on). Amount must be ≥ $5 USD equivalent.
- Results are sorted by priority. The response contains labels, logo paths and opaque `methodKey`s only, never secrets.
- Exposed via `GET /api/payments/methods`, which replaces the per-provider `/api/payments/config` for the UI. Public keys such as NMI's tokenization key are added only for methods that are returned.

**Server-side enforcement at order creation.** Every charge or initiate route calls `assertMethodAllowed(methodKey, ctx)` *after* computing the price on the server and *before* any call to a processor. That covers `/api/payments/charge`, `/api/checkout/order`, mobile checkout, wallet top-up, template-fill, offer pay and Pesapal initiate.
- It re-runs the availability check from fresh settings. Anything disabled, not allowlisted or out of range is rejected with a 409 `method_unavailable` and the client refetches the methods.
- The settings `version` used is stored on the payment attempt for the audit trail.
- Saved cards: allowed only if their gateway's card method is still enabled. Otherwise they're shown greyed out with "Not currently available".

**Cache / instant effect.**
- Settings are read through a 30-second in-isolate cache keyed by `version`, which is a single cheap `select max(version)` per request.
- Admin PATCH bumps `version`, so all Worker isolates pick up the change on their next request. Changes take effect within seconds, with no redeploy.
- The client methods list uses `Cache-Control: no-store`.
- Enforcement at order creation always reads uncached (or checks the version), so disabling a provider cannot be raced.

**Safe fallback when everything is disabled.** Checkout shows a branded "Online payment is temporarily unavailable" state, offering a wallet balance if one is enabled, or "Request an invoice", which creates a `manual` order in `pending_invoice`. No charge is attempted. An incident is logged and the admin is alerted. The admin UI warns before the last live method is turned off.

**Disabled ≠ removed.**
- Disabling a provider only stops *new* payment attempts. Its adapter, credentials, notification route, polling job, nightly reconciliation and refund paths keep running for existing attempts and orders. They route by `orders.gateway` / `payment_attempts.gateway`, not by the settings.
- Refunds stay allowed on a disabled provider, through admin and support, with the audit logged.
- Credentials must not be removed while that provider has payments that aren't final or are still within the refund window. The admin UI shows a "N open payments" counter and blocks a hard "retire" until it reaches 0.

## 3c. Currencies & FX (Kyle decision: USD base, Fiverr-style)
**Enabled currencies:** USD (base/default), GBP (UK), CAD (Canada), AUD (Australia). **Minimum payment: $5 USD equivalent**, checked on the server against the locked USD amount.

**How Fiverr does it** (Fiverr Help Center, checked Oct 16 2026):
- All prices are based on the original USD price. Non-USD prices change daily with exchange rates.
- The display currency defaults to the buyer's location (GBP for the UK, CAD for Canada, AUD for Australia) and the buyer can change it.
- **The buyer is charged in the chosen display currency.** If the payment processor doesn't support it, the charge is made in USD.
- Local-currency prices "may also include conversion fees". Buyers can always pay in USD instead.
- Refunds are made in the same currency and amount as the original payment. The card issuer may add its own FX fees.
- Sources: https://help.fiverr.com/hc/en-us/articles/37554147037585-Using-your-local-currency-for-purchases, https://help.fiverr.com/hc/en-us/articles/37332701180945-Adding-and-managing-your-Fiverr-payment-methods, https://help-pro.fiverr.com/hc/en-us/articles/17029731506193-Using-your-local-currency-on-Fiverr
- Fiverr doesn't publish its markup percentage or an exact rate-lock window. The quote shown at checkout is what's charged.

**YouSafe design:**
- **Prices are stored in USD only** (`services.usd_price`, template packs, gig tiers). Other currencies are derived values and are never stored as catalogue prices.
- **Rate source (decided):** the free **ECB euro reference rates**, fetched from the ECB daily XML (https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml), with frankfurter.app as a mirror. USD→GBP/CAD/AUD are derived by cross-rate through EUR. No API key is needed. ECB publishes once per working day at about 16:00 CET.
- **Refresh:** check hourly via Cloudflare Cron (it picks up the new daily ECB publication; weekends and holidays reuse the last rate), written to a new `fx_rates(base, quote, rate, source, fetched_at)` table, append-only.
  - Stale guard: if the newest ECB rate is more than 4 days old (this allows for weekends and holidays), non-USD display falls back to USD, and an incident is logged and emailed to Kyle.
- **Markup (decided):** `fx_markup_bps` = **0** by default. It's an owner-only admin setting that can be changed later, and changes are audited. The amount is shown to the buyer as part of the quoted total, never as a hidden fee.
- **Display:** the currency selector in the header and checkout defaults from locale or country (display only; it never affects provider routing). Shows "≈ £X (US$Y)" on cards. The checkout total is shown in the charge currency, with the USD amount underneath.
- **Rate lock per attempt:** when a checkout quote is created, a `quote` is stored on `payment_attempts`:
  - `base_amount_usd_minor`, `charge_currency`, `charge_amount_minor`
  - `fx_rate`, `fx_rate_source`, `fx_rate_fetched_at`, `fx_markup_bps`
  - `quote_expires_at`, set to now + 30 minutes.
  - Expired quotes are re-quoted with a visible "Price updated" notice.
  - Rounding: half-up to minor units, which are 2 decimal places for all four currencies.
- **Charge currency per provider:** the capability registry lists the currencies each method can actually charge. If a method can't charge the display currency, **the charge is made in USD and a local estimate is shown** ("Charged as US$Y ≈ £X; your bank may apply its own rate"), as Fiverr does.
- **Reconciliation in both currencies:**
  - Ledger entries store `amount_minor` + `currency` (as charged) **and** `amount_usd_minor` (at the locked rate).
  - The nightly job matches the provider's charged amount and currency exactly against `charge_amount_minor/charge_currency`, and reports USD totals for revenue.
  - If the provider settles in a different currency, the settlement FX difference is booked as an `adjustment` entry.
  - Provider payouts, escrow and platform fees are always calculated in USD from `base_amount_usd_minor`, so FX movement never changes a provider's earnings.
- **Refunds:** always in the **original charge currency** and amount (Pesapal requires this). The USD equivalent is recorded at the original locked rate, and any FX loss is booked as an adjustment.
- Wallet balances stay in USD. A top-up paid in GBP credits the locked USD amount.

**Pesapal currency support (researched):**
- The official API 3.0 accepts any ISO currency code in `currency`.
- The official API 2.0 docs say the account's local currency is the default. A different currency (for example USD) can be specified, and *"if the payment option the customer selects does not support that currency, PesaPal will convert the amount using the day's exchange rate and present the amount in the local currency"* (https://developer.pesapal.com/how-to-integrate/e-commerce/api-20-xml/api-reference).
- Third-party integrator docs list KES, USD, EUR, GBP, UGX, TZS, ZMW and RWF (https://www.tourtask.com/documentation/payment-methods/pesapal/, https://practito.com/docs/PESAPAL_QUICKSTART.html).
- **Not documented anywhere: CAD and AUD.**
- **Decision (Kyle):**
  - Pesapal charges in **USD and GBP only**, as advertised.
  - **CAD and AUD buyers see a local estimate and are charged USD** ("Charged as US$Y ≈ C$X / A$X").
  - Pesapal's registry `currencies: ['USD','GBP']`.
  - Mobile-money methods may be converted by Pesapal, so reconciliation always uses the `amount`/`currency` that GetTransactionStatus returns.
- NMI and Authorize.Net multi-currency support depends on the merchant account. Until confirmed, their registry entries are USD-only, and the same fallback applies.

## 4. Checkout UX spec (Taste Skill v2)
- **One shared component** `components/checkout/Checkout.tsx` (+ `useCheckout`), used by:
  - the cart, gig/offer checkout, OfferPaymentModal, wallet top-up and template-fill (not Payhip, which stays as is).
  - mobile web, via the same component in a bottom sheet.
- **Steps**: (1) Review: line items, fees, and a server-computed total. (2) Payment method: **built dynamically from `GET /api/payments/methods`** (only active, admin-approved methods, in admin priority order, with the default preselected). Logos and labels come from the server registry, the browser holds no list of providers, and the method set can change between steps. If a method was disabled mid-checkout, the 409 response prompts a friendly re-pick. (3) Pay: Pesapal opens in an embedded iframe sheet, or a redirect on mobile. (4) Confirming. (5) Receipt.
- **Visual**: follows Taste Skill rules.
  - Restrained palette using existing brand tokens, a single accent, generous spacing, and tabular numerals for money.
  - The sticky order summary sits on the right on desktop and collapses to a top summary on mobile.
  - Motion stays subtle at 150–250ms and respects `prefers-reduced-motion`. No layout shift when the iframe loads (skeleton held at fixed height).
- **Mobile**: 44px touch targets and a sticky pay button in the safe area. Phone input defaults to the country's prefix (E.164), which matters for M-Pesa.
- **States**:
  - idle, validating, submitting (button locked; idempotency key per attempt)
  - redirecting
  - pending: "Approve the prompt on your phone". It polls every 3s for up to about 2 minutes, then says "We'll email you when it confirms" with a safe-to-close message.
  - failed: a plain-language reason and a retry with the same cart (new attempt, new merchant_reference)
  - cancelled
  - amount mismatch / incident: a support link
- **Copy & accessibility**: never says "paid" until the server confirms. Errors use aria-live. Focus is trapped in the sheet. WCAG AA contrast.
- **Receipt**: on-page plus email. Shows the order id, merchant reference, Pesapal confirmation code, method plus masked account, amount and currency, date in the buyer's local time, and a refund-policy link. The order page in the dashboard shows the same.
- No processor branding clutter: Pesapal/M-Pesa logos appear only on the method tile.

## 5. Phased Codex missions (small PRs; supervisor builds, tests, deploys)
**Status: FINAL, ready to hand off (Oct 16 2026).** Order: P0 → P0.5 → P1 → P2 → P3 → P4 → P5 → P6 → P7. Pesapal is not customer-facing before P0.5 is live and the live owner tests pass. P0's migration is proposed by Codex and applied only by Kyle or Grok via Supabase MCP after a backup. P3 needs Kyle's approval for the `wrangler.toml` cron change. P7's copy needs Kyle's approval. The §3c FX work (`fx_rates`, ECB cron, quote lock) belongs to P0.5 (schema + resolver) and P3 (cron).
Each PR: squash merge, no secrets, `check-unverified-claims.mjs` passes, and unit tests run locally on Kyle's Mac (CI is locked). Deploy via wrangler, then live-parity check (hash/bytes of the deployed bundle = built commit), with the rollback version id recorded in `docs/pesapal/DEPLOY.md`.
- **P0, Schema (supervisor, not Codex)**: back up the tables, apply the migration above via Supabase MCP, and confirm RLS.
- **P0.5, Admin provider controls (before anything customer-facing)**:
  - registry, settings and audit tables (Payhip excluded), `availability.ts`, `assertMethodAllowed` wired into **all existing** charge routes (NMI/Authorize.Net/manual first, so today's behaviour is matched exactly by the seeded settings)
  - admin API and dashboard page, and the all-disabled fallback.
  - Tests: non-admin PATCH gets 403; unknown provider or method rejected; audit row written per change; disabling a method gets 409 at order creation within 30s with no redeploy; the test allowlist is respected; the all-disabled path creates no charges; a refund still works on a disabled provider.
  - A regression check that the current NMI checkout is unchanged.
- **P1, Adapter (no UI, flag off)**: `providers/pesapal.ts`, token cache, typed client, `select.ts`, registry.
  - Unit tests with mocked fetch: token refresh; SubmitOrderRequest payload (reference charset/length, description ≤100, amount from server); each status_code mapping; error object; refund request.
  - Test that no `PESAPAL_*` value is reachable from client bundles (grep the built `.next`/worker output).
- **P2, IPN + callback + state machine**: webhook route, return page/route, the transition DB function, ledger writes, `webhook_events` dedupe.
  - Tests: duplicate IPN, IPN-before-callback, callback-before-IPN, an IPN for an unknown tracking id, amount/currency mismatch leading to an incident, REVERSED after COMPLETED, and a bad path token leading to 401.
- **P3, Reconcile crons**: poller + nightly job via Cloudflare Cron Triggers.
  - This needs a `wrangler.toml` change, which requires an explicit wider grant.
  - Admin "Reconciliation" panel, read-only. Tests use fixture status responses.
- **P4, Shared Checkout component (Taste Skill)**: build it behind the flag and wire it into the cart and gig/offer checkout first.
  - Playwright visual tests at 390/768/1440px for every state using mocked routes, plus axe checks. Supervisor takes screenshots.
- **P5, Remaining entry points**: wallet top-up, OfferPaymentModal, template-fill, mobile API (Payhip product pages excluded and untouched) (`/api/mobile/checkout/order`, returns redirectUrl).
- **P6, Refunds everywhere**: admin refund/escrow refund/support-saas RefundDialog route by `gateway`.
  - Pesapal path: one refund per payment, enforced. Partial refunds for cards only. The status shows "Refund requested, awaiting Pesapal approval".
  - Escrow release/payout must not pay providers for an attempt that isn't `completed`.
- **P7, Marketing sites**: yousafe-consultancy / caseworks CTA links to the portal checkout. Refund policy, terms, and payment-methods copy is drafted for Kyle's approval, with no SEO metadata changes.

### Live-only test plan (no sandbox, per Kyle)
1. Kyle enters live keys with `wrangler secret put` himself and runs the one-time IPN registration script, which prints only the ipn_id. Set `PESAPAL_ENV=live`. In the admin panel: Pesapal `enabled=true`, `test_mode_owner_only=true`, allowlist = Kyle only, and only the methods he wants to test turned on.
2. Deploy P1–P4 with the flag on for the owner only. Verify a non-owner account sees no Pesapal tile (screenshots) and that the API rejects `gateway=pesapal` from non-owners with a 403.
3. Kyle makes 4 real **$5 USD-equivalent** payments (~$20 total), each with `is_test=true`, on an owner-only $5 test SKU (the minimum payment). Cover currencies as well as paths:
   a. card, USD, iframe path on desktop;
   a2. (in place of or in addition to (c), if Kyle wants coverage) card in GBP display. Verify the locked rate, timestamp, charged currency and USD amount;
   b. M-Pesa on mobile via redirect, with USD submitted. Record the currency/amount Pesapal actually returns (it may convert);
   c. a cancelled payment (press cancel on Pesapal), which should end as `cancelled`/`expired`;
   d. close the tab mid-payment, so only the IPN or poller can complete it.
4. For each: the supervisor confirms via read-only SQL that it reached `completed` once, has exactly one capture ledger entry, `amount`/`currency`/`confirmation_code` match the Pesapal dashboard, the receipt email went out, and the order and wallet side effects happened once. Replay the IPN URL manually and expect no double effect.
5. Refund each completed test: the card payment partially then... no, **one refund only**, so refund the card payment in full (or test partial refunds on one and full on another). The M-Pesa payment can only be refunded in full. Track `refund_requested` until it reaches `refunded`. This depends on Pesapal's manual approval, so allow days and ask Kyle to approve in the merchant portal. Confirm the refund ledger entries and that net equals any intentionally unrefunded remainder from the partial test.
6. The nightly reconcile run must report 0 mismatches over the test set.
7. Go/no-go with Kyle. In the admin panel, turn off owner-only test mode for the chosen methods (the go-live checks must pass). Keep NMI as the default card processor. Watch `payment_incidents` daily for the first week.
8. Rollback: disable Pesapal (or a single method) in the admin panel (instant, audited, no deploy). Existing payments keep reconciling. Or roll back to the recorded wrangler version.
- Exclude test payments (`is_test`) from revenue analytics, payouts, and attribution.

### What Kyle must supply
- Live consumer key and secret, entered by Kyle via wrangler or a secure form. Never pasted in chat.
- Approval of the IPN URL (`https://market.yousafeconsultancy.com/api/webhooks/pesapal/<token>`) and the callback/cancel URLs. Also confirm whether Pesapal requires domain whitelisting for the iframe.
- The settlement currency, and the methods to enable at launch (in the admin panel).
- Whether Pesapal should handle all card payments or only mobile money (the default plan: Pesapal for mobile money and non-USD; NMI remains the card default).
- About $20 for real test payments (4 × $5), and his willingness to approve refunds in the Pesapal portal.
- Approval for a `wrangler.toml` cron change, the Supabase migration (after backup), and refund-policy copy.

## 6. Risks & open questions
- **No sandbox**: every test moves real money (about $20 plus fees, some of which may not come back on refund). Pesapal may flag repeated small payments as fraud. Mitigations: owner-only flag, test SKU, `is_test`, and a small number of runs.
- Refunds are async, manual, and limited to one per payment, so automated refunds (e.g. escrow disputes) become "requested" until Pesapal approves them. Support and admin UX must show that, and payouts must account for it.
- No card vault means Pesapal can't do wallet saved cards or the card-on-file flows (`supportsVault=false`).
- IPN carries no signature, which is why we rely on the secret path token plus a mandatory status fetch.
- CSP/X-Frame and Taste-Skill iframe sizing. Some mobile wallets break inside iframes, so use a redirect on mobile.
- Unverified endpoints: CancelOrder, GetIpnList, and the recurring-payment and settlement APIs. Confirm them in the Postman collection (https://documenter.getpostman.com/view/6715320/UyxepTv1) before P3.
- Cloudflare Cron needs `wrangler.toml` edits; GH Actions remains locked. Live-parity checks are still required for each deploy.
- Repo SQL may not match the live schema, so a read-only check is needed before P0. `webhook_events.source` defaults to 'authorizenet', so always set it explicitly.
- Tax, invoicing, and KYC (Kenya-registered merchant?) may limit which currencies and customers can be served.
- FX: ECB rates are daily reference rates, not live market rates, so the estimate can drift intraday. That's acceptable at 0 markup. It's disclosed as "≈", and the 30-minute lock applies. If the ECB feed goes down, display is USD-only (guarded). Refund FX losses are booked as adjustments.
- Open questions (remaining):
  - Settlement currency on the Pesapal account, and which methods to enable at launch.
  - Refund window length that blocks provider retirement.
  - Should NMI and Authorize.Net also move onto `payment_attempts` for uniform reconciliation? (Default in the phases: Pesapal only; revisit after P6.)
