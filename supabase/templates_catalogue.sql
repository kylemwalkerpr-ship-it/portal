-- Adds digital immigration templates as a separate catalogue product type.
-- Existing services remain product_type = 'service' and keep their current
-- booking / escrow behaviour.

alter table services add column if not exists product_type text not null default 'service';
alter table services add column if not exists slug text;
alter table services add column if not exists short_description text;
alter table services add column if not exists full_description text;
alter table services add column if not exists region text;
alter table services add column if not exists template_type text;
alter table services add column if not exists currency_base varchar(3) default 'USD';
alter table services add column if not exists price_cad_display numeric(10, 2);
alter table services add column if not exists badge text;
alter table services add column if not exists status text not null default 'active';
alter table services add column if not exists delivery_type text;
alter table services add column if not exists file_path text;
alter table services add column if not exists stripe_product_id varchar(255);
alter table services add column if not exists stripe_price_id_usd varchar(255);
alter table services add column if not exists stripe_payment_link_usd text;
alter table services add column if not exists stripe_price_id_cad varchar(255);
alter table services add column if not exists stripe_payment_link_cad text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'services_product_type_check'
  ) then
    alter table services add constraint services_product_type_check
      check (product_type in ('service', 'template')) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'services_status_check'
  ) then
    alter table services add constraint services_status_check
      check (status in ('active', 'draft', 'archived')) not valid;
  end if;
end $$;

create unique index if not exists services_template_slug_uidx
  on services (slug)
  where product_type = 'template' and slug is not null;

create index if not exists services_product_type_status_idx
  on services (product_type, status, is_active);

update services
set product_type = 'service',
    status = case when is_active then 'active' else 'draft' end
where product_type is null or product_type = '';

insert into services (
  product_type,
  slug,
  title,
  category,
  short_description,
  full_description,
  region,
  template_type,
  price,
  usd_price,
  currency,
  currency_base,
  price_cad_display,
  badge,
  status,
  is_active,
  delivery_type,
  delivery_days,
  file_path,
  vertical
)
select *
from (
  values
  ('template', 'us-f1-student-visa-ds160-i20-pack', 'USA F-1 Student Visa DS-160 + I-20 Preparation Pack', 'Templates', 'A guided F-1 student visa preparation kit covering DS-160 planning, I-20 details, SEVIS fee tracking, embassy interview document organization, and school/program summary notes.', 'Instant-access digital preparation template. Designed to help organize F-1 student visa documents before submitting through official government channels.', 'USA', 'USA Study', 29, 29, 'usd', 'USD', null::numeric, 'Best for F-1 applicants', 'active', true, 'Digital Template', 0, 'templates/usa/us-f1-student-visa-ds160-i20-pack/README.md', 'study_abroad'),
  ('template', 'us-f1-interview-home-ties-pack', 'USA F-1 Interview + Home Ties Evidence Pack', 'Templates', 'Client-ready templates for organizing home-country ties, academic intent, funding story, sponsor relationship, and interview answer practice without guaranteeing approval.', 'Digital F-1 interview and home-ties preparation templates for organizing evidence and notes.', 'USA', 'USA Study', 19, 19, 'usd', 'USD', null::numeric, 'Interview-ready', 'active', true, 'Digital Template', 0, 'templates/usa/us-f1-interview-home-ties-pack/README.md', 'study_abroad'),
  ('template', 'us-b1b2-visitor-visa-ds160-invitation-pack', 'USA B-1/B-2 Visitor Visa DS-160 + Invitation Pack', 'Templates', 'A visitor visa document-prep pack with trip purpose worksheet, invitation letter template, itinerary planner, and financial/travel history organizer.', 'Digital B-1/B-2 visitor visa preparation templates for organizing trip purpose, invitation, itinerary, and supporting evidence.', 'USA', 'USA Visitor', 19, 19, 'usd', 'USD', null::numeric, 'Visitor visa', 'active', true, 'Digital Template', 0, 'templates/usa/us-b1b2-visitor-visa-ds160-invitation-pack/README.md', 'study_abroad'),
  ('template', 'us-opt-i765-application-prep-pack', 'USA F-1 OPT I-765 Application Preparation Pack', 'Templates', 'A structured OPT application organizer for I-765 filing readiness, DSO endorsement tracking, identity evidence, prior employment authorization, and mailing/online-filing audit notes.', 'Digital OPT preparation templates for organizing I-765 readiness, evidence, DSO endorsement tracking, and post-submission notes.', 'USA', 'USA Work After Study', 25, 25, 'usd', 'USD', null::numeric, 'OPT', 'active', true, 'Digital Template', 0, 'templates/usa/us-opt-i765-application-prep-pack/README.md', 'study_abroad'),
  ('template', 'us-stem-opt-i765-i983-companion-pack', 'USA STEM OPT I-765 + I-983 Companion Pack', 'Templates', 'A STEM OPT planning pack for organizing employer details, training-plan notes, I-765 evidence, and 24-month extension timeline control.', 'Digital STEM OPT preparation templates for employer details, I-983 notes, I-765 evidence, and reporting timelines.', 'USA', 'USA Work After Study', 29, 29, 'usd', 'USD', null::numeric, 'STEM OPT', 'active', true, 'Digital Template', 0, 'templates/usa/us-stem-opt-i765-i983-companion-pack/README.md', 'study_abroad'),
  ('template', 'us-i134-financial-support-companion-pack', 'USA I-134 Financial Support Companion Pack', 'Templates', 'A support-document organizer for sponsors preparing financial evidence and beneficiary-support explanations alongside official USCIS I-134 guidance.', 'Digital I-134 financial support organizer for sponsor evidence, relationship notes, and document naming.', 'USA', 'USA Financial Support', 17, 17, 'usd', 'USD', null::numeric, 'Sponsor support', 'active', true, 'Digital Template', 0, 'templates/usa/us-i134-financial-support-companion-pack/README.md', 'study_abroad'),
  ('template', 'canada-study-permit-complete-pack', 'Canada Study Permit Complete Application Preparation Pack', 'Templates', 'A Canada study permit prep kit covering letter of acceptance, PAL/TAL/CAQ notes, proof of funds, study plan, family info, and portal upload organization.', 'Digital Canada study permit preparation templates for organizing study plan, proof of funds, family information, and upload readiness.', 'Canada', 'Canada Study', 29, 29, 'usd', 'USD', null::numeric, 'Best seller', 'active', true, 'Digital Template', 0, 'templates/canada/canada-study-permit-complete-pack/README.md', 'study_abroad'),
  ('template', 'canada-proof-of-funds-sponsor-pack', 'Canada Proof of Funds + Sponsor Support Pack', 'Templates', 'A financial-document kit for organizing tuition, living expenses, sponsor income, bank statements, scholarship proof, GICs, loans, and explanatory notes.', 'Digital Canada proof-of-funds and sponsor-support templates for organizing financial evidence.', 'Canada', 'Canada Study', 19, 19, 'usd', 'USD', null::numeric, 'Proof of funds', 'active', true, 'Digital Template', 0, 'templates/canada/canada-proof-of-funds-sponsor-pack/README.md', 'study_abroad'),
  ('template', 'canada-study-plan-letter-of-explanation-pack', 'Canada Study Plan + Letter of Explanation Pack', 'Templates', 'Editable templates for a Canada study plan, statement of purpose, program rationale, career pathway, and refusal-risk explanation addendum.', 'Digital Canada study plan and letter of explanation templates for study permit preparation.', 'Canada', 'Canada Study', 17, 17, 'usd', 'USD', null::numeric, 'SOP / LOE', 'active', true, 'Digital Template', 0, 'templates/canada/canada-study-plan-letter-of-explanation-pack/README.md', 'study_abroad'),
  ('template', 'canada-trv-visitor-visa-pack', 'Canada Temporary Resident Visa Visitor Pack', 'Templates', 'A Canada visitor visa prep pack with IMM 5257 planning notes, invitation letter, travel itinerary, host support statement, and document checklist.', 'Digital Canada TRV visitor visa preparation templates for organizing invitation, itinerary, host support, and document checklist items.', 'Canada', 'Canada Visitor', 19, 19, 'usd', 'USD', null::numeric, 'TRV', 'active', true, 'Digital Template', 0, 'templates/canada/canada-trv-visitor-visa-pack/README.md', 'study_abroad'),
  ('template', 'canada-work-permit-outside-canada-pack', 'Canada Work Permit Outside Canada Preparation Pack', 'Templates', 'A work permit organizer for IMM 1295 preparation, employer details, job-offer evidence, passport/photo items, and portal upload readiness.', 'Digital Canada work permit preparation templates for organizing employer details, job-offer evidence, and upload readiness.', 'Canada', 'Canada Work', 25, 25, 'usd', 'USD', null::numeric, 'Work permit', 'active', true, 'Digital Template', 0, 'templates/canada/canada-work-permit-outside-canada-pack/README.md', 'study_abroad'),
  ('template', 'canada-pgwp-application-pack', 'Canada PGWP Post-Graduation Work Permit Pack', 'Templates', 'A PGWP filing-readiness pack covering graduation proof, transcript/letter organization, 180-day timeline control, status notes, and post-submission tracking.', 'Digital Canada PGWP preparation templates for graduation proof, transcript/letter organization, timing, and post-submission tracking.', 'Canada', 'Canada Work After Study', 25, 25, 'usd', 'USD', null::numeric, 'PGWP', 'active', true, 'Digital Template', 0, 'templates/canada/canada-pgwp-application-pack/README.md', 'study_abroad'),
  ('template', 'canada-family-information-travel-history-pack', 'Canada Family Information + Travel History Organizer', 'Templates', 'A simple organizer for IMM 5645-style family details, address history, employment history, travel history, and consistency checks across forms.', 'Digital Canada family information and travel-history organizer for consistent immigration form preparation.', 'Canada', 'Canada General', 12, 12, 'usd', 'USD', null::numeric, 'Low-cost add-on', 'active', true, 'Digital Template', 0, 'templates/canada/canada-family-information-travel-history-pack/README.md', 'study_abroad'),
  ('template', 'us-canada-refusal-reapplication-response-pack', 'USA/Canada Refusal Review + Reapplication Response Pack', 'Templates', 'A structured refusal-analysis kit for clients who need to map refusal reasons to new evidence, stronger explanations, and a cleaner reapplication file.', 'Digital refusal review and reapplication response templates for organizing refusal reasons, evidence gaps, and changed circumstances.', 'General', 'Refusal Recovery', 29, 29, 'usd', 'USD', null::numeric, 'Premium', 'active', true, 'Digital Template', 0, 'templates/general/us-canada-refusal-reapplication-response-pack/README.md', 'study_abroad'),
  ('template', 'universal-client-intake-document-review-kit', 'Universal Immigration Client Intake + Document Review Kit', 'Templates', 'A universal intake pack for collecting client goals, identity details, travel/education/work history, document uploads, and consultant review notes.', 'Digital universal intake and document-review templates for organizing immigration preparation notes and records.', 'General', 'General Intake', 15, 15, 'usd', 'USD', null::numeric, 'For consultations', 'active', true, 'Digital Template', 0, 'templates/general/universal-client-intake-document-review-kit/README.md', 'study_abroad'),
  ('template', 'premium-usa-canada-study-work-mega-bundle', 'Premium USA + Canada Study/Work Template Mega Bundle', 'Templates', 'A full bundle of the USA and Canada student, visitor, work-permit, proof-of-funds, interview, and refusal-response preparation packs.', 'Digital USA and Canada mega bundle with study, visitor, work-permit, proof-of-funds, interview, and refusal-response preparation templates.', 'General', 'Bundle', 79, 79, 'usd', 'USD', null::numeric, 'Highest value', 'active', true, 'Digital Template', 0, 'templates/bundles/premium-usa-canada-study-work-mega-bundle/README.md', 'study_abroad')
) as data(product_type, slug, title, category, short_description, full_description, region, template_type, price, usd_price, currency, currency_base, price_cad_display, badge, status, is_active, delivery_type, delivery_days, file_path, vertical)
where not exists (
  select 1 from services where services.product_type = 'template' and services.slug = data.slug
);

-- Stripe payment links generated from catalogue/stripe_payment_links_output.json.
update services
set stripe_product_id = data.stripe_product_id,
    stripe_price_id_usd = data.stripe_price_id_usd,
    stripe_payment_link_usd = data.stripe_payment_link_usd,
    stripe_payment_link_url = data.stripe_payment_link_usd,
    stripe_price_id_cad = data.stripe_price_id_cad,
    stripe_payment_link_cad = data.stripe_payment_link_cad
from (
  values
  ('us-f1-student-visa-ds160-i20-pack', 'prod_UV4GT29u8qYl7n', 'price_1TW47tFy6WULRNinqqVVQF6G', 'https://buy.stripe.com/00wfZh3G90iGaD18fygYU0m', null, null),
  ('us-f1-interview-home-ties-pack', 'prod_UV4Gmjgc6E3VrZ', 'price_1TW47vFy6WULRNin1ANajE8N', 'https://buy.stripe.com/28EcN5ekNghE26v7bugYU0n', null, null),
  ('us-b1b2-visitor-visa-ds160-invitation-pack', 'prod_UV4Gg7qANfUWPt', 'price_1TW47wFy6WULRNinRE6pSkk5', 'https://buy.stripe.com/7sY9ATa4xc1o7qPcvOgYU0o', null, null),
  ('us-opt-i765-application-prep-pack', 'prod_UV4GCJ14gXHeSr', 'price_1TW47yFy6WULRNinjqi74jSU', 'https://buy.stripe.com/6oU5kDekN1mK7qP53mgYU0p', null, null),
  ('us-stem-opt-i765-i983-companion-pack', 'prod_UV4GklSSSKoe2r', 'price_1TW47zFy6WULRNinsLmJfi7a', 'https://buy.stripe.com/bJe00ja4x8PcaD1fI0gYU0q', null, null),
  ('us-i134-financial-support-companion-pack', 'prod_UV4GQHHaYf9I5u', 'price_1TW481Fy6WULRNinqldCQJrf', 'https://buy.stripe.com/9B6bJ1gsV3uSbH5cvOgYU0r', null, null),
  ('canada-study-permit-complete-pack', 'prod_UV4GHeENd9Mn82', 'price_1TW482Fy6WULRNin2Qtlw7Dw', 'https://buy.stripe.com/5kQ7sL2C50iG9yXanGgYU0s', null, null),
  ('canada-proof-of-funds-sponsor-pack', 'prod_UV4Ga4LguThCYD', 'price_1TW484Fy6WULRNin8xIREJ1Y', 'https://buy.stripe.com/8x29AT90tghE12ranGgYU0t', null, null),
  ('canada-study-plan-letter-of-explanation-pack', 'prod_UV4GLQRwdNU0Pg', 'price_1TW486Fy6WULRNin3UdhmvWZ', 'https://buy.stripe.com/6oU00j6Sle9wdPdfI0gYU0u', null, null),
  ('canada-trv-visitor-visa-pack', 'prod_UV4GwkpQJkK2mx', 'price_1TW487Fy6WULRNin3vTPK4nJ', 'https://buy.stripe.com/fZu7sLgsVd5s3az7bugYU0v', null, null),
  ('canada-work-permit-outside-canada-pack', 'prod_UV4GhrM1fZT0cD', 'price_1TW489Fy6WULRNinft3qbx4n', 'https://buy.stripe.com/eVq3cv5Oh3uS6mLbrKgYU0w', null, null),
  ('canada-pgwp-application-pack', 'prod_UV4GWbWau7a8Qu', 'price_1TW48AFy6WULRNin8lLBP17H', 'https://buy.stripe.com/5kQ5kDdgJ5D0cL9cvOgYU0x', null, null),
  ('canada-family-information-travel-history-pack', 'prod_UV4G2h4nhve0fL', 'price_1TW48CFy6WULRNin1nJYIU7A', 'https://buy.stripe.com/28EcN5gsVc1o8uT53mgYU0y', null, null),
  ('us-canada-refusal-reapplication-response-pack', 'prod_UV4GI8Jl4kpqvk', 'price_1TW48DFy6WULRNinlbqxJW95', 'https://buy.stripe.com/28E4gz4Kdc1o4eDgM4gYU0z', null, null),
  ('universal-client-intake-document-review-kit', 'prod_UV4GGoX0lavQsv', 'price_1TW48FFy6WULRNinLPgKMbdg', 'https://buy.stripe.com/5kQ5kD0tX6H47qP0N6gYU0A', null, null),
  ('premium-usa-canada-study-work-mega-bundle', 'prod_UV4GpEiMNGy9Ta', 'price_1TW48GFy6WULRNinfmjFPWAl', 'https://buy.stripe.com/fZuaEX2C53uSfXl1RagYU0B', null, null)
) as data(slug, stripe_product_id, stripe_price_id_usd, stripe_payment_link_usd, stripe_price_id_cad, stripe_payment_link_cad)
where services.product_type = 'template'
  and services.slug = data.slug;
-- End generated Stripe payment links.
