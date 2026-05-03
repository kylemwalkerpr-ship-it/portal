alter table services add column if not exists currency varchar(3) default 'usd';
alter table services add column if not exists usd_price numeric(10, 2);
alter table services add column if not exists stripe_payment_link_id varchar(255);
alter table services add column if not exists stripe_payment_link_url text;

insert into services (title, category, price, usd_price, delivery_days, is_active, currency, stripe_payment_link_id, stripe_payment_link_url)
select *
from (
  values
  ('Study Permit Starter Package', 'Study Permits', 497, 380.32, 7, true, 'cad', 'plink_1TErrgFy6WULRNincLrtfh9a', 'https://buy.stripe.com/4gM3cvgsV1mK3azeDWgYU02'),
  ('Study Permit Standard Package', 'Study Permits', 997, 762.93, 10, true, 'cad', 'plink_1TErrhFy6WULRNin1eYfcHUX', 'https://buy.stripe.com/aFa8wP6Sl5D026v2VegYU03'),
  ('Study Permit Premium Package', 'Study Permits', 1497, 1145.54, 14, true, 'cad', 'plink_1TErrjFy6WULRNinZMO87BTf', 'https://buy.stripe.com/14AaEX6Sl9TgcL91RagYU04'),
  ('Study Permit & Visa Consulting', 'Study Permits', 150, 150.00, 5, true, 'usd', 'plink_1TEa5LFy6WULRNinNCB38EN3', 'https://buy.stripe.com/cNieVd0tX9Tgh1pgM4gYU00'),
  ('University Admission Basic', 'University Admissions', 297, 227.27, 7, true, 'cad', 'plink_1TErrkFy6WULRNinSzX4tzCT', 'https://buy.stripe.com/aFadR9ccF1mKdPd0N6gYU05'),
  ('University Admission Comprehensive', 'University Admissions', 797, 609.88, 14, true, 'cad', 'plink_1TErrlFy6WULRNinkRAgQQjn', 'https://buy.stripe.com/6oU5kDfoRc1o6mL2VegYU06'),
  ('University Admission Elite', 'University Admissions', 1297, 992.49, 28, true, 'cad', 'plink_1TErrmFy6WULRNinH1vwhdwP', 'https://buy.stripe.com/fZu5kD6SlfdA4eDanGgYU07'),
  ('PGWP Only Package', 'Post-Graduate', 597, 456.84, 7, true, 'cad', 'plink_1TErrnFy6WULRNinF9freoYu', 'https://buy.stripe.com/eVq4gzekN5D07qP8fygYU08'),
  ('PR Roadmap Package', 'PR & Immigration', 1097, 839.45, 10, true, 'cad', 'plink_1TErroFy6WULRNinoZ5VxI9X', 'https://buy.stripe.com/8x2aEXccF9Tg3az3ZigYU09'),
  ('Full PR Acceleration Package', 'PR & Immigration', 1997, 1528.15, 42, true, 'cad', 'plink_1TErrqFy6WULRNin3txfIR1m', 'https://buy.stripe.com/8x2fZhb8B0iGfXl2VegYU0a'),
  ('Arrival Essentials Package', 'Settlement', 797, 609.88, 5, true, 'cad', 'plink_1TErrrFy6WULRNinOVriJyGX', 'https://buy.stripe.com/aFacN590t3uS7qPanGgYU0b'),
  ('Full Settlement Package', 'Settlement', 1497, 1145.54, 10, true, 'cad', 'plink_1TErrsFy6WULRNincQ1zpHKW', 'https://buy.stripe.com/4gM00jdgJ3uScL92VegYU0c'),
  ('Premium Integration Package', 'Settlement', 2497, 1910.76, 90, true, 'cad', 'plink_1TErrtFy6WULRNinvnIl3YOT', 'https://buy.stripe.com/aFaeVd90taXkaD11RagYU0d'),
  ('Monthly Mentorship', 'Mentorship', 199, 150.45, 30, true, 'cad', 'plink_1TErrvFy6WULRNinCAmMykqT', 'https://buy.stripe.com/bJe6oH5Oh1mKfXlcvOgYU0e'),
  ('Quarterly Mentorship', 'Mentorship', 499, 381.85, 90, true, 'cad', 'plink_1TErrwFy6WULRNinqS2xg0OX', 'https://buy.stripe.com/dRmeVd90t7L826v1RagYU0f'),
  ('Annual Mentorship', 'Mentorship', 1799, 1376.64, 365, true, 'cad', 'plink_1TErrxFy6WULRNinCQimIDoV', 'https://buy.stripe.com/7sY14nfoRghE4eD53mgYU0g'),
  ('Credential Assessment Guided', 'Credentials', 297, 227.27, 7, true, 'cad', 'plink_1TErryFy6WULRNinNWimCBmp', 'https://buy.stripe.com/4gMbJ12C50iG8uT9jCgYU0h'),
  ('Credential Assessment Full + Appeal', 'Credentials', 597, 456.84, 14, true, 'cad', 'plink_1TErrzFy6WULRNindrXxDUdj', 'https://buy.stripe.com/00wcN55Oh7L85iH53mgYU0i'),
  ('Resume & LinkedIn Glow-Up', 'Career', 397, 303.79, 5, true, 'cad', 'plink_1TErs0Fy6WULRNinkoRJL6qr', 'https://buy.stripe.com/28E7sL5Ohd5s7qP67qgYU0j'),
  ('Job Search Mastery', 'Career', 897, 686.41, 14, true, 'cad', 'plink_1TErs2Fy6WULRNin6JW3ePDA', 'https://buy.stripe.com/00weVdfoR3uS12rfI0gYU0k'),
  ('Premium Placement Package', 'Career', 1497, 1145.54, 28, true, 'cad', 'plink_1TErs3Fy6WULRNintjwRRrSD', 'https://buy.stripe.com/5kQ6oH5Ohd5s3az9jCgYU0l')
) as data(title, category, price, usd_price, delivery_days, is_active, currency, stripe_payment_link_id, stripe_payment_link_url)
where not exists (
  select 1 from services where services.title = data.title
);

update services
set
  price = data.price,
  usd_price = data.usd_price,
  currency = data.currency,
  stripe_payment_link_id = data.stripe_payment_link_id,
  stripe_payment_link_url = data.stripe_payment_link_url,
  is_active = data.is_active
from (
  values
    ('Study Permit Starter Package', 497, 380.32, 'cad', 'plink_1TErrgFy6WULRNincLrtfh9a', 'https://buy.stripe.com/4gM3cvgsV1mK3azeDWgYU02', true),
    ('Study Permit Standard Package', 997, 762.93, 'cad', 'plink_1TErrhFy6WULRNin1eYfcHUX', 'https://buy.stripe.com/aFa8wP6Sl5D026v2VegYU03', true),
    ('Study Permit Premium Package', 1497, 1145.54, 'cad', 'plink_1TErrjFy6WULRNinZMO87BTf', 'https://buy.stripe.com/14AaEX6Sl9TgcL91RagYU04', true),
    ('Study Permit & Visa Consulting', 150, 150.00, 'usd', 'plink_1TEa5LFy6WULRNinNCB38EN3', 'https://buy.stripe.com/cNieVd0tX9Tgh1pgM4gYU00', true),
    ('University Admission Basic', 297, 227.27, 'cad', 'plink_1TErrkFy6WULRNinSzX4tzCT', 'https://buy.stripe.com/aFadR9ccF1mKdPd0N6gYU05', true),
    ('University Admission Comprehensive', 797, 609.88, 'cad', 'plink_1TErrlFy6WULRNinkRAgQQjn', 'https://buy.stripe.com/6oU5kDfoRc1o6mL2VegYU06', true),
    ('University Admission Elite', 1297, 992.49, 'cad', 'plink_1TErrmFy6WULRNinH1vwhdwP', 'https://buy.stripe.com/fZu5kD6SlfdA4eDanGgYU07', true),
    ('PGWP Only Package', 597, 456.84, 'cad', 'plink_1TErrnFy6WULRNinF9freoYu', 'https://buy.stripe.com/eVq4gzekN5D07qP8fygYU08', true),
    ('PR Roadmap Package', 1097, 839.45, 'cad', 'plink_1TErroFy6WULRNinoZ5VxI9X', 'https://buy.stripe.com/8x2aEXccF9Tg3az3ZigYU09', true),
    ('Full PR Acceleration Package', 1997, 1528.15, 'cad', 'plink_1TErrqFy6WULRNin3txfIR1m', 'https://buy.stripe.com/8x2fZhb8B0iGfXl2VegYU0a', true),
    ('Arrival Essentials Package', 797, 609.88, 'cad', 'plink_1TErrrFy6WULRNinOVriJyGX', 'https://buy.stripe.com/aFacN590t3uS7qPanGgYU0b', true),
    ('Full Settlement Package', 1497, 1145.54, 'cad', 'plink_1TErrsFy6WULRNincQ1zpHKW', 'https://buy.stripe.com/4gM00jdgJ3uScL92VegYU0c', true),
    ('Premium Integration Package', 2497, 1910.76, 'cad', 'plink_1TErrtFy6WULRNinvnIl3YOT', 'https://buy.stripe.com/aFaeVd90taXkaD11RagYU0d', true),
    ('Monthly Mentorship', 199, 150.45, 'cad', 'plink_1TErrvFy6WULRNinCAmMykqT', 'https://buy.stripe.com/bJe6oH5Oh1mKfXlcvOgYU0e', true),
    ('Quarterly Mentorship', 499, 381.85, 'cad', 'plink_1TErrwFy6WULRNinqS2xg0OX', 'https://buy.stripe.com/dRmeVd90t7L826v1RagYU0f', true),
    ('Annual Mentorship', 1799, 1376.64, 'cad', 'plink_1TErrxFy6WULRNinCQimIDoV', 'https://buy.stripe.com/7sY14nfoRghE4eD53mgYU0g', true),
    ('Credential Assessment Guided', 297, 227.27, 'cad', 'plink_1TErryFy6WULRNinNWimCBmp', 'https://buy.stripe.com/4gMbJ12C50iG8uT9jCgYU0h', true),
    ('Credential Assessment Full + Appeal', 597, 456.84, 'cad', 'plink_1TErrzFy6WULRNindrXxDUdj', 'https://buy.stripe.com/00wcN55Oh7L85iH53mgYU0i', true),
    ('Resume & LinkedIn Glow-Up', 397, 303.79, 'cad', 'plink_1TErs0Fy6WULRNinkoRJL6qr', 'https://buy.stripe.com/28E7sL5Ohd5s7qP67qgYU0j', true),
    ('Job Search Mastery', 897, 686.41, 'cad', 'plink_1TErs2Fy6WULRNin6JW3ePDA', 'https://buy.stripe.com/00weVdfoR3uS12rfI0gYU0k', true),
    ('Premium Placement Package', 1497, 1145.54, 'cad', 'plink_1TErs3Fy6WULRNintjwRRrSD', 'https://buy.stripe.com/5kQ6oH5Ohd5s3az9jCgYU0l', true)
) as data(title, price, usd_price, currency, stripe_payment_link_id, stripe_payment_link_url, is_active)
where services.title = data.title;
