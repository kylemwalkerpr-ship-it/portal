-- Purge poisoned translation cache rows.
--
-- Before the chunking fix (lib/serverTranslate.ts), callMyMemory() truncated
-- every query to 500 chars. Long source paragraphs (FAQ answers, resource
-- articles) were cached with the FULL text's hash but a translation of only
-- the FIRST ~500 characters. Those rows keep serving cut-off translations
-- forever, even after the fix — they must be removed so the chunked
-- translator can repopulate them correctly.
--
-- Run once after deploying the chunking fix.

delete from public.translations
 where length(source_text) > 450;
