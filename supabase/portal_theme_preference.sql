-- Per-user dashboard theme preference. Default 'mountain-view' so
-- existing rows pick up the new column without breaking.
alter table public.profiles
  add column if not exists theme_preference text
    not null default 'mountain-view'
    check (theme_preference in (
      'mountain-view', 'lake-view', 'ocean-view', 'forest-view', 'desert-view'
    ));

comment on column public.profiles.theme_preference is
  'Per-user dashboard theme. Set via PATCH /api/profile/theme. Drives the [data-portal-theme] attribute on the role-shell root.';
