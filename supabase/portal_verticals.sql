-- Verticals: lets the portal serve more than one vertical (study-abroad
-- consultancy + legal document prep + future verticals) on a single backend.
--
-- Existing rows default to 'study_abroad' so YouSafe behaviour is unchanged.
-- New "legal" vertical surfaces attorney-style services on caseworks. The
-- portal still stores attorneys in the consultants table and clients in the
-- profiles table; we just tag each row with its vertical.
--
-- Idempotent — safe to run repeatedly.

alter table services    add column if not exists vertical text not null default 'study_abroad';
alter table consultants add column if not exists vertical text not null default 'study_abroad';
alter table profiles    add column if not exists vertical text;

-- Constrain the vertical to the supported set. Use a separate "soft" check
-- via app code rather than a strict CHECK constraint so we can add future
-- verticals without coupled schema migrations.
create index if not exists services_vertical_idx    on services    (vertical);
create index if not exists consultants_vertical_idx on consultants (vertical);
create index if not exists profiles_vertical_idx    on profiles    (vertical);

-- Backfill: every existing services row was created for the study-abroad
-- catalogue, so the default suffices. No further backfill needed.
