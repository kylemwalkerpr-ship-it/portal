alter table consultants add column if not exists stripe_account_id varchar(255);
alter table consultants add column if not exists stripe_onboarding_complete boolean default false;

alter table orders add column if not exists platform_fee_amount integer default 0;
alter table orders add column if not exists consultant_payout_amount integer default 0;
alter table orders add column if not exists stripe_transfer_id varchar(255);
alter table orders add column if not exists payout_status varchar(50) default 'pending';

create index if not exists consultants_stripe_account_id_idx on consultants (stripe_account_id);
create index if not exists orders_payout_status_idx on orders (payout_status);
