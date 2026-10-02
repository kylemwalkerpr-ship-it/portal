-- Intake risk rule: the short provider application (PR #344) no longer asks
-- for a register / profile link or practice areas. Practice areas are
-- collected after approval in the attorney profile wizard (written to
-- public.attorneys, never back to the application), and the link is optional.
--
-- Before: an empty '' profile_url failed the '^https?://' test and was
-- flagged "suspicious_profile_url" (+5), and an empty practice_areas was
-- flagged "missing_practice_areas" (+10), so every short-form attorney
-- started at 15 risk points for fields we deliberately stopped asking for.
--
-- After:
--   * blank / whitespace profile_url = "not provided" (no flag); a non-blank
--     value that is not http(s) is still "suspicious_profile_url".
--   * practice areas are not scored at application time (the application
--     row never receives them).
-- All other rules, weights and the 100 cap are unchanged. No data is
-- rewritten: no existing application carries either flag today.

create or replace function public.compute_attorney_application_risk(app_id uuid)
 returns void
 language plpgsql
as $function$
declare
  v record;
  flags jsonb := '[]'::jsonb;
  score numeric(5,2) := 0;
begin
  select * into v from public.attorney_applications where id = app_id;
  if not found then return; end if;

  if v.bar_number is null or length(trim(v.bar_number)) = 0 then
    flags := flags || '"no_bar_number"'::jsonb;  score := score + 30;
  end if;

  if v.malpractice_insurance is null or length(trim(v.malpractice_insurance)) = 0 then
    flags := flags || '"no_insurance"'::jsonb;   score := score + 20;
  end if;

  if v.email ~* '@(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail|zoho)\.' then
    flags := flags || '"free_email"'::jsonb;     score := score + 10;
  end if;

  if v.jurisdictions is null or length(trim(v.jurisdictions)) = 0 then
    flags := flags || '"missing_jurisdictions"'::jsonb; score := score + 15;
  end if;

  -- Practice areas: collected after approval (profile wizard), not scored here.

  if v.profile_url is not null and length(trim(v.profile_url)) > 0 and v.profile_url !~* '^https?://' then
    flags := flags || '"suspicious_profile_url"'::jsonb; score := score + 5;
  end if;

  update public.attorney_applications
     set risk_flags = flags,
         risk_score = least(score, 100)
   where id = app_id;
end $function$;

create or replace function public.compute_consultant_application_risk(app_id uuid)
 returns void
 language plpgsql
as $function$
declare
  v record;
  flags jsonb := '[]'::jsonb;
  score numeric(5,2) := 0;
begin
  select * into v from public.consultant_applications where id = app_id;
  if not found then return; end if;

  if v.registration_number is null or length(trim(v.registration_number)) = 0 then
    flags := flags || '"no_registration_number"'::jsonb;  score := score + 25;
  end if;

  if v.malpractice_insurance is null or length(trim(v.malpractice_insurance)) = 0 then
    flags := flags || '"no_insurance"'::jsonb;            score := score + 15;
  end if;

  if v.email ~* '@(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail|zoho)\.' then
    flags := flags || '"free_email"'::jsonb;              score := score + 10;
  end if;

  if v.jurisdictions is null or length(trim(v.jurisdictions)) = 0 then
    flags := flags || '"missing_jurisdictions"'::jsonb;   score := score + 15;
  end if;

  if v.specialties is null or array_length(v.specialties, 1) is null then
    flags := flags || '"missing_specialties"'::jsonb;     score := score + 10;
  end if;

  if v.profile_url is not null and length(trim(v.profile_url)) > 0 and v.profile_url !~* '^https?://' then
    flags := flags || '"suspicious_profile_url"'::jsonb;  score := score + 5;
  end if;

  update public.consultant_applications
     set risk_flags = flags,
         risk_score = least(score, 100)
   where id = app_id;
end $function$;
