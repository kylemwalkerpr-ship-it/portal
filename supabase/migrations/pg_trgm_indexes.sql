-- pg_trgm GIN indexes for leading-wildcard ilike queries
-- pg_trgm extension is already installed (v1.6).
--
-- Without these indexes, ILIKE '%query%' forces PostgreSQL to scan every row.
-- GIN trigram indexes enable indexed lookups for leading-wildcard patterns.
--
-- Idempotent: safe to re-run.

-- Inquiries: case_type_label, country, email — searched by attorney, client, support, and admin dashboards
CREATE INDEX IF NOT EXISTS idx_inquiries_case_type_label_trgm
  ON public.inquiries
  USING GIN (case_type_label gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_inquiries_country_trgm
  ON public.inquiries
  USING GIN (country gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_inquiries_email_trgm
  ON public.inquiries
  USING GIN (email gin_trgm_ops);

-- Profiles: email — searched by admin user management
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm
  ON public.profiles
  USING GIN (email gin_trgm_ops);

-- Orders: order_number — searched by attorney, student, and admin dashboards
CREATE INDEX IF NOT EXISTS idx_orders_order_number_trgm
  ON public.orders
  USING GIN (order_number gin_trgm_ops);

-- Attorneys: jurisdictions and practice_areas — standalone ilike filters on public attorney search
CREATE INDEX IF NOT EXISTS idx_attorneys_jurisdictions_trgm
  ON public.attorneys
  USING GIN (jurisdictions gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_attorneys_practice_areas_trgm
  ON public.attorneys
  USING GIN (practice_areas gin_trgm_ops);
