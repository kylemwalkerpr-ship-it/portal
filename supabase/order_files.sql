-- Track when an order was completed for accurate earnings reporting
alter table orders add column if not exists completed_at timestamptz;

-- Order files: deliverables / supporting docs shared between students and consultants
create table if not exists order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  uploader_id uuid not null references profiles(id) on delete cascade,
  uploader_role text not null check (uploader_role in ('client','consultant','admin','support')),
  name text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists order_files_order_id_idx on order_files(order_id, created_at desc);

-- Order notification reads: per-consultant tracking of which notifications were dismissed
create table if not exists consultant_notification_reads (
  consultant_id uuid not null references profiles(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  primary key (consultant_id, notification_key)
);

-- Storage bucket for order files (private)
insert into storage.buckets (id, name, public)
values ('order-files', 'order-files', false)
on conflict (id) do nothing;
