-- =============================================================================
-- translations_cache.sql
--
-- Server-side translation cache. Every page render checks here first before
-- making an outbound translation API call, so each unique string is
-- translated exactly once per (source, target) pair, forever.
--
-- Keyed on a sha256 of the source text + target language so we don't blow
-- up the primary key with multi-paragraph strings. The source text is also
-- stored verbatim for debugging and re-translation.
-- =============================================================================

create table if not exists public.translations (
  text_hash      text not null,
  target_lang    text not null,
  source_lang    text not null default 'en',
  source_text    text not null,
  translated     text not null,
  provider       text not null default 'mymemory',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (text_hash, target_lang)
);

create index if not exists translations_target_idx on public.translations (target_lang, updated_at desc);
create index if not exists translations_provider_idx on public.translations (provider);

notify pgrst, 'reload schema';
