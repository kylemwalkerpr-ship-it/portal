# DEEPSEEK IMPLEMENTATION BRIEF — US Thin-Content Expansion, Batch A (severe tier)

> Governed by `docs/seo-briefs/SEO_MASTER_PLAN.md`. This is **Track A1, Batch A**. Read §I.1–I.7 of the master for the standing rules; the critical ones are restated below.

## Role & chain of authority — READ FIRST, NON-NEGOTIABLE
- **You (DeepSeek) are the implementor.** Execute this brief exactly.
- **Claude Code reviews and merges.** You do **NOT** self-merge, push to `main`, or deploy.
- Branch in a worktree, open **one** PR, paste your validation output into the PR body, then **STOP**.
- Ambiguity → choose the most conservative, most additive option and flag it in the PR.

---

## Mission
Twelve US legal/immigration canonical pages are severe-tier thin (250–271 visible words). Expand each to a genuine **≥1,500-word** (≤2,800-word) canonical guide, page-specific and honest, with no change to any existing SEO signal. This is the worst-offender tier of the 80 thin US pages; it goes first.

---

## §0 — THE CONTRACT (hard fails — these are why prior batches were rejected)

**§0.1 Anti-templating (THE recurring failure — CA Batch 1 and GEO PR #2 both failed here).**
- Every page's content is **page-specific**. **No sentence — and no ≥8-word phrase — may appear on more than one of these pages, or be shared with any other article on the site.**
- **No template with a fixed tail** (e.g. "…the page identifies the main rule, evidence to prepare, timing risks, and common mistakes…"). No reused "intro/sequence/checklist" boilerplate swapping only the topic name.
- You will **prove** zero cross-page duplication in validation (§7). A shared sentence/n-gram across ≥2 of these pages = automatic rejection.

**§0.2 SEO idempotency (additive only).** For every page, byte-identical before vs after: `title`, meta description, canonical (`alternates.canonical`), `robots` index/follow, H1/`headline`, slug. You are adding body content only. Prove with `scripts/seo-invariants.mjs` (empty diff). Do not touch the sitemap inclusion contract.

**§0.3 Honesty.** No fabricated statistics, approval rates, processing times, or fees unless taken verbatim from a §4 allowlisted gov source. Reviewer stays `{ name: 'MyCaseworks Editorial', credential: 'Editorial review only' }` — no invented attorney/credential/bar number. No `Review`/`AggregateRating`/`Event` schema. No `[VERIFY]` markers left in prose.

**§0.4 Restore-hook.** None of these 12 pages is archive-covered, so no `.b64` edit is needed — **but confirm it**: `npm run build` must print `[restore-seo-batch-01] Done. 0 file(s) written`. Never use `SKIP_SEO_RESTORE=1`.

**§0.5 No scaffolding/prompt-leak** phrases in any prose (the `check-content-quality.mjs` blacklist applies).

---

## §1 — Exact scope: these 12 files ONLY (+ `lib/article-index.ts` for sources)

| # | File (`app/...`) | Now (words) | Topic |
|---|---|---|---|
| 1 | `us/f1-h1b-cap-gap/page.tsx` | 260 | F-1 → H-1B cap-gap work authorization |
| 2 | `us/eb1a-self-petition/page.tsx` | 268 | EB-1A extraordinary ability self-petition |
| 3 | `us/e2-investor-visa/page.tsx` | 269 | E-2 treaty investor visa |
| 4 | `us/o1a-extraordinary-ability/page.tsx` | 270 | O-1A extraordinary ability |
| 5 | `us/asylum-i589/page.tsx` | 271 | Asylum / Form I-589 |
| 6 | `us/tps-renewals-2026/page.tsx` | 271 | Temporary Protected Status renewals |
| 7 | `us/n400-interview-questions/page.tsx` | 265 | N-400 naturalization interview |
| 8 | `us/1040nr-tax-filing/page.tsx` | 269 | Form 1040-NR nonresident tax filing |
| 9 | `us/itin-application/page.tsx` | 269 | ITIN application |
| 10 | `us/health-insurance-requirements/page.tsx` | 260 | Health insurance for international students |
| 11 | `us/credit-history-building/page.tsx` | 250 | Building US credit history |
| 12 | `us/drivers-license-by-state/page.tsx` | 254 | US driver's license by state |

**Out of scope — do NOT touch (they are hubs/FAQ/templates, not canonicals; they should stay short):** `us/forms/page.tsx`, `us/forms/[form]/page.tsx`, `us/student-visas/faq/page.tsx`, `us/family-visas/faq/page.tsx`, `us/work-visas/faq/page.tsx`, and any other `/faq` or hub page. Edit only the 12 listed files + `lib/article-index.ts`. Any other edited file = PR rejected.

---

## §2 — Content depth & structure (per page)
Each page must reach **≥1,500 words of genuine body prose** (≤2,800). Match the page's existing layout component and JSX style (audit it first; do not swap components). Real apostrophes/em-dashes — never literal `\n` or mojibake.

**Required elements on every page (master §I.5):**
1. A one-sentence direct answer at the top (reuse/normalize the existing lede; do not stack two summaries).
2. Who this is for / not for.
3. The next decision the reader must make.
4. The controlling source (USCIS / IRS / DHS / state DMV — see §4) named with a live link.
5. A specific document/form checklist (real form numbers, evidence).
6. The deadline or risk trigger (what stops the case).
7. A realistic worked example.
8. A "when to get a paid review" CTA (reuse the existing CTAPanel — do not invent prices).

Use real H2/H3 structure, bulleted/numbered lists, and a 4–6 item FAQ where natural. Content must be specific to *that* program (real eligibility gates, real forms, real timelines, real refusal/denial reasons) — a paralegal should find nothing padded or generic.

---

## §4 — Sources (per-page gov allowlist — do NOT deviate)
Procedure: (a) check `lib/article-index.ts` for an existing source block for the path and **keep it verbatim**; (b) if missing, add one using **only** the first-party government URLs below; (c) **never** invent/guess a URL or cite a third party (no law-firm blogs, Wikipedia, news); (d) verify each href is **HTTP 200 on a first-party gov domain** before committing — if one 404s, fall back to the parent gov section and note it in the PR.

1. **f1-h1b-cap-gap** — `https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupations-and-fashion-models` ; `https://www.ice.gov/sevis`
2. **eb1a-self-petition** — `https://www.uscis.gov/working-in-the-united-states/permanent-workers/employment-based-immigration-first-preference-eb-1`
3. **e2-investor-visa** — `https://www.uscis.gov/working-in-the-united-states/temporary-workers/e-2-treaty-investors` ; `https://travel.state.gov/content/travel/en/us-visas/employment/treaty-trader-investor-visa-e.html`
4. **o1a-extraordinary-ability** — `https://www.uscis.gov/working-in-the-united-states/temporary-workers/o-1-visa-individuals-with-extraordinary-ability-or-achievement`
5. **asylum-i589** — `https://www.uscis.gov/i-589` ; `https://www.uscis.gov/humanitarian/refugees-and-asylum/asylum`
6. **tps-renewals-2026** — `https://www.uscis.gov/humanitarian/temporary-protected-status`
7. **n400-interview-questions** — `https://www.uscis.gov/n-400` ; `https://www.uscis.gov/citizenship/find-study-materials-and-resources/study-for-the-test`
8. **1040nr-tax-filing** — `https://www.irs.gov/forms-pubs/about-form-1040-nr` ; `https://www.irs.gov/publications/p519`
9. **itin-application** — `https://www.irs.gov/individuals/individual-taxpayer-identification-number`
10. **health-insurance-requirements** — `https://studyinthestates.dhs.gov/` ; `https://www.healthcare.gov/immigrants/coverage/`
11. **credit-history-building** — `https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/`
12. **drivers-license-by-state** — `https://www.usa.gov/motor-vehicle-services` ; `https://www.dhs.gov/real-id`

Sources must render on-page AND be present in the `Article.citation` graph (this is how `getOfficialSources` already works — verify, don't break).

---

## §5 — Internal links (master §I.7)
Each page links to: 2–4 sibling US cluster pages (real existing `/us/...` routes — grep `app/us` to confirm), 1 service/checkout/intake conversion page, and the official-source box (§4). Use descriptive anchor text (the destination's topic) — never "click here / read more / learn more". Do not link to non-existent routes.

---

## §6 — Anti-AI-copy (master §I.5 banned phrases — instant rewrite if present)
Forbidden: "Navigating immigration can be overwhelming…", "Comprehensive guide to everything you need to know", "Get approved / guaranteed / fast PR / high success rate", "Land of opportunity / your dreams abroad", and the boilerplate "documents, deadlines, official sources, common pitfalls, FAQs". Natural, factual, second-person; no marketing voice.

---

## §7 — Validation gate (run from repo root; paste raw output into the PR)
1. `node scripts/seo-invariants.mjs` — **empty diff** (no title/description/canonical/robots/H1/slug/sitemap-URL change).
2. `npm run build` — clean, and prebuild prints **`[restore-seo-batch-01] Done. 0 file(s) written`**.
3. `node scripts/seo-audit-guard.mjs` — **7/7 PASS**.
4. `node scripts/check-content-quality.mjs` — **none of the 12 target paths still appear** in the low-word-count list (all ≥1,500).
5. **Anti-templating proof** — paste a cross-page analysis of the 12 expanded pages showing **0 sentences and 0 ≥8-word n-grams shared across any 2 of them**, and none shared with other site articles.
6. `node scripts/check-metadata-uniqueness.mjs` — 0 duplicate titles/H1s/keywords (titles unchanged from baseline).
7. `git grep -nE '\\n|â€|â€™|\[VERIFY\]' app/us` → no matches in your edited files.
8. List the §4 source URLs added (and any 404 fallbacks). Confirm none of the 12 are archive-covered.

---

## §8 — Scope boundaries (do NOT)
- Change any existing title, description, canonical, slug, robots status, or H1.
- Touch any file outside the 12 listed + `lib/article-index.ts`.
- Expand or alter the out-of-scope hub/FAQ/template pages.
- Add `Review`/`AggregateRating`/`Event`/fake-`Product`/`LegalService` schema, fabricated stats, prices, or credentials.
- Share any sentence/phrase across pages, or use a templated structure.
- Author content with `SKIP_SEO_RESTORE=1` or leave the restore hook non-zero.

---

## §9 — Branch, commit, PR protocol
- Branch: `seo-us-thin-expansion-batch-a` off latest `main`.
- Tidy commits; delete any temporary/scratch scripts before committing (no stray scratch/encoded files).
- One PR titled `seo: expand 12 US severe-tier thin canonicals to depth (US Batch A)`. Body must include: per-file before/after word counts, the §7 validation output (especially the **empty invariants diff**, the **`0 file(s) written`** line, and the **cross-page anti-templating proof**), the source URLs added, and any ambiguity flags.
- Then **STOP** and wait for review.

---

## Definition of done
12 US severe-tier canonicals expanded to ≥1,500 genuine words each, **page-specific with zero cross-page shared sentences/n-grams**; the 8 required elements present; real per-page gov sources rendered + in `Article.citation`; 2–4 sibling links + conversion + source box each; honest editorial-only reviewer; no banned phrases; build green with restore hook `0 file(s) written`; SEO-invariants diff empty; 7/7 guard; none of the 12 still flagged thin; one PR off `seo-us-thin-expansion-batch-a`; you stopped.
