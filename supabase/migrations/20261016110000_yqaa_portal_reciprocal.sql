-- Separate from conversation consent. Empty managed enrollment by construction.
-- No link/derived access RPC or runtime redemption capability exists.
begin;
create table public.q02_portal_deployments (
 site text primary key, tenant text not null, support_site text not null,
 clerk_issuer text not null, portal_party text not null,
 enabled boolean not null default false,
 check (site <> support_site), check (portal_party ~ '^https://[^/]+$'),
 unique(site,tenant)
);
create table public.q02_portal_memberships (
 site text not null, tenant text not null, subject text not null check(subject ~ '^user_[A-Za-z0-9_-]{1,123}$'),
 status text not null check(status in ('active','suspended','revoked')),
 enrollment_reference text not null check(length(enrollment_reference)>0),
 primary key(site,tenant,subject), foreign key(site,tenant) references public.q02_portal_deployments(site,tenant)
);
create table public.q02_portal_consents (
 site text not null, tenant text not null, subject text not null,
 epoch bigint not null default 0 check(epoch>=0), active boolean not null default false,
 consent_version text not null default 'portal-v7-1' check(consent_version='portal-v7-1'),
 scopes text[] not null default '{}' check(scopes='{}'::text[] or scopes=array['derived_summary','preferences']),
 changed_at timestamptz not null default clock_timestamp(),
 primary key(site,tenant,subject),
 foreign key(site,tenant,subject) references public.q02_portal_memberships(site,tenant,subject),
 check(not active or scopes=array['derived_summary','preferences'])
);
create table public.q02_portal_challenges (
 digest text primary key check(digest ~ '^[A-Za-z0-9_-]{43}$'),
 site text not null, tenant text not null, subject text not null,
 session_digest text not null check(session_digest ~ '^[A-Za-z0-9_-]{43}$'),
 epoch bigint not null, support_site text not null,
 consent_version text not null check(consent_version='portal-v7-1'),
 scopes text[] not null check(scopes=array['derived_summary','preferences']),
 purpose text not null check(purpose='account-memory-link-reciprocal'),
 expires_at timestamptz not null, state text not null default 'pending' check(state in ('pending','cancelled')),
 foreign key(site,tenant,subject) references public.q02_portal_consents(site,tenant,subject)
);
create table public.q02_portal_tombstones (
 site text not null, tenant text not null, subject text not null, epoch bigint not null,
 purpose text not null default 'account-memory-link-reciprocal',
 created_at timestamptz not null default clock_timestamp(),
 -- No delivery worker/ack authority in this candidate. Pending means deny.
 delivery_state text not null default 'pending' check(delivery_state='pending'),
 primary key(site,tenant,subject,epoch),
 foreign key(site,tenant,subject) references public.q02_portal_consents(site,tenant,subject)
);
alter table public.q02_portal_deployments enable row level security;
alter table public.q02_portal_memberships enable row level security;
alter table public.q02_portal_consents enable row level security;
alter table public.q02_portal_challenges enable row level security;
alter table public.q02_portal_tombstones enable row level security;
revoke all on public.q02_portal_deployments, public.q02_portal_memberships, public.q02_portal_consents, public.q02_portal_challenges, public.q02_portal_tombstones from public, anon, authenticated, service_role;

-- Lock order: deployment SHARE -> membership SHARE -> consent UPDATE.
-- Managed enrollment administrators must use the same order, never delete or
-- reassign registry rows. Retain suspended/revoked enrollment for withdrawal.
create function public.q02_portal_transition(
 p_site text, p_tenant text, p_subject text, p_issuer text, p_party text,
 p_action text, p_expected_epoch bigint default null, p_opt_in boolean default false,
 p_version text default null, p_scopes text[] default null,
 p_digest text default null, p_session_digest text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare d public.q02_portal_deployments; m public.q02_portal_memberships; c public.q02_portal_consents; n integer;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
   raise exception 'Service only' using errcode='42501'; end if;
 if p_action is null or p_action not in ('review','grant','withdraw','challenge','cancel') then
   raise exception 'Redemption disabled' using errcode='42501'; end if;
 select * into d from public.q02_portal_deployments where site=p_site and tenant=p_tenant for share;
 if not found or d.clerk_issuer is distinct from p_issuer or d.portal_party is distinct from p_party then
   raise exception 'Unknown deployment' using errcode='42501'; end if;
 select * into m from public.q02_portal_memberships where site=p_site and tenant=p_tenant and subject=p_subject for share;
 if not found then raise exception 'Unknown membership' using errcode='42501'; end if;
 if p_action in ('grant','challenge') and (not d.enabled or m.status<>'active') then
   raise exception 'Issuance unavailable' using errcode='42501'; end if;
 insert into public.q02_portal_consents(site,tenant,subject) values(p_site,p_tenant,p_subject) on conflict do nothing;
 select * into c from public.q02_portal_consents where site=p_site and tenant=p_tenant and subject=p_subject for update;
 if p_action <> 'review' then
   if p_expected_epoch is null or p_expected_epoch <> c.epoch then raise exception 'Stale epoch' using errcode='40001'; end if;
   if p_action='grant' then
     if p_opt_in is distinct from true or p_version is distinct from 'portal-v7-1' or p_scopes is distinct from array['derived_summary','preferences'] then raise exception 'Explicit versioned consent required' using errcode='22023'; end if;
     update public.q02_portal_consents set active=true,epoch=epoch+1,scopes=p_scopes,changed_at=clock_timestamp() where site=p_site and tenant=p_tenant and subject=p_subject returning * into c;
     update public.q02_portal_challenges set state='cancelled' where site=p_site and tenant=p_tenant and subject=p_subject;
   elsif p_action='withdraw' then
     update public.q02_portal_consents set active=false,epoch=epoch+1,scopes='{}',changed_at=clock_timestamp() where site=p_site and tenant=p_tenant and subject=p_subject returning * into c;
     update public.q02_portal_challenges set state='cancelled' where site=p_site and tenant=p_tenant and subject=p_subject;
     insert into public.q02_portal_tombstones(site,tenant,subject,epoch) values(p_site,p_tenant,p_subject,c.epoch);
   elsif p_action='challenge' then
     if not c.active or c.scopes is distinct from array['derived_summary','preferences'] or p_digest is null or p_session_digest is null then raise exception 'Active consent required' using errcode='42501'; end if;
     insert into public.q02_portal_challenges(digest,site,tenant,subject,session_digest,epoch,support_site,consent_version,scopes,purpose,expires_at)
     values(p_digest,p_site,p_tenant,p_subject,p_session_digest,c.epoch,d.support_site,c.consent_version,c.scopes,'account-memory-link-reciprocal',clock_timestamp()+interval '120 seconds');
   elsif p_action='cancel' then
     update public.q02_portal_challenges set state='cancelled' where digest=p_digest and site=p_site and tenant=p_tenant and subject=p_subject and session_digest=p_session_digest and epoch=c.epoch and state='pending';
     get diagnostics n = row_count;
     if n<>1 then raise exception 'Challenge unavailable' using errcode='42501'; end if;
   end if;
 end if;
 return jsonb_build_object('epoch',c.epoch,'active',c.active,'version',c.consent_version,'scopes',c.scopes,'enrollmentActive',m.status='active' and d.enabled,'redemption','DENIED');
end $$;
revoke all on function public.q02_portal_transition(text,text,text,text,text,text,bigint,boolean,text,text[],text,text) from public,anon,authenticated;
grant execute on function public.q02_portal_transition(text,text,text,text,text,text,bigint,boolean,text,text[],text,text) to service_role;
comment on function public.q02_portal_transition(text,text,text,text,text,text,bigint,boolean,text,text[],text,text) is 'Service verified immutable Clerk subject only; never profile/email/visitor identity. Consumption disabled.';
commit;
