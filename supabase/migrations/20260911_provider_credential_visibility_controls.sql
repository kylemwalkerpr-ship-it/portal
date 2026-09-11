-- Provider credential privacy controls.
--
-- Professional licence / bar / regulator identifiers remain stored for
-- verification, but public visibility is controlled independently from the
-- credential value itself.
--
-- Precedence in public rendering:
--   admin override FALSE -> hidden
--   admin override TRUE  -> visible
--   admin override NULL  -> provider preference
-- Provider preference defaults TRUE for existing/new verified providers.

alter table public.attorneys
  add column if not exists admin_show_bar_number_override boolean null;

comment on column public.attorneys.show_bar_number is
  'Provider-controlled public visibility preference for the attorney bar / licence identifier. Defaults visible.';
comment on column public.attorneys.admin_show_bar_number_override is
  'Optional admin override for public credential visibility. NULL = respect provider preference; true = force visible; false = force hidden.';

alter table public.consultants
  add column if not exists show_registration_number boolean not null default true,
  add column if not exists admin_show_registration_number_override boolean null;

comment on column public.consultants.show_registration_number is
  'Provider-controlled public visibility preference for the consultant regulator / registration identifier. Defaults visible.';
comment on column public.consultants.admin_show_registration_number_override is
  'Optional admin override for public credential visibility. NULL = respect provider preference; true = force visible; false = force hidden.';
