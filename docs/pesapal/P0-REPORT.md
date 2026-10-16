# Pesapal P0 / P0.5 implementation report

## Files changed

- `app/admin/payments/providers/page.tsx`
- `app/api/admin/payment-settings/route.ts`
- `app/api/checkout/order/route.ts`
- `app/api/mobile/checkout/order/route.ts`
- `app/api/payments/charge/route.ts`
- `app/api/payments/methods/route.ts`
- `app/api/templates/fill/[sessionId]/checkout/route.ts`
- `app/api/wallet/topup/route.ts`
- `components/admin/payments/ProvidersPage.tsx`
- `components/admin/payments/providers-page.module.css`
- `docs/pesapal/ARCHITECTURE.md` (provided project spec, included with the branch)
- `docs/pesapal/MISSION-P0.md` (provided project brief, included with the branch)
- `docs/pesapal/env.example`
- `lib/payments/adminNotifications.ts`
- `lib/payments/adminSettings.ts`
- `lib/payments/availability.ts`
- `lib/payments/fx.ts`
- `lib/payments/invoiceRequest.ts`
- `lib/payments/registry.ts`
- `lib/payments/settings.ts`
- `public/payments/authorizenet.svg`
- `public/payments/manual.svg`
- `public/payments/nmi.svg`
- `public/payments/pesapal.svg`
- `supabase/migrations/20261016000000_pesapal_payment_provider_settings.sql`
- `tests/payment-admin-ui-contract.test.ts`
- `tests/payment-enforcement.test.ts`
- `tests/payment-methods-api.test.ts`
- `tests/payment-provider-regression.test.ts`
- `tests/payment-settings-api.test.ts`
- `tests/payments-p0-unit.test.ts`
- `docs/pesapal/P0-REPORT.md`

## Implementation summary

The capability registry and versioned settings cache cover NMI, Authorize.Net, manual wallet/invoice, and disabled owner-test-only Pesapal. The methods API is no-store and only serializes public client configuration. Server pricing paths check method availability before charging or debiting. A no-method checkout creates an unpaid `pending_invoice` order, records an incident, and sends the owner alert without calling a gateway.

The admin page supports provider and method settings, allowlists, health, retirement blocking, default card selection, reordering, change history, and a required reason. Settings changes use owner-admin authorization, registry validation, optimistic version checks, database audit triggers, and email alerts. FX work is limited to pure rate, currency, rounding, and quote-lock functions. No Pesapal adapter, provider request, or ECB fetch was added.

## Tests added

- `tests/payments-p0-unit.test.ts`: registry, availability, allowlist, currency fallback, minimum, dormant country routing, cache version/TTL, FX cross-rate, rounding, lock expiry, and owner ID validation.
- `tests/payment-settings-api.test.ts`: owner authorization, invalid provider/method rejection, version conflict, audit trigger contract, email attempt, and before/after alert values.
- `tests/payment-methods-api.test.ts`: no-store/public fields, sensitive config filtering, and unsupported currency rejection.
- `tests/payment-enforcement.test.ts`: disabled-method 409 and all-disabled invoice fallback with no gateway call.
- `tests/payment-provider-regression.test.ts`: seeded NMI/default/vault and existing new-card, saved-card, and wallet route contracts.
- `tests/payment-admin-ui-contract.test.ts`: semantic labels, explicit input names, keyboard focus styling, and responsive CSS contract.

No tests, build, lint, or dev server were run. This worktree has no `node_modules`, and the brief explicitly forbids installing dependencies or running those commands on this Mac.

The requested local commit was not created. A retry of `git add` failed because Git stores this linked worktree's index under the sibling repository's `.git/worktrees/payments-p0/`, outside the writable worktree root. No push was attempted.

No Playwright/axe browser spec was added. The repository Playwright config discovers `e2e/**`, which is outside the brief’s explicit write scope (`tests/**` and `__tests__/**`). The current Playwright setup also requires a running server and Clerk test credentials; `@axe-core/playwright` is not a declared dependency. The supervisor should run the 390/768/1440 browser and axe review in an authorized test setup.

## Migration

Proposed migration: `supabase/migrations/20261016000000_pesapal_payment_provider_settings.sql`.

It was not applied. It creates the provider, method, global, audit, payment-attempt, ledger, and FX-rate tables; enables RLS without client policies; seeds current providers and methods; adds audit/append-only triggers and a service-role versioned patch RPC; extends the payment incident kind constraint; and adds the `pending_invoice` order status. A rollback section is included in the migration.

## Live schema assumptions

The migration and invoice fallback assume the existing `public.profiles(id)` and `public.orders(id)` identifiers are UUIDs; `public.orders` has the fields written by `createInvoiceRequestOrder`; existing order status checks are named `orders_status_check` and/or `orders_status_fiverr_check`; and `public.payment_incidents` has the columns and named kind check in `supabase/checkout_idempotency.sql`. The payment attempt table uses `gen_random_uuid()`. These assumptions were taken from repository SQL and code. No live database schema was queried, and no migration was executed.

## Open issues for supervisor review

- Compare the proposed order status constraint, order columns, payment incident constraint, and profile foreign keys against the live schema before applying the migration.
- Current NMI/Authorize.Net/manual transactions are not backfilled into `payment_attempts` by P0/P0.5. Provider health and retirement checks therefore cover rows present in `payment_attempts`; legacy order/refund-window state needs a read-only schema/data review and a safe backfill or separate retirement gate before hard retirement is used.
- Run the requested Playwright viewport screenshots and axe review from the authorized browser test environment.
- Run Jest, typecheck, lint, and build on the supervisor’s machine with dependencies available.
- Stage and commit the complete work from an environment permitted to write the linked Git metadata.
