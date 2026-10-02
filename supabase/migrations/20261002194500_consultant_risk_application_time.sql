-- Consultant risk score at application time.
--
-- The short consultant application doesn't require a credential (body and
-- number are optional and validated only when filled), and it never asks for
-- malpractice insurance or jurisdictions. Scoring their absence flagged every
-- consultant (+55), so drop at application time:
--   no_registration_number (25), no_insurance (15), missing_jurisdictions (15).
-- Kept: free_email 10, missing_specialties 10, and suspicious_profile_url 5,
-- which checks the credential verification URL (stored as profile_url)
-- whenever one is provided. Cap 100.
-- Credential validation when one is provided stays in the application
-- validator (lib/provider/application.ts): listed body, number >= 2 chars,
-- https URL.
-- Existing rows are not rescored (the only consultant application is
-- already decided).

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

  if v.email ~* '@(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail|zoho)\.' then
    flags := flags || '"free_email"'::jsonb;              score := score + 10;
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
