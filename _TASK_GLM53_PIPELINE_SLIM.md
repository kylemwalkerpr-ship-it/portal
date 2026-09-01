# GLM 5.3 attempt 2 — four-stage ship-gate close (KEEP CONTEXT SMALL)

Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal`.
Do NOT commit/push/deploy. Do NOT print secrets.
Do NOT touch `app/marketplace/**`, `app/shop/**`, `components/marketplace/**`, `contexts/palette-context.tsx`.

**Context rule:** Never read a whole file over 200 lines. Use grep + offset/limit. Never cat `editorialScaffold.ts` or `contentQualityGate.ts` in full. If a model call might exceed ~80k tokens, stop reading and edit from grep hits.

Live ship still shows:
- `TLDR_FORMAT_INVALID` — In 60 seconds must contain 3–5 separate bullet lines
- `AHREFS_META_TOO_LONG` — Meta description is 161 chars (max 160)
- `UNVERIFIED_INTERNAL_LINK` (many)
- `SCHEMA_FAQ` — Missing FAQPage JSON-LD
- `META_DESCRIPTION` length 161

Do not weaken gates. Deterministic repair after every model write must clear those codes.

## Edits

1. `lib/seoFactory/ahrefsIssues.ts` — `clampMetaToAhrefs`: loop until `s.length <= 160` (hard slice(0,160) if word-trim leaves 161). Export `metaDescriptionLength` = `String(s||'').trim().length`. Gate and clamp MUST use it.

2. `lib/seoFactory/editorialScaffold.ts` — add `ensureTldrBullets` (export): `## In 60 seconds` body becomes 3–5 lines matching `/^[-*+]\s+\S/gm`. Handle paragraph, `1. 2. 3.`, `a - b - c`, indented bullets. Call it from `applyDeterministicRepairs`. After repairs, also: inject FAQPage JSON-LD from `###` FAQ (create 4 FAQ `###` from H2s if missing); demote unverified internal markdown links (not in estate allowlist) to plain text or `ESTATE_ANCHOR_LINKS`.

3. `lib/seoFactory/contentQualityGate.ts` / `audit.ts` — meta length via `metaDescriptionLength`. Keep tldr regex.

4. `app/api/content-studio/reaudit/route.ts` — after every `callAiFix` result, run `applyDeterministicRepairs` then `evaluateContentQuality`. If tldr or meta-too-long remain, run repairs again (max 2), **do not** fire another 16k LLM call for those two codes.

5. Catalog: add Run BiOS slot `runbios-glm-53` apiModel `glm-5.3`. `DEFAULT_BRIEF_PIN` + `DEFAULT_REVIEW_PIN` = `runbios-glm-53`. Draft may stay MiniMax. No top-level `thinking` on Run BiOS.

## Tests

New `tests/pipeline-four-stage-close.test.ts`: fixture with paragraph TL;DR, 161-char meta, FAQ headings no JSON-LD, 5 fake `/us/fake-*` links. After `applyDeterministicRepairs`, `evaluateContentQuality` has **zero** of: tldr_format_invalid, ahrefs_meta_too_long, unverified_internal_link; body or fm contains `"@type":"FAQPage"`. Also 161→≤160 in ahrefs test.

```
npx tsc --noEmit
npx jest tests/pipeline-four-stage-close.test.ts tests/ahrefs-issues.test.ts --no-coverage
```

Report: FILES / TESTS / RESULTS / KNOWN ISSUES only.
