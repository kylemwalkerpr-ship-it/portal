# Supabase Migrations

This directory contains all SQL migration files for the YouSafe Portal database. Each file is **idempotent** (`IF NOT EXISTS` / `DROP ... IF EXISTS` throughout) and safe to re-run.

---

## Deleted / deprecated files (removed from tree)

These files were kept for reference but have been deleted since their content was purely historical comments or Stripe-specific. See git history for original content.

| File | Superseded by |
|---|---|
| `stripe_connect.sql` | `canonical_ledger.sql` + `wallet_nmi.sql` |
| `stripe_connect_bypass.sql` | N/A — Stripe Connect fully excised from the platform |
| `stripe_excision.sql` | `canonical_ledger.sql` |
| `services_seed.sql` | Live `services` table managed via admin dashboard |

---

## Active migrations — grouped by topic

### Foundation & Schema Setup

| File | What it does |
|---|---|
| `profile_preferences.sql` | User profile preferences (notifications, theme, etc.) |
| `profiles_country.sql` | Country column on profiles |
| `profiles_phone_patch.sql` | Phone number column on profiles |
| `seller_profile_id_unique.sql` | Enforce unique profile_id on seller tables |
| `allow_attorney_role.sql` | Add `attorney` to profile role check |
| `allow_support_role.sql` | Add `support` to profile role check |
| `platform_settings.sql` | Global platform configuration table |

### Messaging & Inquiries

| File | What it does |
|---|---|
| `messenger_foundation.sql` | Core messaging tables (messages, conversations) |
| `messenger_phase2.sql` | Attachments, read receipts, typing indicators |
| `messenger_wallpapers_bucket.sql` | Storage bucket for chat wallpapers |
| `message_attachments_bucket.sql` | Storage bucket for file attachments |
| `unified_conversations.sql` | Unified conversation model across roles |
| `unified_conversations_backfill.sql` | Backfill existing messages into unified model |
| `backfill_unified_conversations.sql` | Another backfill pass for missed conversations |
| `inquiries_pipeline.sql` | Inquiry lifecycle (open → claimed → engaged) |
| `inquiry_full_lifecycle.sql` | Extended inquiry state machine |
| `inquiry_cleanup_cron.sql` | PG cron to close stale inquiries (replaced by `inquiry_offer_cleanup_cron.sql`) |
| `inquiry_offer_cleanup_cron.sql` | Replaces the above — also expires offers, logs to admin_audit_log |
| `inquiry_attorney_targeting.sql` | Attorney targeting / routing rules |

### Orders & Escrow

| File | What it does |
|---|---|
| `order_files.sql` | File attachments on orders |
| `order_messages_patch.sql` | Messages linked to orders |
| `order_scalability.sql` | Indexes and performance for orders |
| `order_escrow_status.sql` | Escrow state tracking on orders |
| `orders_columns_patch.sql` | Additional columns on orders |
| `orders_currency_patch.sql` | Multi-currency support on orders |
| `orders_add_progress_column.sql` | Progress percentage on orders |
| `orders_escrow_columns_patch.sql` | Escrow-specific columns on orders |
| `escrow_system_v2.sql` | Core escrow tables (deposits, releases, refunds) |
| `escrow_auto_release_cron.sql` | PG cron for auto-releasing eligible escrows |

### Payments & Ledger

| File | What it does |
|---|---|
| `canonical_ledger.sql` | Unified ledger table replacing Stripe accounting |
| `payment_acknowledgments.sql` | Payment acknowledgment records |
| `payments_add_gateway_column.sql` | Gateway identifier column (NMI, etc.) |
| `wallet_nmi.sql` | NMI-powered wallet/top-up system |
| `drop_deprecated_stripe_columns.sql` | Drops all deprecated Stripe columns from services, consultants, attorneys, attorney_offers |

### Providers — Consultants

| File | What it does |
|---|---|
| `consultant_provisioning.sql` | Base consultants table + profile sync |
| `consultant_applications.sql` | Consultant application / intake |
| `consultant_dashboard.sql` | Consultant dashboard KPIs |
| `consultant_drop_legacy_columns.sql` | Drop legacy columns from consultants table |
| `consultant_role_refactor.sql` | Role rename / refactor for consultants |
| `availability_default_away.sql` | Default consultants to away |
| `seller_consult_booking_url.sql` | Booking URL for consultant profiles |
| `consult_booking_url.sql` | Booking URL feature (consultants) |

### Providers — Attorneys

| File | What it does |
|---|---|
| `attorney_compliance_payments.sql` | ABA-compliant fee model, platform_fee columns |
| `attorney_applications_scale.sql` | Attorney application scaling |
| `attorney_application_malpractice_optional.sql` | Make malpractice optional for attorney apps |
| `attorney_credential_columns.sql` | Credential columns (bar number, jurisdiction) |
| `attorney_profile_enrichment.sql` | Attorney profile enrichment fields |
| `attorney_ratings.sql` | Attorney rating/review system |

### Gig Marketplace

| File | What it does |
|---|---|
| `fiverr_gig_system.sql` | Core gig system (models Fiverr marketplace) |
| `gig_management_v2.sql` | Gig CRUD and management |
| `gig_scalability.sql` | Performance indexes for gigs |
| `gig_slug_backfill.sql` | Backfill slug values on existing gigs |
| `gigs_columns_patch.sql` | Additional columns on gigs |
| `marketplace_fiverr_upgrade.sql` | Marketplace upgrade to Fiverr model |
| `marketplace_consultant_intake.sql` | Consultant intake on marketplace |
| `marketplace_gig_builder_fields.sql` | Builder/editor fields for gig creation |
| `marketplace_gig_jurisdiction.sql` | Jurisdiction filtering for gigs |
| `marketplace_profile_username.sql` | Username/slug for marketplace profiles |
| `provider_offers_and_gigs.sql` | Provider offers and gigs tables |

### Templates & Services

| File | What it does |
|---|---|
| `templates_catalogue.sql` | Template catalogue (immigration templates) |
| `template_orders.sql` | Orders for template purchases |
| `template_storage.sql` | Storage bucket for template files |
| `template_pdf_renders_jun2026.sql` | PDF rendering for templates |
| `legal_services_seed.sql` | Seed data for MyCaseworks legal services |
| `portal_verticals.sql` | Vertical/tenant support (immigration, legal) |

### Other

| File | What it does |
|---|---|
| `translations_cache.sql` | Cached translations for multilingual UI |
| `document_security_jun2026.sql` | Document-level security (encrypted access, signed URLs) |
| `portal_theme_preference.sql` | Theme/color preference per user |
| `pending_jun_2026.sql` | Miscellaneous pending changes from June 2026 |
---

## Execution order (recommended)

These migrations are designed to be idempotent, so the exact order doesn't matter for safety — but the logical dependency order is:

1. Foundation (`profile_preferences`, `platform_settings`, roles)
2. Profiles (`profiles_country`, `profiles_phone_patch`, `seller_profile_id_unique`)
3. Messaging (`messenger_foundation` → `messenger_phase2` → `unified_conversations`)
4. Inquiries (`inquiries_pipeline` → `inquiry_full_lifecycle`)
5. Escrow (`escrow_system_v2` → `escrow_auto_release_cron`)
6. Ledger / Wallet (`canonical_ledger` → `wallet_nmi`)
7. Providers (`consultant_provisioning` → `attorney_compliance_payments`)
8. Gigs / Marketplace (`fiverr_gig_system` → `gig_management_v2`)
9. Templates (`templates_catalogue` → `template_orders`)
10. Cleanup (`drop_deprecated_stripe_columns`)

---

## Running a fresh migration

```bash
# The portal's CI/CD pipeline applies all .sql files during deployment.
# To apply manually against a new database:
for f in supabase/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

All files are idempotent — re-running is safe.
