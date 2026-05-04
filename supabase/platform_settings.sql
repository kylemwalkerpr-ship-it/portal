create table if not exists platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now() not null
);

insert into platform_settings (key, value)
values (
  'default',
  jsonb_build_object(
    'platform_fee_percent', 20,
    'consultant_fee_percent', 80,
    'auto_release_days', 14,
    'allow_admin_force_release', true,
    'platform_name', 'Yousafe Consultancy',
    'support_email', 'support@yousafeconsultancy.com'
  )
)
on conflict (key) do nothing;
