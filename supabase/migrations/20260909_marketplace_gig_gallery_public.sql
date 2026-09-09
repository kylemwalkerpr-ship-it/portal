-- Marketplace gig cover images are intentionally public product media.
--
-- The original Fiverr-system bootstrap created gig-gallery as private while
-- every gallery writer persisted getPublicUrl() URLs. That combination lets
-- uploads succeed but makes Marketplace <img> requests fail. Keep chat and
-- offer attachments private; only the Marketplace gallery is public.

insert into storage.buckets (id, name, public)
values ('gig-gallery', 'gig-gallery', true)
on conflict (id) do update
set public = true;
