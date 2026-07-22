# DEEPSEEK BRIEF — AU de-Canadianize (FINISHING PASS)

> **Repo: `yousafe-consultancy`**, app **`au/`**. Most of this is already done by you (commits `f199bbb`, `d490164`). This is the short finishing pass for the last stragglers, plus a deploy note.

## Status (confirmed by Claude against committed `main`)
✅ **Done (your work):**
- `f199bbb` — Canadian terminology fixed across AU pages (Study Permit→Student Visa, PGWP→Temporary Graduate, SIN→TFN, Interac→PayID, HST→GST).
- `d490164` — 5 broken AU resources links fixed + 2 studyinaustralia URLs updated.
- **0 `canada.ca` / IRCC links remain** in committed `au/`. The resources page is AU-correct in source.

⚠️ **Remaining — 2 straggler lines only:**
1. `au/app/terms-of-service/page.tsx:37` — still reads "**post-graduation work permit** (Temporary Graduate visa) document checklists". On an AU site this should lead with the Australian term. Change to "**Temporary Graduate visa (subclass 485)** document checklists".
2. `au/public/llms.txt:25` — still reads "...student visas, and **post-graduation work permits**." (describing the AU site's guides). Change "post-graduation work permits" → "**Temporary Graduate visa (subclass 485)**".

## Role & chain of authority — IMPORTANT
- **You (DeepSeek) are the implementor. Claude reviews and merges.** For this and all future work: **open a PR and STOP — do NOT commit directly to `main`.** (The terminology/links work above landed straight on `main` without review; from here, PR-and-stop.)
- Branch `seo-au-decanadianize-finish` off latest `main`, one PR, paste validation, STOP.

## Do NOT touch (these are correct as-is)
- `au/public/llms.txt` lines 3 / 15 / 16 / 50 — these are the **cross-estate listing** that legitimately points to and describes the **Canada sibling site** (`ca.yousafeconsultancy.com`). "PGWP…in Canada" is correct *because it is describing Canada*. Leave them.
- All the already-fixed AU pages and resources links.
- Any other app (usa/uk/ca/landing/portal) or caseworks.

## Validation gate (paste into the PR)
1. `git grep -inE "study permit|\bpgwp\b|post-graduation work permit|express entry|\bCRS\b|comprehensive ranking|provincial nominee|canadian experience|\bIRCC\b|canada\.ca|cic\.gc" au/app au/components au/lib au/public` → **no matches** except the cross-estate Canada-sibling lines in `llms.txt` (3/15/16/50), which you must list as intentionally kept.
2. Build the `au` app; confirm it compiles and the two edited files render the Australian terms.
3. List the 2 lines changed (old → new). Confirm no slug/canonical/routing change.

## Branch / PR
- Branch `seo-au-decanadianize-finish`. PR title `fix(au): finish de-Canadianizing terminology (terms-of-service + llms.txt)`. Then **STOP**.

---

## ⚠️ Separate from this PR — the LIVE site is STALE (deploy/cache, not code)
`https://au.yousafeconsultancy.com/resources/` **still serves the old Canadian page** ("CRS Score Calculator", a `canada.ca` link) even though committed `main` is already AU-correct (your `d490164`/`f199bbb`). This is a **deploy/CDN-cache issue, not a code issue** — the AU app needs to rebuild/redeploy from current `main`, and the Cloudflare cache for `/resources/` likely needs purging. **This is for Claude/ops to action — you (DeepSeek) cannot deploy.** Note it in the PR; do not attempt a deploy or cache change.

## Definition of done
The 2 straggler lines fixed (Australian terminology); `git grep` clean except the intentional cross-estate Canada-sibling `llms.txt` lines; au app builds; no slug/canonical/routing change; one PR off `seo-au-decanadianize-finish`; you stopped. (Stale-live-deploy handled separately by Claude/ops.)
