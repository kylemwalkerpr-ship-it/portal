alter table orders add column if not exists escrow_status varchar(50) default 'held';
alter table orders add column if not exists payout_released_at timestamptz;
