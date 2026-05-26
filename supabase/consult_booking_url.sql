-- Adds an optional Calendly / Cal.com / similar booking URL to the
-- attorneys and consultants tables. When the seller has both
-- offers_free_consult = true AND a consult_booking_url set, the
-- public seller card's "Free 15-min consult" badge becomes a clickable
-- link that opens the booking page in a new tab (target="_blank").
-- Without a URL the badge stays static — sellers can flip the toggle
-- on without committing to a scheduling tool.

ALTER TABLE attorneys
  ADD COLUMN IF NOT EXISTS consult_booking_url TEXT;

ALTER TABLE consultants
  ADD COLUMN IF NOT EXISTS consult_booking_url TEXT;

COMMENT ON COLUMN attorneys.consult_booking_url IS
  'Public booking URL (Calendly / Cal.com / similar). Used by the public seller card''s Free consult CTA when offers_free_consult is true.';
COMMENT ON COLUMN consultants.consult_booking_url IS
  'Public booking URL (Calendly / Cal.com / similar). Used by the public seller card''s Free consult CTA when offers_free_consult is true.';
