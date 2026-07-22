# YouSafe / MyCaseworks — SEO MASTER PLAN
**Single source of truth.** Created 2026-06-10 by Claude Code (reviewer), consolidating the three multirepo sweeps (Claude, DeepSeek, GPT/Codex), all implementation briefs, and the Q3 strategy + topical-authority briefs. Supersedes and replaces every other file previously in this directory. **All standing instructions from those files are preserved verbatim below.**

Estate: `caseworks` (legal.yousafeconsultancy.com) · `yousafe-consultancy` (yousafeconsultancy.com + usa/uk/ca/au/checkout sub-apps) · `yousafe-portal` (portal. + market.) · `yousafe-saas` (support., internal).

---

# PART I — GOVERNANCE & STANDING RULES (non-negotiable; apply to every PR)

## I.0 Chain of authority
- Implementor (DeepSeek / GPT-5.5 / Kimi) executes a brief exactly; opens **one** PR; **stops**; never self-merges, never pushes to `main`, never deploys.
- Claude Code reviews and merges. User relays between Claude and the implementors.
- Deploy is via GitHub CI on merge to `main`. Never run `wrangler` locally.

## I.1 Idempotency + honesty contract (hard fails)
- **SEO-signal idempotency:** for every existing page, these stay byte-identical unless the task is explicitly to change them — `title`, meta description, canonical, robots index/follow, H1/headline, slug, sitemap-URL set, and any pre-existing JSON-LD. Additive only. Prove with `scripts/seo-invariants.mjs` (empty before/after diff).
- **Honesty — NEVER emit:** `Review`, `AggregateRating`, star ratings, `Event`, fake `Product` prices, `LocalBusiness`/`LegalService` with an invented address, or invented author credentials/bar numbers. Reviewer stays `MyCaseworks Editorial` / editorial-only. Only emit schema whose every field is true and visible on the page.
- **No scaffolding/prompt-leak** phrases in any prose (the `check-content-quality.mjs` blacklist applies).

## I.2 Anti-templating rule (the recurring failure mode — CA Batch 1 and GEO PR #2 both failed on this)
- Page content and answer blocks must be **page-specific**. **No sentence may be shared across pages.** No fill-in-the-blank template with a fixed tail. Reuse each page's own authored lede/Tldr/description; never a constructed boilerplate sentence.
- Every content batch must prove **0 sentences / 0 ≥8-word n-grams shared across ≥3 pages** before merge (`check-geo.mjs` near-dup check + manual cross-page dedup).

## I.3 Restore-hook discipline (caseworks `seo-batch-01`)
- `prebuild` runs `scripts/restore-seo-batch-01.mjs`, which overwrites ~21 archive-covered pages from `content/seo-batch-01-parts/*.b64` on every build. Editing a covered page without updating its `.b64` entry **silently reverts on deploy.**
- Any edit to a covered page MUST update its `.b64` entry; `npm run build` MUST print `[restore-seo-batch-01] Done. 0 file(s) written`. Never use `SKIP_SEO_RESTORE=1`. Prefer layout/route-level injection over editing covered page bodies.

## I.4 Technical guardrails (from Q3 §5 — "SEMrush issues, DO NOT REPEAT")
- **Canonicalization (4-fact test):** never index a page that canonicalizes elsewhere unless it has **≥4 distinct local facts**. Fail the test → `rel=canonical` to the pillar + remove from sitemap. Canonicals must be reversible if facts are later added.
- **Hreflang — HARD BAN by default:** do NOT add hreflang until per-locale pre-rendered URL routes exist (e.g. `/es/us/…`). Client-side/`?lang=` translation must stay noindex or self-canonical. **Refinement (GPT/Codex):** when locale routes do exist, hreflang only connects *equivalent* pages with matching intent (homepage/contact/FAQ/service equivalents only; legal articles are NOT equivalent to regional marketing pages); add `x-default` only after an explicit equivalence map.
- **Content-length gates:**
  | Layer | Min | Max | If too short |
  |---|---|---|---|
  | Legal canonical | 1,500w | 2,800w | expand checklists, worked examples, FAQ |
  | Blog summary | 700w | 1,200w | merge into canonical if it exceeds max or steals intent |
  | Hub / guide | 300w | 700w | mostly links + short intro; no long-form duplicate |
  | Template (with template text) | 700w | 900w | link back to relevant free guide; template text in <pre> blocks alone consumes ~300–500w — 600w is unachievable without removing the product |
  | Hub / directory (product listing) | 200w | 600w | link back to relevant procedure guides |
- **Duplicate-intent prevention:** one page = one search intent. Merge/301/canonicalize the weaker of two pages on the same primary keyword. Blog summaries rank only for "what is / how to choose / vs" intent — never procedural ("checklist/documents/form numbers"). Search the ecosystem sitemap before creating any page; enrich the existing one if it exists.
- **Noindex rules:** `index:false` for auth, dashboard, checkout, redirect sources, canonicalized pages, and pages with unresolved `[VERIFY OFFICIAL SOURCE BEFORE PUBLISHING]`. Every `index:false` page is removed from the sitemap.
- **Redirect hygiene:** 301 only (no 302/307/308 for permanent moves). Extract unique facts from source into destination before redirecting; log in `REVIEW-NOTES.md`. Remove redirect sources from sitemap immediately. *(Caseworks note: `_redirects` must use trailing-slash sources to match `trailingSlash:true` URLs — see Part V.)*
- **Freshness:** update `dateModified` on material change; reference explicit policy dates ("as of May 2026"); avoid "recently"/"last year".
- **Schema per new page:** `Article` (headline, author, publisher, datePublished, dateModified, citation) + `BreadcrumbList` + `FAQPage` (if ≥3 FAQs) + sitewide `Organization`. **CORRECTION to Q3 §5.8:** root Organization is `@type: Organization`, **NOT `LegalService`** — `LegalService`/`LocalBusiness` require a full PostalAddress and failed validators on 739 caseworks pages; they are removed estate-wide.

## I.5 Content quality / anti-AI-copy (Q3 §6)
- **Banned phrases (instant rewrite):** "Navigating immigration can be overwhelming…", "Comprehensive guide to everything you need to know", "Get approved/guaranteed/fast PR/high success rate", "Land of opportunity/your dreams abroad", and the repeated boilerplate "documents, deadlines, official sources, common pitfalls, FAQs".
- **Required on every legal canonical:** (1) one-sentence answer at top, (2) who this is for / not for, (3) the next decision, (4) controlling source (USCIS/IRCC/GOV.UK…) with live link, (5) specific document checklist, (6) deadline/risk trigger, (7) worked example, (8) "when to get a paid review" CTA.
- **Anchor text:** name the destination topic; never "click here / read more / learn more / this page".

## I.6 E-E-A-T / YMYL layer (from topical-authority brief v2 §4)
- Author entity required: real author/reviewer with a bio page and `Person` schema; editorial-only sign-off is honest (`MyCaseworks Editorial`) — no fabricated counsel review or credentials.
- Page-level trust signals on every article: author/reviewer, dateModified, controlling-source citations rendered AND in `Article.citation`.
- Citation/source-anchoring: claims link to first-party government sources only (no third-party/law-firm blogs); sources are page-specific and verified live (200, first-party gov domain).

## I.7 Internal linking protocol (Q3 §7)
- Every new page links to: parent pillar (if child) + 2–4 sibling cluster pages + 1 service/checkout page + 1 official-source box.
- Pillars link to: all major child spokes + cross-country comparison (if relevant) + 1 conversion CTA.
- Blog summaries: open with the reader's problem → one-sentence answer → explicit "Go deeper →" link to the legal canonical.
- Checkout/template pages link back to the relevant free guide.
- Every Monday batch includes 1 internal-link-pass adding cross-links from 5–10 existing pages to the new batch.

---

# PART II — RECONCILED CURRENT STATE (three sweeps, 2026-06-10)

Sources reconciled: Claude (`caseworks`-deep), DeepSeek (multirepo, but **missed the thin-content backlog** by reading the guard's PASS as "no thin content"), GPT/Codex (multirepo, most current — **corrected DeepSeek's stale claims**).

## II.1 caseworks (legal.yousafeconsultancy.com) — STRONG, with a real content backlog
- ✅ `seo-audit-guard` **7/7 PASS**; 305 pages / 259 indexable; 0 duplicate titles/H1s; schema (Org/WebSite/Breadcrumb/Article/FAQPage/Person/AboutPage); GEO answer blocks page-specific; `/ai` + `/llms.txt` + `search-index.json`; redirects fire (trailing-slash fixed); robots clean (`host:` removed); `LegalService`/`LocalBusiness` removed.
- ⚠️ **157 thin pages <1,500w** (50 severe <400w, 63 moderate 400–800w, 44 near 800–1,500w; 80 US / 45 UK / 15 CA / 11 templates). *Caught by Claude; missed by DeepSeek; confirmed by Codex.* **This is the #1 caseworks item.**
- ⚠️ ~14 UK/US titles 72–98 chars + ~3 AU/UK 63–65 (over SERP length).
- ⚠️ `seo-batch-01` restore-hook drift (committed source can diverge from deploy on ~21 pages).
- 13 orphan-candidate UK city tenancy pages (low; linked from `/uk/` hub).

## II.2 yousafe-consultancy (yousafeconsultancy.com + usa/uk/ca/au) — main estate gaps
**Corrected baseline (Codex over DeepSeek):** consultancy **does** have JSON-LD on blog/landing/regional pages, and `llms.txt`. DeepSeek's "zero JSON-LD" is **stale — do not act on it.** Real gaps:
- 🔴 **AU sitemap missing from the landing sitemap-index** (`app/sitemap-index.xml/route.ts` lists yousafeconsultancy/usa/ca/uk/legal/portal but NOT `au.`).
- 🔴 **AU is the weakest regional app:** has robots/sitemap/llms.txt but **no detected page JSON-LD and no `/ai`**, and no deep article layer vs CA/US/UK.
- 🟡 **No `/ai` pages** on brand or any regional app (caseworks has one; others don't).
- 🟡 robots `host:` still emitted on marketing/regional apps (caseworks removed it) — estate inconsistency.
- 🟡 No automated SEO guard suite (caseworks has 7; others have none).
- 🟡 Brand-blog vs caseworks **content overlap** (F-1/OPT/study-permit/PGWP) — duplication risk.

## II.3 yousafe-portal (portal. / market.) — better than older docs said
**Corrected (Codex over DeepSeek):** marketplace **has** JSON-LD (services, FAQs, templates/products/offers, categories/breadcrumbs, gigs) and a **DB-backed sitemap** emitting `market.` public URLs. Real items:
- 🟡 Needs a **CI/build guard** proving the DB-backed sitemap excludes inactive gigs, private dashboards, auth pages, and noindex routes.
- 🟡 Verify auth-route noindex (dashboard/messages/orders).
- (From the 2026-06-09 Ahrefs crawl: some `market…/gigs` were noindex-yet-in-sitemap and `market…/templates` canonical items — verify against current DB-backed sitemap, may be resolved.)

## II.4 yousafe-saas (support., internal) — low priority
- Root noindex/follow, empty sitemap, robots disallows /api,/admin,/dashboard,/onboarding. **Tension:** disallowing a route can stop crawlers seeing its noindex. Decide deliberately: truly-private → disallow is fine; "crawl-but-noindex" → noindex without disallow. Document the choice.

## II.5 Done ledger (completed this cycle — do not redo)
CA Batch 1 (12 CA canonicals, page-specific) · AU canonical articles (7) · UK city-tenancy consolidation + deprecated-duplicate retirement · GEO/AI workstream + remediation (schema, `/ai`, `/llms.txt`, answer blocks, `check-geo` guard, LegalService removal) · trailing-slash redirect fix · robots `host:` removal · salvaged diagnostic scripts · repo/branch hygiene (pruned 19+ merged branches).

---

# PART III — FORWARD ROADMAP (full scope, prioritized)

## Track A — CASEWORKS (Claude-authoritative; all 3 sweeps defer here)
- **A1 (P1) — Thin-content depth: 157 pages → ≥1,500w.** Cluster-batch expansion, ~12 pages/PR, CA-Batch-1 format. Sequence: **US severe-tier (<400w) first** → UK → CA near-threshold → templates. Enforce I.2 (anti-templating, cross-page dedup), I.3 (restore-hook), I.5 (8 required elements), I.6 (citations). Per page, confirm it's a genuine canonical (not a deliberately tactical short page) before expanding.
- **A2 (P2) — Over-length titles:** tighten ~14 UK/US + 3 AU/UK to ≤60 (≤70 hard). Update `.b64` for archive-covered ones. One fast PR.
- **A3 (P3) — Retire/reconcile the restore-hook archive:** once covered pages are stable, regenerate the archive from source + add a CI check that committed source == archive, OR retire the hook. Until then, I.3 applies.
- **A4 (P4) — GEO/tooling follow-ups:** verify §E text-first/alt-text (audit reported 0 to fix); optional `llms-full.txt`; wire salvaged diagnostics into a **report-only** (non-gating) CI job; fix `seo-indexing-audit.mjs`'s stale `NOINDEX_PATHS` assertion (false positive).

## Track B — ESTATE (GPT/Codex batches; caseworks is the template)
- **B1 — Estate sitemap & robots consistency:** add `au.` to the landing sitemap-index (exactly once; keep checkout/support excluded); remove non-standard `host:` from robots across marketing/regional/portal/support apps (caseworks precedent); verify every sitemap URL returns the right host and no noindex route.
- **B2 — Regional GEO/AI parity:** add `/ai` pages to brand + usa/uk/ca/au; add honest baseline schema (Organization/WebSite/BreadcrumbList/FAQPage-where-visible/Service-where-real) where missing; **bring AU to parity** (JSON-LD + `/ai` + add AU to shared jurisdiction arrays/nav/link/sitemap generators). Preserve all existing titles/descriptions/canonicals/H1s/sitemap-URLs.
- **B3 — Multirepo SEO guard suite:** port caseworks-modeled guards to consultancy/portal/saas — noindex-in-sitemap, indexable-not-in-sitemap, canonical uniqueness, duplicate title/description, correct-host canonicals, image alt-text, honest JSON-LD parse, `/llms.txt` links only indexable canonicals, `/ai` exists where intended. Portal-specific: prove the DB-backed sitemap excludes inactive/private/noindex URLs.
- **B4 — Canonical ownership (brand vs caseworks):** caseworks owns deep legal/procedural canonicals; brand/regional own service positioning + country student-journey pages. Where a brand article overlaps a caseworks canonical, add contextual links to caseworks (don't duplicate the body). Avoid cross-domain canonical tags unless true duplicate content.
- **B5 — Sitewide honest schema on marketing/regional layouts** (Organization/WebSite/BreadcrumbList/FAQPage-visible/Service-real); same honesty bans as I.1.
- **B6 — saas noindex/robots decision** (II.4); **portal auth-route noindex verification.**

## Track C — CONTENT PRODUCTION CADENCE (Q3 strategy)
- 7 articles every Monday (batch deploy); see the editorial themes: Month 1 policy-urgency/freshness, Month 2 topical-depth/pain-points, Month 3 long-tail/monetization/comparison. Each Monday batch also runs an internal-link pass (I.7). Use Implementation Prompt A (Part VI).

---

# PART IV — OPEN QUESTIONS (resolve before/within the relevant batch)
1. Does `portal.../sitemap.xml` intentionally return `market.` URLs? (code says yes — verify against Cloudflare/domain routing).
2. Should `support.` stay fully internal/noindex with an empty sitemap? (if yes, no public SEO there).
3. Should ALL regional apps get `/ai`, or brand + AU first?
4. Is `host:` removal estate-wide? (caseworks precedent ⇒ yes).
5. Should AU get a deeper guide/article layer now, or only schema + `/ai` + sitemap-index wiring in pass 1?
6. Verify the 2026-06-09 Ahrefs `market` findings (gigs noindex-in-sitemap, template canonicals) against the current DB-backed sitemap — open or resolved?

---

# PART V — KNOWN FALSE-POSITIVES / NON-ISSUES (do not re-chase)
- `seo-indexing-audit` "sitemap doesn't filter NOINDEX_PATHS" **FAIL = false positive** — it expects a `NOINDEX_PATHS` constant that doesn't exist; the caseworks sitemap filters noindex via its file-walk (verified). (Fix the tool's assertion — A4.)
- `/portal/ /checkout/ /login not in disallow` warnings → **moot on caseworks** (no such routes; they live in portal/consultancy).
- `hreflang-validate` "relative URL '/'" warning → root canonical `/` is correct; benign.
- Orphan warnings for `/about /terms /privacy /disclaimer` → footer/legal pages, intentional.
- DeepSeek's "consultancy zero JSON-LD" and "portal no/unknown schema" → **stale; corrected by Codex** (both have schema).
- Caseworks redirects/robots-`host:` "issues" in the older DeepSeek sweep → **already fixed** (don't act on the stale claim).

---

# PART VI — TOOLING, EVALUATION & IMPLEMENTATION PROMPTS

## VI.1 caseworks tooling (run from repo root)
| Command | Purpose | Gating? |
|---|---|---|
| `node scripts/seo-audit-guard.mjs` | 7-check master guard (no-scaffolding, sitemap-health, internal-links, metadata-uniq, content-quality, schema-validity, GEO) | **Yes (CI)** |
| `node scripts/check-content-quality.mjs` | thin-page report (A1 tracker) | warn |
| `node scripts/check-metadata-uniqueness.mjs` | dup titles/H1s + length | part of guard |
| `node scripts/check-geo.mjs` | answer-block presence + near-dup | part of guard |
| `node scripts/seo-invariants.mjs` | before/after SEO-signal idempotency diff | manual |
| `node scripts/seo-indexing-audit.mjs` | robots/indexing (1 stale check — A4) | manual |
| `node scripts/sitemap-validate.mjs` | validates `out/sitemap.xml` post-build | manual |
| `node scripts/hreflang-validate.mjs` | hreflang absolute-URL checks | manual |
| `node scripts/internal-link-check.mjs` | internal-link resolution (md false-positives) | manual |

## VI.2 Monthly evaluation checklist (Q3 §8 — run final Monday of each month, no new content that week)
- **Technical (Screaming Frog free / grep):** crawl 500 URLs; 0 redirect chains >1 hop; 0 internal 404s; 0 canonical loops; 0 indexable pages <700w; 0 missing title/meta; 0 duplicate H1s; hreflang absent (confirm ban).
- **GSC:** export top 50 queries by impressions; flag >100 impressions / <3% CTR / position >10 → optimize title/meta; note new queries → next month's content; 0 "Poor" CWV; 0 "Duplicate without user-selected canonical".
- **Rankings:** track the 20 target keywords (position/page/date); note ≥5-spot moves; diagnose any drop for cannibalization.
- **Hygiene:** `grep -r "VERIFY OFFICIAL SOURCE"` → 0 on production; per-cluster duplicate-detect; update `dateModified` on changed pages.
- **Competitors:** 3 new pages outranking us → word count, schema, backlink signals → counter-content plan.

## VI.3 Implementation prompts (preserved from Q3 §9)

### Prompt A — Monday batch deploy
```
Deploy the 7 articles scheduled for [WEEK X].
For each: write/expand to the §I.4 word-count + §I.5 quality standards; add/update metadata
(title ≤60, description ≤155, H1, primary + 3–5 secondary keywords); inject Article +
BreadcrumbList + FAQPage schema; add internal links per §I.7; set dateModified to today; verify
no banned phrases; enforce the 4-local-facts rule on location pages (fail if insufficient).
DO: update sitemap/robots; add 301s with trailing-slash sources; build/typecheck/lint; run
duplicate-detect (no shared H1/title/primary keyword); update the seo-batch-01 .b64 for any
covered page.
DON'T: create duplicate-intent pages; add hreflang; index pages with unresolved [VERIFY];
publish blog summaries >1,200w or legal canonicals <1,500w; share any sentence across pages.
OUTPUT: changed files; diff summary; new URLs + primary keywords; build/test result; remaining
[VERIFY] markers; cross-page-dedup proof; restore-hook "0 file(s) written".
```

### Prompt B — Monthly evaluation
```
Execute every checklist item in §VI.2. Run the technical audit on the 500 highest-priority URLs,
GSC export (or manual SERP checks for the 20 keywords), grep banned phrases + [VERIFY], per-cluster
duplicate-detect, and update dateModified on pages touched this month.
DON'T publish new content during evaluation week or change URL structures unless fixing a regression.
OUTPUT: pass/fail per item; ranking table for the 20 keywords; top-3 competitor pages; next-month plan.
```

### Prompt C — Internal-link pass
```
For each page in the last Monday batch, find 5–10 existing indexable pages that should link to it;
add contextual topic-matching anchors per §I.7; update dateModified on modified pages.
DON'T use "click here/read more"; don't link noindex→indexable unnecessarily.
OUTPUT: source→target pages with anchor text used.
```

---

# PART VII — NEXT ACTION
Kick off **Track A1 Batch A** (caseworks US severe-tier, ~12 pages <400w) with an implementor brief in the CA-Batch-1 format + §I.2/§I.3 rules. In parallel, **Track B1** (estate sitemap-index AU + robots `host:` normalization) is the fastest estate win. A2 (titles) is a quick single PR.

*This master plan reconciles and replaces: SEO_SWEEP_STATUS_AND_ROADMAP_2026-06-10, DEEPSEEK_FULL_MULTIREPO_SEO_SWEEP, GPT_FULL_MULTIREPO_SEO_SWEEP_2026-06-10, SEO_STRATEGY_Q3_2026, yousafe_3_month_seo_topical_authority_v2, and the implementation briefs (CA stub expansion, AU canonical articles, GEO optimization + remediation, audit fixback). Those briefs remain version-controlled in `caseworks/docs/seo-briefs/`.*

---

# APPENDICES — VERBATIM SOURCE INSTRUCTIONS

Parts I–VII above are the curated, reconciled, de-duplicated governance + roadmap (the operative plan). The appendices below preserve, **verbatim and in full**, the complete instruction text of every source document that was consolidated here and then removed from this directory — so no instruction is lost. Where an appendix conflicts with Parts I–VII, **Parts I–VII win** (they incorporate the later corrections, e.g. Organization not LegalService, and the GPT/Codex reconciliations).

---
## APPENDIX A — SEO_STRATEGY_Q3_2026.md (verbatim)

# YouSafe Consultancy / MyCaseworks — 3-Month SEO Acceleration Strategy
**Period:** June 2026 – August 2026  
** cadence:** 7 articles published every Monday (batch deploy)  
**Evaluation:** End-of-month ranking, traffic, and technical-hygiene review  
**Target domains:** `legal.yousafeconsultancy.com` + `yousafeconsultancy.com` + `usa.yousafeconsultancy.com` + `ca.yousafeconsultancy.com`

---

## 1. Bird’s-Eye Site Snapshot

| Property | Role | Indexable URLs | Status |
|---|---|---|---|
| `legal.yousafeconsultancy.com` | Canonical knowledge base (attorney-reviewed) | 140+ legal articles + clusters | Strong pillar-cluster architecture; needs freshness |
| `yousafeconsultancy.com` | Brand landing + blog summaries + hubs | 17 blog posts + 9 category hubs | Thin blog layer; needs expansion & demotion discipline |
| `usa.yousafeconsultancy.com` | Programmatic SEO (universities + countries) | 175 university + 195 country pages | Risk of thin content on low-intl-enrolment universities |
| `ca.yousafeconsultancy.com` | Canada cluster + programmatic pages | 11 cluster-3 pages + country pages | Emerging; needs topical depth |
| `checkout.yousafeconsultancy.com` | Template/products | 15 product pages | Okay; needs content bridges back to guides |
| `portal.yousafeconsultancy.com` | Auth workspace | 1 (homepage only) | Correctly noindex |
| `support.yousafeconsultancy.com` | Support ops | 1 (homepage only) | Correctly noindex |

**Total ecosystem URLs tracked:** ~1,282

**Previous issues already fixed (DO NOT REGRESS):**
- ✅ Cluster 1 (UK tenancy) redirects & canonicals shipped
- ✅ Cluster 2 (US F-1/OPT) redirects & canonicals shipped
- ✅ Cluster 3 (CA study permit/PGWP) content architecture briefed
- ❌ Hreflang **removed globally** — do NOT re-add until per-locale pre-rendered routes exist
- ❌ Canonicalized location pages without ≥4 distinct local facts — do NOT index weak location pages
- ❌ Short blog summaries competing with legal canonicals — do NOT let blog posts exceed 1,200w or steal procedural intent

---

## 2. Free SEO Tool Stack (Ahrefs / Semrush / Screaming Frog Alternatives)

Use **only** these tools for the next 3 months. No paid subscriptions required.

| Tool | Purpose | URL | Frequency |
|---|---|---|---|
| **Google Search Console** | Existing keyword impressions, CTR, index coverage, Core Web Vitals | search.google.com/search-console | Daily / Weekly |
| **Google Keyword Planner** | Search volume & competition for seed keywords (free with Ads account) | ads.google.com | Bi-weekly |
| **Google Trends** | Topic seasonality, rising queries, geo-interest | trends.google.com | Weekly |
| **Bing Webmaster Tools** | Secondary index coverage, keyword data, URL inspection | bing.com/webmasters | Weekly |
| **Screaming Frog** (free 500-URL crawl) | Technical audits, canonical checks, title/meta duplication, hreflang audit (verify removal), response codes | screamingfrog.co.uk | Weekly |
| **PageSpeed Insights + GTmetrix** | Core Web Vitals, mobile performance | pagespeed.web.dev / gtmetrix.com | Monthly |
| **Ubersuggest** (free tier) | Keyword ideas, competitor top pages, content gaps | neilpatel.com/ubersuggest | Bi-weekly |
| **AnswerThePublic** (limited free) | People Also Ask expansion, long-tail question mining | answerthepublic.com | Monthly |
| **AlsoAsked** (limited free) | PAA tree depth for question keywords | alsoasked.com | Monthly |
| **Keyword Surfer** (Chrome extension) | SERP volume & similarity scores while browsing | surferseo.com/keyword-surfer | Ad-hoc |
| **MozBar** (free) | DA/PA, title/meta preview, link metrics | moz.com/products/pro/seo-toolbar | Ad-hoc |
| **SEOquake** | On-page audit, density, internal/external link count | seoquake.com | Ad-hoc |
| **Plausible Analytics** (already deployed) | Privacy-first traffic, source, entry pages | plausible.io | Daily |
| **Cloudflare Analytics** | Bot vs human, cache hit, security events | dash.cloudflare.com | Weekly |

**Competitor recon workflow (30 min/week):**
1. Identify 3–5 ranking competitors per cluster from GSC "Queries you rank for but not in top 10"
2. Paste competitor domains into Ubersuggest free → extract their top 20 pages by traffic
3. Run those page titles through Google Keyword Planner to find related low-competition terms
4. Cross-check in Google Trends for 2026 spike terms
5. Feed findings into Monday batch planning

---

## 3. The 20 Fastest-Ranking Keywords

**Selection criteria:**
- Long-tail (4+ words) or question-based
- High intent (informational → commercial investigation)
- Timely 2026 policy changes = freshness advantage
- Aligns with existing topical authority (US F-1/OPT, CA study permit/PGWP, UK tenancy)
- Low-to-medium competition (can win with depth + internal links)
- Maps to a paid service or template pack

### Month 1 — Policy Urgency & Freshness (Weeks 1–4)
These keywords ride **breaking 2026 policy waves**. Publish first to capture the freshness algorithm boost.

| # | Keyword | Target URL | Type | Words | Cluster | Intent |
|---|---|---|---|---|---|---|
| 1 | **Section 21 abolished May 2026 student tenants** | `/uk/section-21-abolished/` | Legal canonical | 2,200 | UK tenancy | Informational → service |
| 2 | **Renters Rights Act 2026 international students UK** | `/uk/renters-rights-international-students/` | Legal canonical | 2,000 | UK tenancy | Informational → service |
| 3 | **F-1 duration of status proposed change 2026** | `/us/student-visas/f1-duration-of-status-2026/` | Legal canonical | 2,400 | US F-1 | Informational (urgent) |
| 4 | **STEM OPT employer monitoring site visit 2026** | `/us/student-visas/stem-opt-e-verify/` (expand) | Legal canonical | 1,800 | US F-1/OPT | Informational → service |
| 5 | **Canada study permit cap 2026 India Nigeria** | `/ca/study-permit-document-checklist/` (expand India/Nigeria sections) | Legal canonical | 2,000 | Canada SP | Informational → service |
| 6 | **PGWP field of study requirements 2026 diploma** | `/ca/pgwp-eligibility-2026/` (expand) | Legal canonical | 2,200 | Canada PGWP | Informational |
| 7 | **PAL TAL exempt graduate programs Canada 2026** | New: `/ca/pal-tal-exempt-masters-phd-2026/` | Legal canonical | 1,800 | Canada SP | Informational |

### Month 2 — Topical Depth & Pain Points (Weeks 5–8)
These keywords build **cluster authority** and target high-stress moments where users convert to paid review.

| # | Keyword | Target URL | Type | Words | Cluster | Intent |
|---|---|---|---|---|---|---|
| 8 | **OPT 90 day unemployment cap grace period strategy** | `/us/student-visas/opt-90-day-unemployment-cap/` (expand) | Legal canonical | 2,000 | US OPT | Informational → service |
| 9 | **SEVIS termination reinstatement timeline 2026** | `/us/student-visas/sevis-termination-and-reinstatement/` (expand) | Legal canonical | 2,200 | US F-1 | Informational (urgent) |
| 10 | **Study permit refusal reapply Canada 2026** | New: `/ca/study-permit-refusal-reapply-2026/` | Legal canonical | 2,400 | Canada SP | Informational → service |
| 11 | **H-1B lottery 2026 registration deadline employer** | New: `/us/h1b-lottery-2026-registration-guide/` | Legal canonical | 2,000 | US Work | Informational |
| 12 | **Day 1 CPT risks 2026 legitimate programs** | `/us/student-visas/day-1-cpt-risk/` (expand) | Legal canonical | 2,200 | US F-1 | Informational → service |
| 13 | **UK skilled worker visa salary threshold 2026** | New: `/uk/skilled-worker-salary-threshold-2026/` | Legal canonical | 1,800 | UK Work | Informational |
| 14 | **Canada Express Entry CRS international student graduates** | New: `/ca/express-entry-crs-student-graduates-2026/` | Legal canonical | 2,200 | Canada PR | Informational |

### Month 3 — Long-Tail Monetization & Comparison (Weeks 9–12)
These keywords capture **decision-stage users** and bridge to template/checkout conversions.

| # | Keyword | Target URL | Type | Words | Cluster | Intent |
|---|---|---|---|---|---|---|
| 15 | **F-1 student health insurance USA Canada UK comparison 2026** | New: `/compare/international-student-health-insurance-2026/` | Comparison | 2,400 | COMPARE | Commercial investigation |
| 16 | **International student housing deposit dispute letter template** | `/uk/deposit-dispute-letter-2026/` (expand template offer) | Legal canonical | 1,800 | UK tenancy | Transactional |
| 17 | **Spousal open work permit Canada study permit 2026** | New: `/ca/spousal-open-work-permit-study-permit-2026/` | Legal canonical | 2,000 | Canada Family | Informational → service |
| 18 | **EB-2 NIW green card STEM OPT students 2026** | `/blog/green-card-after-opt/` (expand + link) | Blog summary + legal | 1,200 blog / 2,500 legal | US PR | Informational → service |
| 19 | **Canada study permit financial proof GIC vs bank statement 2026** | `/ca/study-permit-financial-proof-2026/` (expand) | Legal canonical | 2,000 | Canada SP | Commercial investigation |
| 20 | **F-1 visa interview questions Lagos Mumbai Nairobi London 2026** | `/us/student-visas/f1-interview-questions-2026/` (expand + location sections) | Legal canonical | 2,500 | US F-1 | Informational |

---

## 4. Three-Month Editorial Calendar

**Rules:**
- **7 articles batched every Monday** = deploy together, cross-link before Google crawls
- **Every batch must contain** at least 2 legal canonicals (1,500+ words), 3 blog summaries (700–1,200 words), and 2 hub/refresh updates
- **All articles must pass the 5-question test** (who, what decision, controlling source, what document, what deadline/risk)
- **No article ships with `[VERIFY OFFICIAL SOURCE BEFORE PUBLISHING]` unresolved**
- **Internal links:** Every new page links to 2+ existing pillars and 1 service/checkout page

### Month 1 — June 2026 (Policy Urgency)

| Week | Monday Batch (7 articles) | Domains | Focus |
|---|---|---|---|
| **Week 1** | 1. UK Renters’ Rights Act 2026: student tenant guide (legal)  <br>2. Section 21 abolished: what changed 1 May 2026 (legal)  <br>3. UK tenancy deposit dispute letter 2026 template (legal)  <br>4. Blog: "Can my landlord still evict me after Section 21?" (summary → legal)  <br>5. Hub refresh: `/guide/student-visas` (add 2026 policy alert box)  <br>6. UK city refresh: London student tenant rights 2026 (expand local facts)  <br>7. UK city refresh: Manchester student tenant rights 2026 (expand local facts) | legal + landing | UK tenancy freshness blast |
| **Week 2** | 1. F-1 duration of status proposed change 2026 (legal)  <br>2. STEM OPT employer monitoring & E-Verify 2026 (legal)  <br>3. F-1 visa interview questions 2026: country-specific sections (legal expand)  <br>4. Blog: "Is F-1 duration of status ending in 2026?" (summary)  <br>5. Blog: "STEM OPT site visits: what employers must do" (summary)  <br>6. Hub refresh: `/guide/opt-guide` (add 2026 compliance alert)  <br>7. USA university refresh: top 10 universities add 2026 policy note | legal + landing + usa | US F-1 policy wave |
| **Week 3** | 1. Canada study permit cap 2026: India & Nigeria impact (legal)  <br>2. PGWP field of study requirements 2026 (legal expand)  <br>3. PAL/TAL exempt graduate programs Canada 2026 (legal)  <br>4. Blog: "Canada study permit cap: who is affected?" (summary)  <br>5. Blog: "PGWP eligible colleges 2026: diploma rules" (summary)  <br>6. Hub refresh: `/guide/study-permit-guide` (add cap alert)  <br>7. Canada city refresh: Toronto tenant rights for students (new or expand) | legal + landing + ca | Canada policy wave |
| **Week 4** | **EVALUATION WEEK** — No new content. Audit, measure, fix. | — | See §9 |

### Month 2 — July 2026 (Pain Points & Depth)

| Week | Monday Batch (7 articles) | Domains | Focus |
|---|---|---|---|
| **Week 5** | 1. OPT 90-day unemployment cap: strategy guide 2026 (legal expand)  <br>2. SEVIS termination & reinstatement timeline 2026 (legal expand)  <br>3. Blog: "What to do if SEVIS is terminated" (summary)  <br>4. Blog: "OPT unemployment days: how to count and save them" (summary)  <br>5. Service page refresh: `/us/renting-nyc-students` (add 2026 cost data)  <br>6. Internal link pass: Cluster 2 all pages cross-linked  <br>7. Template pack page: F-1 reinstatement document kit (checkout) | legal + landing + checkout | US retention pain |
| **Week 6** | 1. Study permit refusal reapply Canada 2026 (legal)  <br>2. Spousal open work permit Canada 2026 (legal)  <br>3. Blog: "Canada study permit refused: step-by-step reapply" (summary)  <br>4. Blog: "Can my spouse work while I study in Canada?" (summary)  <br>5. Canada city refresh: Vancouver student housing rights (expand)  <br>6. `/from/india/` refresh: add 2026 cap context  <br>7. `/from/nigeria/` refresh: add 2026 cap context | legal + landing + ca | Canada retention pain |
| **Week 7** | 1. H-1B lottery 2026 registration guide (legal)  <br>2. Day 1 CPT risks 2026: legitimate vs scams (legal expand)  <br>3. UK skilled worker salary threshold £41,700 2026 (legal)  <br>4. Blog: "H-1B 2026: what students must know before March" (summary)  <br>5. Blog: "Is Day 1 CPT legal in 2026?" (summary)  <br>6. UK city refresh: Birmingham tenant rights 2026  <br>7. Comparison refresh: `/compare/us-opt-vs-canada-pgwp` (add 2026 rules) | legal + landing + uk + usa | Cross-country work |
| **Week 8** | **EVALUATION WEEK** — No new content. Audit, measure, fix. | — | See §9 |

### Month 3 — August 2026 (Monetization & Long-Tail)

| Week | Monday Batch (7 articles) | Domains | Focus |
|---|---|---|---|
| **Week 9** | 1. International student health insurance USA vs Canada vs UK 2026 (comparison)  <br>2. EB-2 NIW green card for STEM OPT students 2026 (legal expand)  <br>3. Blog: "Best health insurance for F-1 students 2026" (summary)  <br>4. Blog: "Green card after OPT: NIW vs employer sponsorship" (summary)  <br>5. Hub refresh: `/guide/work-visas` (add NIW + H-1B paths)  <br>6. Template pack refresh: add health-insurance checklist to USA bundle  <br>7. Internal link pass: all `/us/loans/` and `/us/student-visas/` cross-linked | legal + landing + checkout | Monetization bridge |
| **Week 10** | 1. Canada study permit financial proof: GIC vs bank statement 2026 (legal expand)  <br>2. Canada Express Entry CRS for international graduates 2026 (legal)  <br>3. Blog: "How much money do I need for Canada study permit 2026?" (summary)  <br>4. Blog: "Express Entry after study: CRS boost tips" (summary)  <br>5. Canada country refresh: `/from/ghana/` add 2026 financial norms  <br>6. Canada country refresh: `/from/kenya/` add 2026 financial norms  <br>7. Service page: Canada proof-of-funds review kit (checkout) | legal + landing + ca + checkout | Canada monetization |
| **Week 11** | 1. F-1 visa interview: Lagos consulate 2026 funding docs (legal expand)  <br>2. F-1 visa interview: Mumbai consulate 2026 study-gap rules (legal expand)  <br>3. F-1 visa interview: Nairobi consulate 2026 sponsor evidence (legal expand)  <br>4. F-1 visa interview: London consulate 2026 postgraduate rules (legal expand)  <br>5. **Crucial:** Verify each of the 4 above has ≥4 distinct local facts. If not, canonicalize to `/us/student-visas/f1-interview-questions-2026/` | legal | Location-page quality gate |
| **Week 12** | 1. International student housing deposit dispute letter template (legal expand)  <br>2. UK periodic tenancies 2026: student rights (legal expand)  <br>3. Blog: "How to write a deposit dispute letter UK 2026" (summary)  <br>4. Blog: "What is a periodic tenancy as a student?" (summary)  <br>5. Technical hygiene pass: sitemap, redirects, canonicals, Core Web Vitals  <br>6. Internal link pass: full ecosystem link graph audit  <br>7. Schema audit: Article + BreadcrumbList + FAQPage on all new pages | legal + landing | Wrap & harden |
| **Week 13** | **FINAL EVALUATION WEEK** — Full 3-month retrospective | — | See §9 |

---

## 5. Technical SEO Guardrails (SEMrush Issues — DO NOT REPEAT)

### 5.1 Canonicalization Discipline
- **NEVER** index a page that canonicalizes to another URL unless it has **≥4 distinct local facts** (embassy name, country-specific document, local refusal pattern, local logistics).
- If a location page fails the 4-fact test → `rel=canonical` to the national pillar + remove from sitemap.
- Code path must support reversible canonicals (if facts are added later, canonical reverts to self).

### 5.2 Hreflang — Hard Ban
- **Do NOT add hreflang tags** to any property until per-locale pre-rendered URL routes exist (e.g., `/es/us/f1-document-checklist-2026/`).
- Client-side JS translation is invisible to Googlebot and caused broken reciprocal return-link validation previously.
- Translation via `?lang=` query params is fine for UX but must remain **noindex** or self-canonical.

### 5.3 Content Length Gates
| Layer | Minimum | Maximum | Action if too short |
|---|---|---|---|
| Legal canonical | 1,500 words | 2,800 words | Expand evidence checklists, add worked examples, add FAQ |
| Blog summary | 700 words | 1,200 words | Merge into legal canonical if it exceeds max or steals intent |
| Hub / guide | 300 words | 700 words | Must be mostly links + short intro; no long-form duplicate |
| Template (with template text) | 700 words | 900 words | Add link back to relevant free guide; template text alone consumes ~300–500w — 600w is unachievable without removing the product |
| Hub / directory (product listing) | 200 words | 600 words | Add link back to relevant procedure guides |

### 5.4 Duplicate Intent Prevention
- **One page = one search intent.** If two pages target the same primary keyword, merge/301/canonicalize the weaker one.
- Blog summaries must **never** rank for procedural intent ("checklist," "documents," "form numbers"). They rank for "what is," "how to choose," "vs" intent only.
- Before creating any new page, search the ecosystem sitemap for the primary keyword. If it exists, enrich the existing page instead.

### 5.5 Noindex Rules
- `index: false` for: auth pages, dashboard, checkout flow, redirect sources, canonicalized pages, pages with unresolved `[VERIFY OFFICIAL SOURCE BEFORE PUBLISHING]` markers.
- Every `index:false` page must be removed from `sitemap.xml`.

### 5.6 Redirect Hygiene
- **301 only.** No 302/307/308 for permanent moves.
- Before deploying a 301, extract unique facts from the source into the destination. Log the diff in `REVIEW-NOTES.md`.
- Redirect sources must be removed from sitemap immediately.

### 5.7 Freshness Signals
- Every article must have `dateModified` updated when materially changed (not just typo fixes).
- New 2026 articles must reference current policy dates (e.g., "as of May 2026").
- Avoid evergreen phrases like "recently" or "last year." Use explicit dates.

### 5.8 Schema Requirements (every new page)
- `Article` schema with headline, author, publisher, datePublished, dateModified, citation
- `BreadcrumbList` schema
- `FAQPage` schema if ≥3 FAQs present
- Organization schema on root layout (`@type: LegalService`)

---

## 6. Content Quality Standards (Anti-AI-Copy Rules)

**Banned phrases (instant rewrite if found):**
- "Navigating immigration can be overwhelming…"
- "Comprehensive guide to everything you need to know"
- "Get approved" / "guaranteed" / "fast PR" / "high success rate"
- "Land of opportunity" / "your dreams abroad"
- Repeated boilerplate: "documents, deadlines, official sources, common pitfalls, FAQs"

**Required on every legal canonical:**
1. **One-sentence answer** at the top
2. **Who this is for / not for** (reader persona)
3. **What decision** they must make next
4. **Controlling source** (USCIS, IRCC, GOV.UK, etc.) with live link
5. **Document checklist** (specific forms, evidence, letters)
6. **Deadline or risk trigger** (what stops the case)
7. **Worked example** (realistic scenario)
8. **When to get a paid review** CTA

**Link anchor text rules:**
- Must name the destination page’s topic (e.g., "SEVIS reinstatement timeline")
- NO "click here," "read more," "learn more," "this page"

---

## 7. Internal Linking Protocol

**Every new page must link to:**
1. **Parent pillar** (if child page)
2. **2–4 sibling pages** in same cluster
3. **1 service/checkout page** (conversion path)
4. **1 official-source box** (gov link)

**Pillar pages must link to:**
1. All major child spokes
2. Cross-country comparison (if relevant)
3. 1 conversion CTA

**Blog summaries must:**
1. Open with the reader’s problem
2. Give a one-sentence answer
3. Include explicit "Go deeper →" link to legal canonical

**Checkout/template pages must:**
1. Link back to the relevant free guide (free guide = discovery surface)

**Freshness pass:** Every Monday batch must include 1 "internal link pass" article that adds cross-links from 5–10 existing pages to the new batch.

---

## 8. Monthly Evaluation Checklist (End of Month)

Run this on the final Monday of each month instead of publishing new content.

### Week 4 / Week 8 / Week 13 Tasks

**Technical (Screaming Frog free crawl):**
- [ ] Crawl 500 URLs across all subdomains
- [ ] 0 redirect chains >1 hop
- [ ] 0 404s on internal links
- [ ] 0 canonical loops
- [ ] 0 indexable pages with <700 words
- [ ] 0 missing title/meta description
- [ ] 0 duplicate H1s across indexable pages
- [ ] Hreflang tags absent (confirm ban)

**GSC Review:**
- [ ] Export top 50 queries by impressions
- [ ] Identify queries with >100 impressions, <3% CTR, position >10 → optimize title/meta
- [ ] Identify new queries appearing → plan next month’s content
- [ ] Check Core Web Vitals: 0 "Poor" URLs
- [ ] Index coverage: 0 "Duplicate without user-selected canonical" errors

**Ranking Tracker (manual + Ubersuggest free):**
- [ ] Track the 20 target keywords; record position, page, date
- [ ] Note any keyword where position improved ≥5 spots
- [ ] Note any keyword where position dropped → diagnose cannibalization

**Content Hygiene:**
- [ ] Run `grep -r "VERIFY OFFICIAL SOURCE"` — must return 0 on production branch
- [ ] Run duplicate-detect test per cluster
- [ ] Update `dateModified` on all pages changed this month

**Competitor Snapshot:**
- [ ] List 3 new competitor pages that outrank us
- [ ] Note their word count, schema types, and backlink signals (MozBar)
- [ ] Plan counter-content for Month 2 / Month 3

---

## 9. Claude Code Implementation Prompts

Use these prompts directly in Claude Code to execute each batch.

### Prompt A — Monday Batch Deploy
```
You are implementing the Monday SEO batch for YouSafe Consultancy.

TASK
Deploy the 7 articles scheduled for [WEEK X] from SEO_STRATEGY_Q3_2026.md §4.
For each article:
1. Write or expand the page to meet the word-count and quality standards in §6.
2. Add/update metadata (title ≤60 chars, description ≤155 chars, H1, primary keyword, 3–5 secondary keywords).
3. Inject Article + BreadcrumbList + FAQPage schema.
4. Add internal links per §7.
5. Set dateModified to today's date.
6. Verify no banned phrases from §6 exist.
7. If the page is a location page (Lagos, Mumbai, Nairobi, London), enforce the 4-local-facts rule from §5.1. Fail if insufficient.

DO
- Update sitemap.ts to include new/indexable URLs.
- Update robots.ts if needed.
- Add redirects in out/_redirects or src/redirects/ if any 301s are required.
- Run build, typecheck, and lint.
- Run the duplicate-detect test (no shared H1, title, or primary keyword).

DON'T
- Do not create duplicate intent pages.
- Do not add hreflang.
- Do not index pages with unresolved [VERIFY OFFICIAL SOURCE BEFORE PUBLISHING].
- Do not publish blog summaries >1,200 words.
- Do not publish legal canonicals <1,500 words.

OUTPUT
- Changed files list
- Diff summary
- New URLs + their primary keywords
- Build/test result
- Any [VERIFY] markers remaining
```

### Prompt B — Monthly Evaluation
```
You are running the end-of-month SEO evaluation for YouSafe Consultancy.

TASK
Execute every checklist item in SEO_STRATEGY_Q3_2026.md §8.

DO
- Run Screaming Frog (or equivalent grep/shell audit) on the 500 highest-priority URLs.
- Export GSC data if accessible; otherwise run manual SERP checks for the 20 target keywords.
- Run grep for banned phrases and [VERIFY] markers.
- Run duplicate-detect test across all clusters.
- Update dateModified on all pages touched this month.

DON'T
- Do not publish new content during evaluation week.
- Do not change URL structures unless a regression is found.

OUTPUT
- Technical audit result (pass/fail per item)
- Ranking tracker table for the 20 keywords
- Top 3 competitor pages discovered
- Plan adjustments for next month
```

### Prompt C — Internal Link Pass
```
You are running an internal-linking refresh for YouSafe Consultancy.

TASK
For every page published in the last Monday batch, find 5–10 existing indexable pages that should link to it. Add contextual anchor-text links per §7.

DO
- Use exact topic-matching anchor text.
- Prioritize pages in the same cluster, then adjacent clusters.
- Update dateModified on modified pages.

DON'T
- Do not add "click here" or "read more" anchors.
- Do not link from noindex pages to indexable pages unnecessarily.

OUTPUT
- List of source pages → target pages with anchor text used.
```

---

## 10. Success Metrics (3-Month Targets)

| Metric | Baseline | Month 1 | Month 2 | Month 3 |
|---|---|---|---|---|
| Indexable legal canonicals | ~160 | +7 | +7 | +7 |
| Indexable blog summaries | ~17 | +6 | +6 | +4 |
| Avg. legal canonical word count | ~1,400 | 1,600 | 1,800 | 2,000 |
| 20 target keywords in top 20 | TBD | 3 | 8 | 12 |
| 20 target keywords in top 10 | TBD | 1 | 3 | 6 |
| GSC total clicks (all properties) | TBD | +15% | +30% | +50% |
| GSC total impressions | TBD | +20% | +40% | +60% |
| Core Web Vitals "Good" URLs | TBD | 95% | 98% | 100% |
| Technical audit issues | TBD | 0 | 0 | 0 |

---

*Strategy written: 2026-05-18*  
*Next review: 2026-06-30 (Month 1 Evaluation)*  
*Owner: YouSafe Consultancy SEO team + Claude Code*

---
## APPENDIX B — yousafe_3_month_seo_topical_authority_claude_code_brief_v2.md (verbatim)

# YouSafe / MyCaseworks — 3-Month SEO Topical Authority Implementation Brief for Claude Code (v2, enhanced)

**Prepared for:** Claude Code / Claude Codex
**Primary repo:** `kylemwalkerpr-ship-it/caseworks`
**Execution model:** one weekly content batch per branch/PR, plus monthly audit review
**Publishing cadence:** 7 articles every Monday for 12 weeks (84 articles total)
**Objective:** measurable, defensible topical authority on Google for international-student legal-document journeys across US, UK, and Canada — without re-introducing any prior Semrush issue and without touching payment, auth, dashboard, or support code.

This v2 supersedes v1. It keeps every guardrail v1 set, sharpens the keyword targets with intent and SERP data, adds an E-E-A-T / YMYL layer (mandatory for legal content), adds schema.org specs, a freshness engine for the 1,193 existing orphans, AI-search citation rules, a backlink layer, and an executable Claude Code prompt with concrete script skeletons.

---

## 0. Read this first

### 0.1 How to use this file

This file is the single source of truth for the next 90 days of SEO work. Claude Code reads it once at the start of the infrastructure phase, then reads the relevant week's section at the start of each Monday batch. The roadmap files Claude Code creates inside `content/seo-quarter-plan/` mirror the structure of this brief so weekly execution does not require re-reading the whole document.

Before executing anything, Claude Code must verify that the brief's representation of the repo matches reality. If a file or route mentioned here is not present in the live repo, mark it `[VERIFY ROUTE LOCATION BEFORE IMPLEMENTATION]` and proceed only after a human confirms.

### 0.2 Existing-repo rule

Work inside the existing repo only:

```bash
/Users/phantomdarne/Documents/GitHub/caseworks
```

Before any change run:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git status --short
git branch --show-current
```

Confirm the root is the `caseworks` repository. Never run `git init`, `gh repo create`, or `git clone`.

### 0.3 Scope rule

This strategy touches only the public SEO and content surface. Do not modify, refactor, or touch:

- checkout, Stripe, billing, refund, payment flows
- Clerk auth, Supabase auth, session middleware
- the dashboard or portal user roles
- support-saas runtime, agent tools, admin tools
- client data, attorney workflows
- unrelated monorepo apps or shared design tokens

If a fix to a public SEO file unavoidably requires touching a shared module, stop and surface the dependency rather than silently widening scope.

### 0.4 Search-quality rule

Google rewards, in order of weight today:

1. helpful, decision-grade content written for a real reader making one decision
2. topical depth — clusters that cover a topic from pillar down to long-tail leaf
3. E-E-A-T signals — Experience, Expertise, Authoritativeness, Trustworthiness — especially for YMYL legal content
4. freshness on time-sensitive topics where the underlying rule changes
5. clear, reciprocal internal linking that signals the author understands their own taxonomy
6. canonical clarity — one URL per intent
7. clean technical crawl/index health

Every article must help a real reader make one concrete decision and must satisfy E-E-A-T before it ships.

### 0.5 Technical SEO rule

No page may ship if it would re-introduce any of the prior Semrush issues. The full list of guardrails is in §3. The high-level prohibitions:

- invalid `robots.txt` directives
- sitemap entries that redirect, 404, 5xx, are noindex, are canonicalized away, or have zero incoming internal links
- hreflang conflicts or hreflang without real localized routes
- broken internal links, including `/cdn-cgi/l/email-protection`
- articles under 700 meaningful words; policy pages under 250
- titles over 70 characters; meta descriptions over 155
- missing or duplicate H1, title, meta description, or primary keyword across indexable pages in the same cluster
- visible `[VERIFY]` markers, `TODO`, `TBD`, `lorem ipsum`, or boilerplate copy
- wrong-country residue (F-1/SEVIS on UK pages, PGWP/IRCC on US pages outside comparison pages)
- duplicate or cannibalized intent within a cluster

---

## 1. Bird's-eye website diagnosis

### 1.1 Asset map across repos

The YouSafe / MyCaseworks ecosystem is a multi-property legal-document and student-services system. Treat each repo as having a single SEO responsibility:

| Repo | SEO role | Action policy |
|---|---|---|
| `caseworks` | Primary SEO surface. Next.js app with article index, sitemap generation, country hubs, legal guide content, article components, cluster-detection scripts. | All content publishing, sitemap, schema, metadata, and guard scripts live here. |
| `portal` | Member portal. Clerk/Supabase/Stripe, multilingual metadata, marketplace JSON-LD, logged-in functionality. | Do not publish articles here. Touch only if a portal route is explicitly indexable and a fix is needed to stop it polluting the public sitemap. |
| `support-saas` | Live chat / agent / admin platform. | Never used for publishing. Do not modify. |

Public sitemap shows a broad ecosystem of marketing pages, USA pages, Canada pages, checkout pages, legal-document review pages, portal pages, and support pages indexed as one logical site. Implement technical and content changes where the route physically lives, not where the URL surfaces.

### 1.2 Existing content authority audit — where the topical weight already sits

Before adding 84 new articles, recognize what the site already covers. New work should deepen these clusters rather than open new ones:

**United States cluster (strongest)**
- F-1 student visa, refusal recovery, document checklists
- OPT and STEM OPT (I-983, E-Verify, employer change, unemployment days)
- family green card, EB-2 NIW, H-1B bridges
- tenant / renting guides, student life

**Canada cluster (strong)**
- study permit, financial proof, refusal patterns, SOP repair
- PGWP eligibility, DLI lists, full-time status traps
- Express Entry, CRS, PNP (lighter coverage)
- spousal sponsorship, tenant/renting guides

**United Kingdom cluster (uneven)**
- Student Route, Graduate Route, Skilled Worker, spouse/ILR
- Renters' Rights Act 2025/2026 angle (current, fresh, under-served by competitors)
- tenancy/housing/HMO

**Comparison cluster**
- US vs UK vs Canada, OPT vs PGWP, first-month checklist, insurance, SOP, loans, LOR

The site already publishes around all the right topics. The problem is **uneven technical quality, sitemap and indexing noise, 1,193 orphaned scaled pages, residual boilerplate, and missing E-E-A-T signals on legal content**. Topical authority is more about ranking what already exists than producing new pages. The 84-article plan is therefore deliberately a "fill the gaps + create urgency hooks" plan, not a "cover every topic" plan.

### 1.3 The real problem

This is a YMYL legal-information property with a content footprint big enough to rank, that does not currently rank because:

1. **1,193 orphaned indexable pages** dilute crawl budget and make Google unsure which URL is canonical for a query.
2. **40 pages with low text-to-HTML ratio** signal thin or JS-rendered content — Google distrusts both.
3. **33 hreflang conflicts** create indexing ambiguity Google resolves by picking neither.
4. **8 broken internal links** + the `cdn-cgi` email-protection links waste link equity.
5. **No author-level E-E-A-T signals** on legal pages, which is the single biggest YMYL ranking drag.
6. **No structured data beyond basic OG tags**, missing easy rich-result wins (FAQ, Article, BreadcrumbList).

Fixing these six issues is worth more than 84 fresh articles. The plan below does both, in that order.

---

## 2. Semrush technical debt — prioritized by ranking impact

The latest Semrush audit reported:

- Site Health: 81%
- AI Search Health: 95%
- 56 pages crawled, 52 with issues, 2 broken, 2 healthy

### 2.1 P0 blockers — ship Week 0 (infrastructure week)

These are the issues blocking everything else. Until they are fixed, new content cannot rank no matter how good it is.

| Issue | Count | Why P0 | Implementation response |
|---|---:|---|---|
| Orphaned sitemap pages | 1,193 | Dilutes crawl budget, signals low-quality site to Google. | Remove orphans from sitemap. Rescue valuable ones by linking from a hub. Delete or `noindex` the rest. See §10.4 orphan rescue protocol. |
| Incorrect pages in sitemap | 15 | Tells Google to crawl URLs that 404, redirect, or are non-canonical — destroys trust. | Sitemap must include only canonical, indexable, 200-status pages. See §3.2. |
| Broken internal links | 8 | Wastes link equity, signals abandonment. | Run link-check guard. Repair targets or remove links. |
| `/cdn-cgi/l/email-protection` 4xx links | 2 | Cloudflare email-obfuscation link leak; renders as 4xx to crawlers. | Replace with `mailto:` or contact form. Block pattern in guard. |
| Invalid `robots.txt` directives | 1 | Unsupported directives can cause search engines to misinterpret the file. | Remove `Content-Signal: search=yes,ai-train=no` and any other non-standard directive. |

### 2.2 P1 quality issues — ship across Weeks 0–2

| Issue | Count | Why P1 | Implementation response |
|---|---:|---|---|
| Long titles (>70 chars) | 30 | Truncated SERP snippets hurt CTR. | Enforce ≤70 in metadata guard. Target 55–62. |
| Low text-to-HTML ratio | 40 | Thin or JS-heavy pages. | Force server-rendered article body. Add minimum-word-count guard. |
| Only one incoming internal link | 14 | Pages with one link rarely rank. | Hub/spoke link policy. See §10. |
| Hreflang conflicts | 33 | Causes Google to pick neither variant. | Emit no hreflang until real localized routes exist. See §3.6. |
| Low word-count refund policy | 2 | Thin legal page = E-E-A-T drag for the whole subdomain. | Expand each to ≥400 meaningful words with clear policy bullets. |
| Large `/sitemap` HTML pages | 2 | Bloated human sitemap, crawl waste. | Split or paginate. XML sitemap stays machine-only. |

### 2.3 P2 cleanup — across Month 1

| Issue | Count | Implementation response |
|---|---:|---|
| HSTS notices | 2 | Hosting/header config — flag, don't fix in app code unless headers are managed in repo. |
| 4XX pages (non-cdn-cgi) | 0 net new | Continuous monitoring via `seo:links`. |

### 2.4 Fix order rationale

Doing P0 before P1 reorders the value of the same 84 articles. A new long-tail article published into a clean crawl/index environment can rank in 14–60 days. Published into the current state, the same article fights 1,193 orphans for crawl budget and is likely to be discovered, then ignored.

---

## 3. Technical SEO guardrails — implementation specification

Create or extend a unified set of SEO guard scripts. If similar scripts already exist, extend rather than duplicate.

### 3.1 The guard scripts

```text
scripts/seo-audit-guard.mjs          # orchestrator — runs the other checks
scripts/check-sitemap-health.mjs     # sitemap composition rules
scripts/check-internal-links.mjs     # internal link integrity
scripts/check-metadata-uniqueness.mjs # title/meta/H1/primary-keyword uniqueness
scripts/check-content-quality.mjs    # word count, placeholder, country-residue
scripts/check-schema-validity.mjs    # JSON-LD presence and shape
```

Add package scripts:

```json
{
  "scripts": {
    "seo:guard":   "node scripts/seo-audit-guard.mjs",
    "seo:sitemap": "node scripts/check-sitemap-health.mjs",
    "seo:links":   "node scripts/check-internal-links.mjs",
    "seo:meta":    "node scripts/check-metadata-uniqueness.mjs",
    "seo:content": "node scripts/check-content-quality.mjs",
    "seo:schema":  "node scripts/check-schema-validity.mjs"
  }
}
```

Each script exits with code 1 on any failed check, emits a JSON report to `.seo/reports/<script>-<ISO-date>.json`, and prints a human summary to stdout. Reports are gitignored.

### 3.2 Sitemap rules — the inclusion contract

A URL appears in `/sitemap.xml` if and only if **all** of:

- responds 200
- has `<meta name="robots" content="index">` or absent robots meta (default index)
- canonical URL equals the URL itself (self-canonical)
- has at least one incoming internal link from an indexable page, OR is an explicitly whitelisted hub
- has no visible `[VERIFY]` marker or placeholder string in rendered body
- has a title, H1, and meta description that pass uniqueness checks
- is not under any of: `/checkout`, `/cdn-cgi`, `/api`, `/auth`, `/dashboard`, `/portal/app`, `/support/admin`, `/_next`, `/account`

The `check-sitemap-health.mjs` script enumerates the route manifest, derives the candidate URL set, applies the inclusion contract, and fails if the generated sitemap contains any URL that fails the contract.

### 3.3 Metadata rules

Hard fails:

- title missing
- title length > 70 characters
- title length < 25 characters (almost always a sign of a placeholder)
- two indexable pages share an exact title
- H1 missing or duplicated across two indexable pages
- meta description missing
- meta description > 155 characters or < 70 characters
- primary keyword duplicated within the same cluster on two indexable pages
- canonical URL missing on indexable page
- canonical URL points to a noindex, redirected, or 404 URL

Soft warnings (logged, not blocking):

- title does not contain the page's primary keyword in the first 60 characters
- meta description does not contain the primary keyword
- title contains the word "Guide" or "Ultimate" — usually correlates with generic, low-CTR titles

### 3.4 Content guardrails

Hard fails:

- visible `[VERIFY` marker anywhere in rendered body
- visible placeholder strings: `TODO`, `TBD`, `lorem ipsum`, `[answer must match visible body copy]`, the literal sequence `documents, deadlines, official sources, common pitfalls, FAQs`
- article body < 700 meaningful words (excludes nav, footer, breadcrumbs, code blocks, callouts), unless explicitly marked `kind: hub | policy | utility | service`
- hub page < 400 meaningful words
- policy page < 250 meaningful words
- FAQ schema includes a question/answer not visibly present on the page (Google requires schema match)
- country residue outside `kind: comparison`:
  - UK pages contain F-1, SEVIS, OPT, USCIS, I-20, PGWP, IRCC as controlling terms
  - US pages contain PGWP, IRCC, UKVI, ILR as controlling terms
  - Canada pages contain F-1, SEVIS, USCIS, I-20, I-765, H-1B, UKVI, ILR

### 3.5 Internal link guardrails

Hard fails:

- any internal link returns 404 or 5xx
- any internal link matches `/cdn-cgi/l/email-protection`
- an indexable article page has fewer than three incoming internal links from indexable pages
- a new article does not link out to all four of:
  - its parent pillar
  - 2–4 sibling pages in the same cluster
  - one service / intake / CTA page
  - one official source (government, university, regulator)

Soft warnings:

- exact-match anchor text appears more than three times on the same page
- the same internal link appears more than three times on the same page

### 3.6 Hreflang policy

**Current state: emit no hreflang.** The 33 conflict count came from emitting hreflang for URLs that did not have true localized equivalents.

**Reintroduction criteria** — all must be true before any hreflang is emitted:

- the localized URLs are server-rendered, with translated body content (not just translated UI chrome)
- every page in the hreflang set is canonical to itself
- every page in the set includes a self-referencing `<link rel="alternate" hreflang="x-default">` and one entry per supported locale
- every URL is fully qualified (https + host)
- the set is fully reciprocal: page A points to B and C, B points to A and C, C points to A and B

The guard refuses to emit any hreflang tag unless all criteria are met.

### 3.7 Core Web Vitals and page-experience budget

Per-route soft budgets. Failures are warnings during build, blockers after Month 1 once Phase A is shipped.

| Metric | Budget | Notes |
|---|---|---|
| LCP | ≤ 2.5 s on slow 4G | Article hero must be server-rendered. |
| INP | ≤ 200 ms | No layout-shifting interactive widgets above the fold. |
| CLS | ≤ 0.1 | Images must have explicit width/height or `aspect-ratio`. |
| Article body | Server-rendered | No `useEffect`-injected article content. |
| Above-the-fold image | ≤ 200 KB | Next.js `<Image>` with `priority` and `sizes`. |
| Page weight (HTML+CSS+JS, no images) | ≤ 350 KB gzipped | Strip unused client components. |

### 3.8 Schema.org structured data — required JSON-LD by page kind

The `check-schema-validity.mjs` script verifies presence and shape. Schemas must be emitted server-side. Recommended shapes:

**Article (every article page)**
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "<title without site suffix, ≤110 chars>",
  "datePublished": "<ISO>",
  "dateModified": "<ISO of lastVerifiedAt>",
  "author": {
    "@type": "Person",
    "name": "<author name>",
    "url": "https://<host>/authors/<slug>"
  },
  "publisher": {
    "@type": "Organization",
    "name": "YouSafe",
    "logo": { "@type": "ImageObject", "url": "https://<host>/logo.png" }
  },
  "mainEntityOfPage": "<canonical URL>",
  "image": "<og image absolute URL>",
  "about": "<primary keyword>",
  "inLanguage": "en"
}
```

**FAQPage (only if the page has 3–8 visible FAQ pairs at the bottom)**
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "<visible Q exact text>",
      "acceptedAnswer": { "@type": "Answer", "text": "<visible A exact text>" }
    }
  ]
}
```

**BreadcrumbList (every article and hub)**
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://<host>/" },
    { "@type": "ListItem", "position": 2, "name": "<Country>", "item": "https://<host>/<country>/" },
    { "@type": "ListItem", "position": 3, "name": "<Cluster>", "item": "https://<host>/<country>/<cluster>/" },
    { "@type": "ListItem", "position": 4, "name": "<Article title>" }
  ]
}
```

**HowTo (only for procedural guides — checklists, application steps, refusal recovery)**
- requires `step`, `totalTime`, optional `tool`, `supply`
- emit only when the article body is a numbered procedure

**Person (every author hub page at `/authors/<slug>`)**
- `name`, `jobTitle`, `worksFor`, `knowsAbout` (array of cluster topics), `sameAs` (LinkedIn, X, university profile, bar association profile if attorney)

**Organization (homepage and root layout)**
- `name`, `legalName`, `url`, `logo`, `sameAs`, `contactPoint`

**LegalService (each service landing page — tenancy review, document review, SOP repair, etc.)**
- `name`, `serviceType`, `areaServed`, `provider`, `offers` (price range)

The guard fails if any indexable article page lacks Article + BreadcrumbList JSON-LD, or if a page declares FAQPage schema whose Q/A text does not appear verbatim in the rendered DOM.

---

## 4. E-E-A-T and YMYL compliance layer

This section is the most important addition over v1. Immigration and tenancy advice are Your-Money-Your-Life topics. Google's quality raters and ranking systems demand visible expertise signals. **Sites without these signals do not rank for YMYL terms regardless of on-page SEO quality.**

### 4.1 Why this is non-negotiable

Search Quality Rater Guidelines explicitly tell raters to lower a page's rating when:

- the author is anonymous or has no verifiable expertise
- there is no "about" or editorial policy
- claims are unsourced
- the page is undated or "last updated" is missing
- there are no citations to primary sources (government, regulator, university)

Most competing immigration content fails on all five. Fixing E-E-A-T is therefore both a defensive necessity and a competitive moat.

### 4.2 Author entity requirements

Create author hub pages at `/authors/<slug>` for every byline used on the site. Each page must include:

- full legal name and credentials (J.D., LL.M., RCIC number, OISC level, etc.) — if no credentials, the byline should be a researcher/editor role explicitly, not an "expert" pose
- short biography, 80–150 words
- the topics the author writes about (this becomes `knowsAbout` in Person schema)
- a photograph
- links to verifiable external profiles: LinkedIn, bar association directory, university page, regulator directory
- Person JSON-LD with `sameAs` array
- a list of articles by the author (paginated if >20)

The byline on each article links to the author hub page. The article also displays "Last verified: <date>" — not a fake "last updated" — and a "Reviewed by: <reviewer>" line if a credentialed reviewer signed off.

If a credentialed reviewer is not available for an article, the byline must say "Researched and edited by" rather than implying legal authorship. This is more honest and avoids YMYL penalties for false expertise claims.

### 4.3 Page-level trust signals — required on every article

Every article body must include, in this order:

1. **Byline** with author hub link, "Reviewed by" line if applicable, "Last verified" date.
2. **Plain-language explainer disclaimer**, one sentence: "This article explains how the <rule> works as of <month year>. It is not legal advice for your specific case."
3. **Inline citations** to primary sources: every rule, deadline, fee, or threshold links inline to the government or regulator page that establishes it. No claim about a fee or deadline ships without a primary-source link.
4. **"Official sources" box** at the end of the body, listing all government/regulator pages cited, with the verification date next to each.
5. **"When to get document review"** callout linking to the relevant service page.
6. **"Last verified" timestamp** also rendered at the bottom of the body.

### 4.4 Citation and source-anchoring rules

- Government or regulator domain only for procedural facts (uscis.gov, ircc.gc.ca, gov.uk, eligibility.canada.ca, sec.state.tx.us, etc.).
- University international office pages allowed for general orientation context, not for legal claims.
- Reddit, forums, paid blogs, and AI-generated content are never citable sources.
- Every cited URL is checked in `check-internal-links.mjs` (external link health is logged but not blocking).
- The verification date is the date the cited page was last manually re-opened and confirmed to still say what the article claims it says.

### 4.5 "Reviewed by" workflow

A credentialed reviewer is one of: a licensed attorney in the relevant jurisdiction, an RCIC (Canada), an OISC-registered adviser (UK), or a published academic in immigration law. If no reviewer is available, the byline uses the honest researcher framing instead. Either is acceptable. Pretending is not.

If a reviewer signs off, the article frontmatter records `reviewer`, `reviewerCredential`, `reviewedAt`. The byline renders accordingly.

### 4.6 Required editorial-policy pages

Create the following public pages if not already present, and link to each from the global footer:

| Path | Purpose | Min words |
|---|---|---:|
| `/editorial-policy` | How content is researched, reviewed, dated, corrected. | 600 |
| `/about` | Who YouSafe is, what credentials the team holds, what we don't do (we don't represent clients in court, etc.). | 500 |
| `/contact` | Contact form + plain-text email. No `cdn-cgi/l/email-protection`. | 250 |
| `/corrections-policy` | How to flag an error; commitment to public correction notes. | 300 |
| `/terms`, `/privacy`, `/refund-policy` | Existing — expand `/refund-policy` to ≥400 meaningful words. | 400 |

All editorial-policy pages are added to the sitemap (they are canonical, indexable, linked from the footer) and are excluded from the article registry.

---

## 5. Free SEO research stack — Friday research workflow

Use only free tools. Do not rely on any single tool — each is biased.

### 5.1 Tools by job-to-be-done

| Job | Tool | What to extract |
|---|---|---|
| Validate that a query already gets impressions on the site | Google Search Console | Pages ranking 8–30 (quick-win zone); queries with impressions but no clicks; impressions over 28 days. |
| Find seasonal demand or 2026 rule-change spikes | Google Trends | Country filter, 12-month and 5-year compare; spot "PGWP refusal", "Renters Rights Act", "OPT unemployment days" velocity. |
| Generate long-tail and question variants from a seed | Ahrefs Free Keyword Generator | Pull top 100 ideas. Filter to ≤10-word queries with specific noun phrases. |
| Estimate keyword difficulty (cheap) | Ahrefs Free Keyword Difficulty Checker | Use only as a tiebreaker. Difficulty estimates differ between tools; never trust a single number. |
| Manual SERP inspection | Ahrefs / Semrush free SERP checker, plus an incognito Google search with country region set | Look for: forums, outdated blogs, thin university pages, government-only results with no practical step-by-step — these are the gaps to fill. |
| Find smaller competitors (not just government) | Semrush free Competitor Finder | Targets where backlink profile is reachable. |
| Pull "questions" and "related" keywords for a topic | Semrush free Keyword Overview, AlsoAsked, AnswerThePublic free | Use for the "FAQ" section of the article. |
| Audit own site weekly | Screaming Frog free (500 URL crawl) | Titles, meta, H1s, canonicals, noindex, broken links, hreflang, orphan risk, response codes. |
| Cross-check own indexing | Bing Webmaster Tools | Free, faster crawl, complementary to GSC. |
| Spot pain points in real student voice | Reddit SERP review + r/immigration / r/iwantout / r/UKvisa / r/CanadaImmigration | Convert genuine pain into article H2s. Never quote without attribution. |
| Verify rules | Government domains only | uscis.gov, ircc.gc.ca, gov.uk; university international office pages for context. |

Optional supplements: Ubersuggest free tier (3 searches/day), Keywords Everywhere (paid but cheapest paid option), SimilarWeb free for traffic share, Wayback Machine for tracking competitor content age.

### 5.2 Friday 90-minute research routine

Every Friday, before drafting Monday's batch:

1. **(15 min) GSC quick-win sweep.** Export the last 28 days. Filter pages with position 8–30 and impressions > 50. These become refresh candidates or sibling-link targets for the upcoming batch.
2. **(15 min) Seed expansion.** For each of the 7 planned slugs, pull the Ahrefs free keyword generator with the primary keyword as seed. Save the top 20 long-tail variants per slug into the article frontmatter `secondaryKeywords`.
3. **(15 min) SERP inspection.** Open each of the 7 primary queries in incognito with the correct country region. Record: top 3 results, top SERP feature (PAA, featured snippet, video, sitelinks), and whether the SERP is forum/government/blog-dominated.
4. **(15 min) Question harvesting.** Use AlsoAsked + Google "People also ask" + Reddit for each primary query. Extract 4–8 questions per slug. These become the article's FAQ block (which must match visible body copy).
5. **(15 min) Official source pull.** For each of the 7 slugs, identify the 2–4 primary-source URLs the article will cite. Confirm each loads and says what we expect. Record the verification date.
6. **(15 min) Risk and decision check.** For each slug, write a one-sentence "decision this article helps the reader make" and a one-sentence "what could go wrong if the article is sloppy." If either sentence is hard to write, the slug is not ready for Monday.

The output of Friday research is `content/seo-quarter-plan/week-NN/research.json` containing all the above. Drafting begins from this file.

### 5.3 Competitor monitoring — named competitors per cluster

Track the same competitors every month so the data is comparable. Suggested starting set; revise after Month 1:

**UK tenancy / Renters' Rights**
- shelter.org.uk
- citizensadvice.org.uk
- gov.uk landlord / tenant pages
- nus.org.uk (student-housing focused)
- the largest property-management blogs (LandlordZONE, OpenRent blog)

**US F-1 / OPT / STEM OPT**
- uscis.gov, ice.gov/sevis
- studyinthestates.dhs.gov
- nafsa.org
- shorelight.com / shorelight blog (commercial competitor)
- immi-usa.com or similar specialized firm blogs

**Canada study permit / PGWP**
- canada.ca / IRCC
- cicnews.com
- canadavisa.com / canadavisa forum
- moving2canada.com
- specific large RCIC-firm blogs

For each cluster, run a monthly Screaming Frog crawl against the top 3 competitors (free 500-URL limit applies per crawl, run separately). Track: new pages, refreshed pages, internal-link changes. The competitor diff goes into the monthly review.

### 5.4 AI search visibility tracking

Generative search (Google AI Overviews, Perplexity, ChatGPT browse, Claude with web search) increasingly intercepts queries before they reach the SERP. Tracking AI citation is the new ranking.

Weekly: for each of the upcoming batch's 7 primary queries, run the query in:
- Google with AI Overviews enabled (US, UK, CA region)
- Perplexity
- ChatGPT web search
- Claude with web search

Record: was a result cited? Which domain? Is YouSafe ever cited?

Articles ranked for AI citation share three traits:
1. **Direct, factual answer in the first 200 words** with the primary entity named.
2. **Inline citations to primary sources** that the AI can verify and re-cite.
3. **Clean Article + FAQPage JSON-LD** with the answer schema-marked.

The article template in §9 builds these in by default.

---

## 6. Fast-ranking keyword selection formula

Score every candidate 0–100. Only publish at 70+.

### 6.1 Scoring rubric (100 pts)

| Factor | Weight | What earns the points |
|---|---:|---|
| Existing topical fit | 25 | The site already has a pillar and at least 3 sibling pages in the cluster the keyword belongs to. |
| Long-tail specificity | 20 | The query names a specific document, deadline, refusal reason, city, route, or year. Generic head terms score 0. |
| Freshness / legal change | 15 | The query is tied to a 2025/2026 rule change, new requirement, or active public confusion. |
| Lower SERP competition | 15 | Top 10 contains at least 4 of: forums, outdated blogs (>18 months), thin university pages, generic government pages without practical guidance. |
| E-E-A-T fit | 10 | YouSafe can cite primary sources and provide a "reviewed by" or credentialed researcher byline. |
| Commercial / service fit | 10 | Naturally connects to document review, intake, tenancy review, or attorney review. |
| Internal-link supply | 5 | At least 1 pillar and 3 sibling articles can link to the new page on day one. |

### 6.2 "Shippable this Monday" gate

A scored-70+ keyword is eligible for next Monday's batch only if **all** of:

- the parent pillar exists and is indexable
- the official sources required to cite the claim load and say what we need them to say
- the article can be drafted to ≥800 meaningful words with concrete, decision-grade content (not padded)
- at least 3 internal-link sources exist on the site to link to it on day one
- the article has a credentialed reviewer assigned or an honest researcher byline ready

Failing any gate → push the slug to a later week, do not pad the batch with a weaker slug.

### 6.3 Disqualifiers

A keyword is excluded regardless of score if:

- it overlaps an existing indexable URL with the same intent (cannibalization)
- the only honest answer is "consult an attorney" with no procedural depth
- the claim cannot be sourced to a primary government / regulator page
- the page would require making claims about approval rates, processing times, or fees without official source verification

---

## 7. The 20 fastest keyword opportunities — enhanced

The 20 below are validated against the §6 rubric. For each: primary keyword, proposed URL, cluster, search intent, target SERP feature, word-count band, top-3 competitor type observed, and the principal risk. These numbers are starting hypotheses to validate on Friday before publishing — they are not final SEO truth.

### 7.1 Master table

| # | Keyword | Proposed URL | Cluster | Intent | Target SERP feature | Words | Top SERP competitor type | Principal risk |
|---:|---|---|---|---|---|---:|---|---|
| 1 | Ground 4A student possession notice explained | `/uk/ground-4a-student-possession-notice` | UK tenancy | Informational, high urgency | Featured snippet (definition) + PAA | 1,400 | Citizens Advice, Shelter, Gov.uk | Renters' Rights Act commencement dates must be cited accurately. |
| 2 | Renters Rights Act student HMO one tenant leaves | `/uk/renters-rights-student-hmo-notice` | UK tenancy | Informational + transactional (joint tenancy review) | PAA + sitelinks | 1,500 | Shelter, NUS, OpenRent blog | Joint vs sole tenancy distinction must be precise. |
| 3 | Can a landlord ask students for 12 months rent upfront UK 2026 | `/uk/student-rent-upfront-rules-2026` | UK tenancy | Informational, conversion-adjacent | Featured snippet (yes/no + caveat) | 1,200 | Citizens Advice, Reddit, property blogs | Discrimination angle (international students) needs cited basis. |
| 4 | London student HMO licence check tenancy rights | `/uk/london-student-hmo-licence-check` | UK tenancy / local | Informational + local | Local pack possible | 1,400 | Council websites, Shelter, Reddit | Each London borough has different HMO rules — must clarify scope. |
| 5 | Cardiff student occupation contract rights | `/uk/cardiff-student-occupation-contract` | UK tenancy / Wales | Informational | PAA | 1,300 | Shelter Cymru, Cardiff University | Wales-specific law (Renting Homes Wales Act) — do not conflate with England. |
| 6 | Edinburgh private residential tenancy student deposit | `/uk/edinburgh-student-prt-deposit` | UK tenancy / Scotland | Informational | PAA | 1,300 | mygov.scot, Shelter Scotland | Scottish tenancy law is materially different; do not borrow English content. |
| 7 | Student tenancy guarantor agreement review UK | `/uk/student-tenancy-guarantor-agreement-review` | UK tenancy / service | Transactional | Sitelinks to service page | 1,200 | Property blogs, OpenRent, NUS | Must connect to a real service page with pricing. |
| 8 | STEM OPT employer refuses to sign I-983 | `/us/student-visas/stem-opt-employer-refuses-i-983` | US OPT/STEM OPT | Informational, very high urgency | Featured snippet (steps) + PAA | 1,600 | USCIS, university DSO pages, immi blogs | Conflating "refuses" with "delayed" undercuts trust. |
| 9 | OPT unemployment days unpaid volunteer work | `/us/student-visas/opt-unpaid-volunteer-unemployment-days` | US OPT | Informational | Featured snippet (table) | 1,300 | USCIS policy memos, NAFSA, university DSO | The volunteer vs employment line is fact-heavy; must cite USCIS policy. |
| 10 | SEVIS terminated for unauthorized employment | `/us/student-visas/sevis-terminated-unauthorized-employment` | US F-1 | Informational + service-adjacent | PAA + featured snippet | 1,700 | DSO pages, immi firm blogs, Reddit | Reinstatement vs new SEVIS records is a legal distinction; do not oversimplify. |
| 11 | F-1 visa refusal after community college acceptance | `/us/student-visas/f1-refusal-community-college` | US F-1 | Informational, very high urgency | PAA | 1,500 | Consulate pages, immi firm blogs | "214(b)" framing must be accurate; do not promise outcomes. |
| 12 | F-1 sponsor sudden deposit source of funds | `/us/student-visas/f1-sponsor-bank-deposit-interview` | US F-1 | Informational + document service | Featured snippet (checklist) | 1,400 | Consulate FAQ, study-abroad blogs | Bank affidavit format varies by consulate; do not over-specify. |
| 13 | STEM OPT remote work site visit employer address | `/us/student-visas/stem-opt-remote-work-site-visit` | US STEM OPT | Informational | PAA | 1,400 | NAFSA, USCIS site-visit Q&A | Employer address vs work-from-home distinction is the whole article. |
| 14 | Canada study permit sudden deposit source of funds | `/ca/study-permit-sudden-deposit-source-of-funds` | CA study permit | Informational, very high urgency | PAA + featured snippet | 1,500 | IRCC, canadavisa forum, RCIC blogs | "Sudden deposit" is a refusal cliché — must cite real refusal letter patterns generically. |
| 15 | Canada study permit LOA verification delay | `/ca/study-permit-loa-verification-delay` | CA study permit | Informational, time-sensitive | PAA | 1,300 | IRCC, cicnews, university websites | New PAL/TAL system context required — fresh 2024/2025 process. |
| 16 | PAL TAL required for inside-Canada study permit | `/ca/pal-tal-inside-canada-study-permit` | CA study permit | Informational | Featured snippet (definition) | 1,400 | IRCC, cicnews, RCIC firms | Provincial cap allocation rules change; date and cite. |
| 17 | PGWP eligible DLI but program not eligible | `/ca/pgwp-dli-program-eligibility-check` | CA PGWP | Informational, very high stakes | Featured snippet (decision tree) | 1,600 | IRCC, DLI list, canadavisa | The "eligible program" 2024 changes must be explicit and dated. |
| 18 | PGWP refused because full-time status gap | `/ca/pgwp-full-time-status-gap-refusal` | CA PGWP | Informational, very high urgency | PAA | 1,500 | IRCC, RCIC blogs, canadavisa | "Authorized leave" vs "unauthorized gap" distinction is the whole article. |
| 19 | Canada study permit refusal SOP repair | `/ca/study-permit-refusal-sop-reapply` | CA study permit | Informational + service | Sitelinks to service | 1,500 | RCIC blogs, study-abroad sites | Avoid the saturated "SOP sample" SERP; this is "after refusal" angle. |
| 20 | Quebec study permit CAQ PAL proof of funds 2026 | `/ca/quebec-study-permit-caq-proof-of-funds-2026` | CA Quebec / study permit | Informational | PAA + featured snippet | 1,500 | mifi.gouv.qc.ca, IRCC, RCIC blogs | Quebec is its own system; CAQ must be center-stage, not a footnote. |

### 7.2 Cluster summary

- **UK tenancy:** 7 of 20. Site has the most current-events advantage here (Renters' Rights Act). Lowest competition because student-specific angles are under-served by Shelter/Citizens Advice (who write for adults, not students with HMO + visa overlay).
- **US F-1 / OPT / STEM OPT:** 6 of 20. Site already has pillars. Long-tail urgent traps are the gap.
- **Canada study permit / PGWP:** 7 of 20. Site has pillars. PAL/TAL/Quebec/full-time-gap angles are fresh and under-covered by competitors.

### 7.3 Risk notes — read before drafting any of the 20

- **Date everything.** UK Renters' Rights Act commencement, Canada PAL/TAL provincial caps, USCIS STEM OPT policy memo dates — each gets a verified inline date in the article. The article displays a "Last verified: <date>" stamp at top and bottom.
- **Do not promise outcomes.** "If you do X, your visa will be approved" is YMYL-violating. "If you do X, you remove refusal reason Y identified in IRCC's <policy doc>" is fine.
- **Do not invent fee or processing-time numbers.** Cite the official page that gives them, with the verification date.
- **City/country pages must be specific to that jurisdiction.** Edinburgh PRT content cannot borrow England's AST law. Quebec CAQ content cannot borrow federal IRCC procedure.

---

## 8. Three-month editorial plan

### 8.1 Publishing rhythm

- 7 articles published every Monday.
- One branch = one weekly batch. One PR per batch.
- Friday before publishing: research + QA + guard runs (see §5.2 and §12).
- Saturday/Sunday: drafting and review.
- Monday morning: final guard run + merge + deploy + GSC sitemap submission + URL inspection.
- End of each month: a review file is produced; the next month's plan is reconfirmed or adjusted based on data.

### 8.2 Month 1 — technical trust + urgent student legal issues

**Goal:** ship the technical foundation, then publish three cluster-deep weeks plus one comparison/conversion week.

#### Week 0 (infrastructure-only week, parallel to Week 1 if calendar allows)

Branch: `seo-technical-foundation-and-quarter-plan`

Deliverables:
- the six SEO guard scripts in §3.1, all passing
- sitemap inclusion contract enforced
- 1,193 orphan triage: rescue ≤80 valuable orphans by hub-linking; `noindex` or delete the rest; sitemap rebuilt
- `cdn-cgi/l/email-protection` swept and replaced
- `robots.txt` cleaned
- the `content/seo-quarter-plan/` directory with all roadmap files
- the schema.org components (Article, BreadcrumbList, FAQ, HowTo, Person) wired into existing article components
- `/authors/<slug>` route scaffolded with at least one real author page
- `/editorial-policy`, `/corrections-policy`, `/about` (expanded), `/refund-policy` (expanded) shipped

Acceptance: `npm run seo:guard` exits 0; Semrush re-crawl on the changed surface shows zero new errors of any prior type.

#### Week 1 — UK Renters' Rights / student tenancy

Branch: `seo-week-01-uk-tenancy`

Articles 1–7 from §7.1.

Required internal links:
- parent pillar: `/uk/tenancy/`
- student child: `/uk/renters-rights-international-students`
- service: `/uk/tenancy-agreement-review`
- deposit: `/uk/deposit-dispute-letter-2026`
- council tax: `/uk/council-tax-international-students-by-city`

Each article links to the parent + 2–4 siblings (one of which is another Week 1 article) + the service + one official source (Shelter, Citizens Advice, or gov.uk).

#### Week 2 — US F-1 / OPT / STEM OPT urgent traps

Branch: `seo-week-02-us-f1-opt`

Articles 8–14 (planned), substituting one if research disqualifies:
1. STEM OPT employer refuses to sign I-983
2. OPT unemployment days unpaid volunteer work
3. SEVIS terminated for unauthorized employment
4. F-1 visa refusal after community college acceptance
5. F-1 sponsor sudden deposit source of funds
6. STEM OPT remote work site visit employer address
7. OPT EAD wrong dates correction request

Required internal links: F-1 pillar, OPT/STEM OPT pillar, F-1 rejection recovery, SEVIS termination/reinstatement, STEM OPT E-Verify, STEM OPT job change, intake.

#### Week 3 — Canada study permit / PGWP refusal and evidence traps

Branch: `seo-week-03-ca-study-permit-pgwp`

Articles 14–20 from §7.1.

Required internal links: `/ca/study-permit-document-checklist/`, `/ca/study-permit-financial-proof-2026/`, `/ca/study-permit-renewal-2026/`, `/ca/pgwp-eligibility-2026/`, `/ca/pgwp-document-checklist/`, `/guide/study-permit-guide`, intake.

#### Week 4 — comparison and conversion support

Branch: `seo-week-04-comparison-and-conversion`

Refresh or publish:
1. OPT vs PGWP for students choosing US or Canada (refresh if exists)
2. UK vs Canada student work rights after graduation
3. US vs UK student housing risk for international students
4. Study permit vs F-1 proof of funds differences
5. Graduate Route vs PGWP vs STEM OPT
6. International student document review checklist
7. How to choose a legal document review service

Rule: do not duplicate existing comparison pages. Where a comparison page already owns the intent, refresh in place rather than create a competing URL.

### 8.3 Month 2 — post-study pathways

| Week | Cluster | Working topic seeds |
|---:|---|---|
| 5 | Canada Express Entry / CRS / PNP after study | French language for CRS, CEC after PGWP, OINP/AINP/BC PNP for graduates, EE draws by category 2026, CRS recalculation after PGWP, age-32 ticking-clock decision, refusal recovery in EE |
| 6 | US green card after OPT / EB-2 NIW / H-1B bridge | NIW for STEM PhDs, H-1B cap-exempt routes, day-1 CPT risk, change of status timing, EB-2 vs EB-3 downgrade, advance parole timing for OPT-to-green-card |
| 7 | UK Graduate Route / Skilled Worker / salary thresholds | 2026 salary threshold updates, skilled worker sponsor licence reality, switching from Graduate to Skilled Worker, salary discount cases, going-rate calculation for graduates |
| 8 | Spouse / dependant routes across US, UK, Canada | F-2 vs J-2 work, UK partner visa from inside UK, spousal sponsorship open work permit, dependant work rights for international students |

Each week's 7 slugs are finalized in the Friday research routine of the prior week, using GSC quick-win data from the previous month's published articles.

### 8.4 Month 3 — local authority and refresh week

| Week | Cluster | Working topic seeds |
|---:|---|---|
| 9 | City housing and tenant rights | Manchester student HMO, Birmingham deposit dispute, Toronto N4 student tenant, Vancouver fixed-term tenancy student, Boston student lease, NYC student lease guarantor |
| 10 | Country-of-origin refusal patterns | Nigeria F-1 refusal patterns, India F-1 sponsor refusal, Pakistan study permit refusal, Bangladesh study permit refusal, Vietnam refusal, China refusal — each cites only verified consulate/IRCC public guidance, never personal anecdotes presented as data |
| 11 | Document templates and checklists | SOP after refusal, financial undertaking letter, no-objection letter, accommodation letter, university financial guarantee, refusal-response letter |
| 12 | Refresh, merge, canonicalize | Driven entirely by Month 1+2 GSC data, not by topic guess. See §8.5. |

### 8.5 Refresh schedule for existing top pages — the freshness engine

In addition to publishing 7 new articles per week, Claude Code maintains a refresh queue:

- Every article older than 180 days is flagged for "refresh eligibility" in the registry.
- Each Monday batch may include up to 2 refresh articles in place of new articles if GSC data shows higher ROI from a refresh.
- A refresh is a real refresh: re-verify every cited source, update the verification date, rewrite at least 20% of the body to add new information or sharpen the answer, update the meta description, bump `dateModified`. A bumped date with no body change is dishonest and will be detected.
- Week 12 is explicitly a refresh-only week (no new articles), driven by GSC data.

The 1,193 orphan rescue from Week 0 is the first refresh pass. The full refresh queue takes 6–9 months to clear and runs in parallel with new publishing thereafter.

---

## 9. Article template — production-grade

### 9.1 Frontmatter / registry schema

Every article file begins with this frontmatter. Missing fields fail the registry check.

```yaml
slug:                          # /us/student-visas/stem-opt-employer-refuses-i-983
country:                       # US | UK | CA | comparison
cluster:                       # us-opt | uk-tenancy | ca-pgwp | etc.
parentPillar:                  # /us/student-visas/stem-opt/
kind:                          # article | hub | service | comparison | policy | utility
primaryKeyword:                # one phrase, unique within cluster
secondaryKeywords:             # 8–20 long-tail and question variants
searchIntent:                  # informational | transactional | navigational | comparison
funnelStage:                   # awareness | consideration | decision | post-purchase
reader:                        # one sentence: who this is for
decision:                      # one sentence: the decision this article helps make
officialSources:
  - label:
    url:
    verifiedAt:                # ISO date the URL was last manually re-opened
author:                        # references /authors/<slug>
reviewer:                      # references /authors/<slug>, or null
reviewerCredential:            # e.g. "Attorney, NY Bar #12345" or "RCIC R##" or null
reviewedAt:                    # ISO date or null
lastVerifiedAt:                # ISO date
title:                         # ≤70 chars, target 55–62
metaDescription:               # ≤155 chars, target 130–150
h1:                            # unique
canonicalUrl:                  # absolute URL
index:                         # true | false (default true for kind: article)
reviewStatus:                  # draft | reviewed | published
schemaTypes:                   # [Article, BreadcrumbList] + optional [FAQPage, HowTo]
internalLinks:
  parent:                      # one URL
  siblings:                    # 2–4 URLs
  serviceOrIntake:             # one URL
  officialSource:              # one URL
gscBaseline:                   # snapshot at publish, used for monthly review
  impressions: null
  clicks: null
  averagePosition: null
```

### 9.2 Required body sections

Every article body must include, in order:

1. **Byline block.** Author link, reviewer line (or honest researcher framing), last-verified date.
2. **One-sentence answer.** The direct factual answer the reader came for, in plain English, in the first 200 words.
3. **Plain-language disclaimer.** "This article explains how the <rule> works as of <month year>. It is not legal advice for your specific case."
4. **Who this is for / not for.** Bullet list of audience inclusions and exclusions, so readers self-select.
5. **The rule that controls the decision.** Cite the primary source inline with a link.
6. **Documents / evidence to gather.** Numbered list.
7. **Timeline or deadline.** With explicit dates where applicable.
8. **What can go wrong.** Common pitfalls, refusal reasons, errors — concrete, sourced.
9. **Worked example.** One realistic scenario walked through. Use a fictitious named student ("Aisha, F-1 student in Boston, …") to humanize.
10. **When to get document / attorney review.** Linked to the service page.
11. **Related guides.** Internal links: parent + siblings.
12. **Official sources box.** All cited primary sources with verification dates.
13. **FAQ.** 4–8 questions that match the harvested PAA + Reddit questions. Each Q and A appears verbatim in the body and in the FAQPage JSON-LD.
14. **Last-verified timestamp.** Repeated at the bottom of the body.

### 9.3 Word count by page kind

| Kind | Min meaningful words | Target |
|---|---:|---:|
| article | 700 | 1,200–1,800 |
| comparison article | 1,000 | 1,500–2,500 |
| legal canonical / pillar | 1,500 | 1,800–2,500 |
| hub | 400 | 600–900 |
| service landing page | 600 | 800–1,200 |
| policy / utility | 250 | 400–600 |

"Meaningful words" exclude navigation, footer, breadcrumbs, code blocks, and repeated CTAs.

### 9.4 Metadata writing patterns — CTR-optimized

**Title pattern (≤70 chars, target 55–62)**

```
<primary keyword, leading> | <brand or year hook>
```

Examples:
- `STEM OPT Employer Refuses to Sign I-983: What to Do (2026)`  — 60 chars
- `Ground 4A Student Possession Notice Explained (UK 2026)` — 56 chars
- `PGWP Refused for Full-Time Status Gap: How to Respond` — 55 chars

Avoid the words "Guide", "Ultimate", "Best", "Complete" — they correlate with low CTR for YMYL queries because readers are scanning for the specific problem, not a comprehensive guide.

**Meta description pattern (≤155 chars, target 130–150)**

```
<the question the reader has, restated>. <one-sentence direct answer hint>. <what the article delivers>.
```

Example:
- `Can a UK landlord ask students for 12 months rent upfront? Usually yes, but with limits. We explain the rules, your options, and when to push back.` — 144 chars

**H1 ≠ title.** H1 is for the reader, title is for the SERP. H1 can be more conversational and longer.

### 9.5 Image, alt text, and asset rules

- Hero image: Next.js `<Image>` with `priority`, explicit width/height, `sizes` attribute, ≤200 KB after compression.
- All images have descriptive alt text in plain English describing what is depicted. Alt text is not a place to stuff keywords.
- Diagrams (timelines, decision trees, document checklists) are preferred over stock photos for E-E-A-T.
- Stock photos of students must be diverse and unposed-looking. Avoid generic handshake stock.
- Document screenshots are blurred or redacted to remove personally identifying data.

### 9.6 Featured snippet and PAA optimization

For a slug targeting a featured snippet:
- The first 40–60 words after the H1 contain a direct, complete answer.
- For "what is X" queries: a 2–3 sentence definition.
- For "how to X" queries: a numbered list, ideally 4–8 steps, each step a short sentence.
- For "X vs Y" queries: a short table.
- For "can I X" queries: a 1-sentence yes/no, then the caveat.

For a slug targeting PAA:
- Use H2 or H3 headings that match the PAA question text exactly (or near-exactly).
- The answer below each H2/H3 is 40–80 words.

### 9.7 AI-search citation-friendly structure

Generative search engines (Google AI Overviews, Perplexity, ChatGPT, Claude) preferentially cite content that:

- states the factual answer in the first 200 words
- attributes claims with inline links to primary sources
- uses entity names rather than pronouns ("USCIS confirms…" not "they confirm…")
- includes a date stamp the AI can use to assess freshness
- has clean Article + FAQPage JSON-LD so the AI can parse Q/A directly

The article template above produces all five by default.

---

## 10. Internal linking architecture

### 10.1 Hub-and-spoke per cluster

Each cluster has a pillar URL and a set of supporting articles ("spokes"). Pillars link out to all spokes; spokes link to the pillar and 2–4 sibling spokes. Cross-cluster links exist but are sparse and intentional (e.g. an OPT article may link to a study-permit comparison, but not to a Canada PGWP article).

```
                  /uk/tenancy/  (pillar)
                       |
   ┌──────────┬────────┼────────┬──────────┐
   │          │        │        │          │
[spoke 1]  [spoke 2] [spoke 3] [spoke 4]  [spoke 5]
   │          │        │        │          │
   └──────────┴────────┴────────┴──────────┘
       (siblings link to 2–4 of each other)
```

Hub pillars must exist (and be ≥600 meaningful words, kind: hub) before spokes ship. If a pillar is missing, build it in the same branch as the first spoke that needs it.

### 10.2 Anchor text rules

- Anchor text describes the destination in plain English. The user should know where they're going before they click.
- The same destination URL is not linked with the same exact-match anchor more than 3 times on one page.
- Exact-match keyword anchors are limited to 1–2 per page; the rest are descriptive or natural-language.
- Anchors are never "click here", "read more", or the bare URL.

### 10.3 Required per-article link matrix

```yaml
internalLinks:
  parent:           # 1, mandatory
  siblings:         # 2–4, mandatory
  serviceOrIntake:  # 1, mandatory — links to /uk/tenancy-agreement-review, /us/document-review, etc.
  officialSource:   # 1, mandatory — government / regulator
  optionalDeeper:   # 0–3 — other site articles that genuinely help the reader
```

### 10.4 Orphan rescue protocol — for the existing 1,193

Week 0 process:

1. Export the orphan list from Semrush or generate it via the sitemap-vs-link-graph diff.
2. Bucket each orphan into one of four states:
   - **rescue:** has unique value, has search demand → add at least 3 incoming internal links from relevant hub or sibling pages, keep in sitemap.
   - **merge:** duplicates a stronger page → 301 redirect to the canonical, remove from sitemap.
   - **noindex:** has utility (e.g. internal tool, gated page) but should not be indexed → add `noindex`, remove from sitemap, keep internal links.
   - **delete:** no value, no demand, no links → return 410, remove from sitemap.
3. Run the bucketed actions in batches of 50–100 orphans per commit so each commit is reviewable.
4. After each batch, re-run `npm run seo:sitemap` and `npm run seo:links`.

Target: clear 1,193 → <50 orphans by end of Month 1. The remaining <50 are explicitly whitelisted hubs or new pages awaiting their next batch's inbound links.

---

## 11. Implementation plan for Claude Code

### 11.1 Branching model

```bash
git checkout -b seo-technical-foundation-and-quarter-plan   # Week 0
git checkout -b seo-week-01-uk-tenancy                       # Week 1
git checkout -b seo-week-02-us-f1-opt                        # Week 2
git checkout -b seo-week-03-ca-study-permit-pgwp             # Week 3
git checkout -b seo-week-04-comparison-and-conversion        # Week 4
# ... and so on, one branch per Monday batch
git checkout -b seo-month-01-review                          # End of Month 1
```

One branch = one Monday batch. Do not bundle two weeks into one branch. Do not publish from `main`.

### 11.2 Phase A — quarter roadmap files

Create:

```text
content/seo-quarter-plan/
├── README.md                        # how to use this directory
├── keyword-roadmap.json             # the 20 priority keywords plus the 84-article queue
├── weekly-calendar.md               # the 12-week publishing calendar
├── publishing-checklist.md          # Monday checklist (mirrors §12.3)
├── monthly-review-template.md       # the template every month-end file uses
├── competitor-research-template.md  # what to record per competitor
├── refresh-queue.json               # generated, lists existing pages by age
└── week-01/
    ├── research.json                # Friday research output
    └── articles/                    # 7 article files
```

`keyword-roadmap.json` shape per entry:

```json
{
  "keyword": "",
  "slug": "",
  "country": "",
  "cluster": "",
  "parentPillar": "",
  "intent": "",
  "funnelStage": "",
  "targetSerpFeature": "",
  "wordCountTarget": 0,
  "score": 0,
  "status": "planned",
  "targetWeek": 1,
  "needsOfficialSourceReview": true,
  "publishedUrl": null,
  "gscBaseline": {
    "impressions": null,
    "clicks": null,
    "averagePosition": null,
    "snapshotDate": null
  }
}
```

### 11.3 Phase B — SEO guard scripts (skeletons)

`scripts/seo-audit-guard.mjs` orchestrator:

```js
#!/usr/bin/env node
// Orchestrator: runs each individual check, aggregates results, exits 1 on any failure.
import { runSitemapCheck } from './check-sitemap-health.mjs';
import { runLinksCheck } from './check-internal-links.mjs';
import { runMetaCheck } from './check-metadata-uniqueness.mjs';
import { runContentCheck } from './check-content-quality.mjs';
import { runSchemaCheck } from './check-schema-validity.mjs';
import { writeReport } from './_seo-report-util.mjs';

const results = await Promise.all([
  runSitemapCheck(),
  runLinksCheck(),
  runMetaCheck(),
  runContentCheck(),
  runSchemaCheck(),
]);

const failures = results.flatMap(r => r.failures);
const warnings = results.flatMap(r => r.warnings);

await writeReport('seo-audit-guard', { results, failures, warnings });

console.log(`SEO audit complete: ${failures.length} failures, ${warnings.length} warnings`);
if (failures.length > 0) {
  for (const f of failures) console.error('FAIL:', f.scope, f.url || f.file, '-', f.message);
  process.exit(1);
}
```

Each individual check exports `runXCheck()` returning `{ failures: [], warnings: [] }`. Failures and warnings have a stable shape: `{ scope, url|file, rule, message }`. The output JSON in `.seo/reports/` is keyed by date and check name.

`check-sitemap-health.mjs` implements the §3.2 inclusion contract. It:

1. Reads the Next.js route manifest (build artifact) or the `sitemap.xml` route handler output.
2. For each candidate URL, fetches the rendered page (in dev or via a static build), checks status, robots meta, canonical, and whether the URL appears in the inbound-link graph.
3. Reports failures for any URL that should not be in the sitemap or any URL that is in the sitemap but should not be.

`check-internal-links.mjs`:

1. Crawls the site's link graph from the homepage and from the country hubs.
2. For each link, classifies as internal or external; for internal, checks resolution.
3. Reports 4xx/5xx targets, `cdn-cgi/l/email-protection` matches, and any indexable page with <3 incoming links.

`check-metadata-uniqueness.mjs`:

1. For every indexable page, extracts title, H1, meta description, canonical, primary keyword (from frontmatter).
2. Checks the §3.3 hard fails.
3. Reports duplicates with the conflicting URLs.

`check-content-quality.mjs`:

1. Reads every article file in the registry.
2. Counts meaningful words excluding nav/footer/breadcrumbs/code blocks.
3. Searches rendered body for placeholder strings and `[VERIFY` markers.
4. Searches for country-residue per §3.4.
5. Validates the FAQ schema against visible Q/A.

`check-schema-validity.mjs`:

1. For every indexable page, extracts all `application/ld+json` blocks.
2. Validates each against the §3.8 required shape for the page's kind.
3. Reports missing required schemas (e.g. Article on an article page) and shape errors.

### 11.4 Phase C — registry discipline

Every new article must have a registry entry as defined in §9.1. If the current article-index does not support all fields, extend it minimally — do not replace it. The registry is the single source of truth for the sitemap, the breadcrumb, the cluster pages, and the guard scripts.

### 11.5 Phase D — sitemap rules

Update sitemap logic so it includes only:

- pages with `index: true` in the registry
- pages with `kind: article | hub | service | comparison | policy | utility` where the kind is intentionally indexable
- self-canonical pages
- 200-status routes
- non-redirect routes
- pages with no visible placeholders
- pages with at least one incoming internal link, OR explicit hub inclusion

Excludes:

- `index: false`
- redirects
- canonicalized-away
- checkout / session / private dashboard
- `/cdn-cgi/`
- auth, admin, portal app internals, support app internals
- temporary content package files

### 11.6 Phase E — human sitemap

If a human `/sitemap` HTML page exists rendering thousands of links:

- split by country and cluster
- paginate or collapse groups
- show only indexable canonical pages
- never render >300 links per HTML response
- keep XML sitemap separate from human sitemap

### 11.7 Phase F — schema.org components

Create:

```text
components/seo/
├── ArticleJsonLd.tsx
├── BreadcrumbListJsonLd.tsx
├── FAQPageJsonLd.tsx
├── HowToJsonLd.tsx
├── PersonJsonLd.tsx
├── OrganizationJsonLd.tsx
└── LegalServiceJsonLd.tsx
```

Each component takes typed props matching the §3.8 shapes and emits a single `<script type="application/ld+json">` tag. All components are server components, no client JS.

Wire `ArticleJsonLd` and `BreadcrumbListJsonLd` into the existing article layout. `FAQPageJsonLd` is conditional on the article having a `faq` array in its frontmatter. `HowToJsonLd` is conditional on `kind: howto` or articles flagged with `isHowTo: true`. `OrganizationJsonLd` goes in the root layout.

### 11.8 Phase G — author entity pages

Create:

```text
app/authors/[slug]/page.tsx
app/authors/[slug]/PersonJsonLd.tsx   // or reuse the component
content/authors/<slug>.mdx
```

The author page renders: name, photo, credentials, bio, knowsAbout, sameAs links, recent articles by the author. PersonJsonLd is emitted server-side. The author page is indexable and is included in the sitemap.

Initial authors:
- one named editor with researcher framing (always available)
- one credentialed reviewer per cluster as available (UK adviser, US attorney, Canadian RCIC); honest framing if not yet available

### 11.9 Phase H — weekly batch implementation flow

For each Monday:

1. **Friday (research):** create branch `seo-week-NN-<topic>` after research is complete in `content/seo-quarter-plan/week-NN/research.json`.
2. **Saturday/Sunday (draft):** create the 7 article files. Each file includes complete frontmatter (§9.1) + body (§9.2). No placeholders. Every cited URL verified on Friday.
3. **Saturday/Sunday (link):** add internal links from parent pillar and 2–4 sibling articles to each new article. Update the pillar to link to the new spokes.
4. **Sunday (CTA + sources):** add the service CTA and the official source box to each article.
5. **Sunday (guard):** run `npm run seo:guard`. Fix every failure before commit. Warnings reviewed, deliberate ones documented.
6. **Sunday (build):** run `npm run build`. Resolve any build error.
7. **Monday morning (verify):** run `npm run seo:guard` again on the merged tree. Run `npm run seo:sitemap`. Confirm sitemap includes the 7 new URLs and nothing forbidden.
8. **Monday morning (deploy):** merge PR, deploy.
9. **Monday morning (submit):** in Google Search Console, submit the updated sitemap and request indexing on each of the 7 URLs.
10. **Monday morning (baseline):** snapshot GSC impressions/clicks/position for each new URL (will be zero on day one — this is the baseline). Save to the registry's `gscBaseline`.
11. **Tuesday morning (verify):** confirm pages are crawled (GSC URL inspection), schema is recognized (Rich Results Test), no new errors in Semrush.

---

## 12. Weekly batch workflow — the operating system

### 12.1 Friday research checklist

- [ ] Open last 28 days of GSC. Flag quick-win pages (position 8–30, impressions >50). Decide if any informs this week's siblings.
- [ ] For each of the 7 planned slugs: confirm the parent pillar exists and is indexable.
- [ ] For each slug: pull 20+ long-tail variants. Save to frontmatter.
- [ ] For each slug: open the SERP in incognito (correct country region). Record top 3 results, SERP feature, competitor type.
- [ ] For each slug: harvest 4–8 PAA / Reddit / AlsoAsked questions. These become the FAQ.
- [ ] For each slug: identify 2–4 primary-source URLs. Open each, confirm content, record `verifiedAt`.
- [ ] For each slug: write the one-sentence decision the article helps make.
- [ ] If any slug fails the §6.2 shippable gate, replace it with a backup from the queue.
- [ ] Save `content/seo-quarter-plan/week-NN/research.json`. Commit on a research branch, merge into next week's content branch.

### 12.2 Saturday/Sunday drafting standards

- Every article is drafted directly into the article file, not in an external editor. Drafts use the §9.1 frontmatter.
- Word count is checked before review. Articles under 700 words get cut or expanded — not padded with filler.
- The "one-sentence answer" appears in the first 200 words.
- Every fee, deadline, threshold has an inline link to its primary source.
- The FAQ matches the harvested questions and contains visible Q/A that the FAQPage schema also references.
- No claim is made about approval rates, processing times, or fees that is not sourced.
- Author byline is filled. Reviewer line is filled if available; otherwise honest researcher framing.
- No `[VERIFY]`, `TODO`, `lorem ipsum`, or boilerplate strings remain.

### 12.3 Monday publishing checklist

- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `npm run seo:guard` passes (exits 0).
- [ ] `npm run seo:sitemap` passes; sitemap delta is exactly +7 new URLs (or +N if a hub is also new).
- [ ] `npm run seo:links` passes; new articles all have ≥3 incoming internal links.
- [ ] `npm run seo:meta` passes; titles, metas, H1s, primary keywords unique.
- [ ] `npm run seo:content` passes; word count, no placeholders, no country residue.
- [ ] `npm run seo:schema` passes; Article + BreadcrumbList present on each new article.
- [ ] PR description includes: slugs published, parent pillar updates, sibling link updates, schema additions, any soft-warning notes.
- [ ] PR is reviewed, merged, deployed.
- [ ] Sitemap submitted in GSC.
- [ ] Each new URL submitted for inspection in GSC.
- [ ] Rich Results Test run on each new URL; results saved.
- [ ] GSC baseline snapshot recorded in registry.

### 12.4 Tuesday verification

- [ ] All 7 URLs return 200.
- [ ] GSC URL inspection shows "URL is on Google" or "Discovered — currently not indexed" (the latter is normal day-2; recheck in a week).
- [ ] Bing Webmaster Tools shows the URLs crawled.
- [ ] No new Semrush errors in a recrawl scoped to the new URLs.
- [ ] No fresh broken links from internal-link changes.

### 12.5 What to do when a check fails

- A hard fail in any guard script **blocks the publish**. Fix the failure, do not bypass.
- A build error blocks the publish. Fix or revert.
- A soft warning is logged. If five or more warnings of the same type accumulate over a month, that warning gets promoted to a hard fail in the next Month 0-style maintenance pass.
- If GSC URL inspection shows "Crawled — currently not indexed" 14+ days after publish: investigate content quality (probably thin or duplicate), do not re-request indexing repeatedly. Re-requesting indexing without improving the page is a negative signal.

---

## 13. Monthly evaluation process

### 13.1 Metrics dashboard

At the end of each month, Claude Code creates:

```text
content/seo-quarter-plan/month-01-review.md
content/seo-quarter-plan/month-02-review.md
content/seo-quarter-plan/month-03-review.md
```

Each review uses this table:

| Metric | Source | What to check |
|---|---|---|
| Indexed pages (new this month) | GSC Pages report | How many of the 28 new articles are indexed? |
| Impressions | GSC | Which articles are gaining visibility? Order by impressions desc. |
| Clicks | GSC | Which pages drive traffic? |
| CTR | GSC | Pages with <2% CTR + position <10 → title/meta rewrite. |
| Average position | GSC | Pages ranking 8–30 are refresh targets next month. |
| Semrush site health | Semrush | Delta vs last month. |
| Schema validity | Rich Results Test | All new pages produce valid Article + BreadcrumbList. |
| Broken links | `npm run seo:links` | Zero new broken internal links. |
| Orphans | `npm run seo:sitemap` | Trending toward zero; explicit whitelist documented. |
| AI Overviews / Perplexity citations | Manual sample | Of the 28 new URLs, how many are cited in AI answers? |
| Query expansion | GSC | New article ideas surfaced from real queries — fed into the keyword roadmap. |

### 13.2 Success thresholds

These are hypotheses, not guarantees. Use them to detect when something is off, not as performance contracts.

| Month | Indexed of new published | Articles ranking <30 (any keyword) | Articles ranking <10 |
|:---:|:---:|:---:|:---:|
| 1 | ≥ 80% (≥22 of 28) | ≥ 30% (≥8 of 28) | 1–4 |
| 2 | ≥ 85% cumulative | ≥ 40% of all published | 4–10 |
| 3 | ≥ 90% cumulative | ≥ 50% of all published | 10–20 |

Falling materially below these without an external cause (a Google update, a Semrush crawl regression) is a signal to pause new publishing for one week and do a structural audit.

### 13.3 Decision tree at month end

For each existing article:

- **Position 1–7, CTR ≥3%:** leave alone. Add 1–2 inbound links from new articles that fit.
- **Position 1–7, CTR <3%:** rewrite title and meta for clarity. Body is fine.
- **Position 8–30, impressions ≥50:** refresh. Add the queries it's actually ranking for as H2s; expand the worked example; re-verify sources; bump `dateModified`.
- **Position 8–30, impressions <50:** rewrite for the actual intent or add more internal links. The body may be on the wrong sub-intent.
- **Position 31+, impressions ≥20:** the page has potential but the SERP doesn't agree it's on-topic. Sharpen H1 and first 200 words to the primary keyword exactly.
- **Position 31+, impressions <20, 90 days old:** decide between merge, canonicalize, or `noindex`. Do not let it linger.
- **Two pages competing for the same primary keyword:** merge. Pick the stronger URL as canonical; 301 the other; consolidate body content.

### 13.4 End-of-month review template

Each `month-NN-review.md` follows this skeleton:

```markdown
# Month NN Review

## Headline
<one sentence: did we hit the indexing and ranking thresholds for this month?>

## What shipped
- 28 new articles across weeks N1–N4
- M refresh articles
- Infrastructure changes: …

## What is indexed
| URL | Indexed? | Discovered? | Notes |

## Quick wins (rank 8–30, impressions ≥50)
| URL | Current position | Impressions | CTR | Action for next month |

## CTR rewrites needed
| URL | Position | CTR | Proposed new title | Proposed new meta |

## Refresh queue for next month
| URL | Reason | Effort | Owner |

## New article ideas surfaced from GSC
| Query | Impressions | Suggested slug | Cluster |

## Technical state
- Semrush health: prev → current
- Orphans: prev → current
- New broken links: …
- New schema errors: …

## AI search citation sample
| Query tested | Surface | Was YouSafe cited? | Was a competitor cited? | Notes |

## Decisions for next month
- Topics to add: …
- Topics to drop: …
- Pages to merge / canonicalize: …
- Pages to refresh: …
- Infrastructure work: …
```

---

## 14. Backlink and distribution layer

Topical authority is not just on-page. Domain-level trust signals — backlinks, brand mentions, named-author citations — set the ceiling for how high the on-page work can rank.

This layer is **optional for Month 1** (the technical and content foundation must come first) but is **required for Month 2 onward** because the on-page work alone will eventually plateau.

### 14.1 Why on-page alone won't rank YMYL content fast

For non-YMYL topics, clean on-page + good content can rank within 30–90 days. For YMYL legal topics, Google additionally weighs:

- domain authority and trust
- named author entity recognition
- citations on regulator, university, news, and legal-aid websites
- brand mention frequency in the broader web corpus

A site can have perfect on-page SEO and still rank #20 if Google has never seen the brand cited elsewhere.

### 14.2 Free backlink earning channels

| Channel | Approach | Effort per month | Expected output |
|---|---|---|---|
| HARO / Qwoted / SourceBottle | Daily monitor for journalist requests on immigration, student housing, visa refusals. Respond within 6 hours with a quotable expert answer + verifiable author bio. | 30–60 min/day | 1–3 backlinks/month on news domains, DR 60+. |
| University international office resource pages | Email each international office in the top-20 US/UK/Canada universities a short, helpful list of free YouSafe resources relevant to their students. No transactional pitch. Many `.edu` resource pages link out. | 2 hrs/week for 6 weeks | 3–10 .edu links over 90 days. |
| Reddit and Discord communities | Genuine, low-frequency participation in r/iwantout, r/UKvisa, r/CanadaImmigration, etc. Answer real questions; link only when the article directly answers the question. Never spam. | 30 min/day | Indirect — brand recall, occasional direct referral traffic, "cited as source" mentions. |
| Forum citations | Old, evergreen forum threads where the YouSafe article genuinely answers a top-voted question can be cited (within forum rules) with a one-sentence summary + link. | 1 hr/week | Long-tail referral traffic + indirect signal. |
| Guest posts on partner blogs | Write 1 long-form contribution per month for a complementary site (study-abroad consultant blog, university alumni network, RCIC firm blog). The byline carries an author hub link. | 1 article/month | 1 high-quality backlink/month, plus author entity reinforcement. |
| Press / commentary | When a relevant policy changes (Renters' Rights Act commencement, USCIS STEM OPT memo, IRCC PGWP update), publish a same-day commentary post and pitch 3–5 journalists. | 1 day per policy event | Variable — single high-DR link can outweigh a month of other work. |

### 14.3 .edu link strategy specifics

International offices at most universities maintain a "resources for international students" page. These pages link out to:
- government sources (always)
- the university's own pages (always)
- selected third-party resources (occasionally — this is the opening)

Approach:
1. Identify the 20 US, 20 UK, and 20 Canada universities with the largest international student populations.
2. For each, find the international office "resources" or "Q&A" or "outside resources" page.
3. Map 1–3 specific YouSafe articles that complement (not compete with) what they link.
4. Email the international office contact a short, named, named-author message offering the resource. No template. No mass-send.
5. Track responses and links earned.

Realistic conversion: ~5–10% of well-targeted outreaches result in a link, over 60–120 days.

### 14.4 HARO / journalist response template

Three rules:
- Respond within 6 hours of the query. Most journalists pick from the first 3 substantive responses.
- Lead with the answer in 2–3 sentences. Then a 1-paragraph elaboration. Then bio with credentials and the link to the author hub.
- Never pitch the brand. Pitch the expert. The link comes with the expert byline.

### 14.5 Forum and community presence rules

- One account per platform, real-name, with a bio that links to the author hub (not the homepage).
- Answer 5 questions for every 1 link shared.
- Never recycle the same answer across threads. Every reply is written for that specific question.
- Mute the impulse to post when the article is only tangentially related. The bar is "this article directly answers the top-voted question in the thread."

---

## 15. Claude Code — ready-to-paste prompts

### 15.1 Infrastructure prompt (run once, Week 0)

```text
You are Claude Code implementing the YouSafe / MyCaseworks 3-month SEO topical
authority plan, infrastructure phase only.

Work only inside the existing repo:
  ~/Documents/GitHub/caseworks

Do not create a new repo. Do not touch checkout, Stripe, auth, dashboard, portal,
support-saas, user roles, or unrelated app code.

Read first (verify each exists; if not, mark [VERIFY ROUTE LOCATION] and proceed):
  - app/sitemap.xml/route.ts
  - app/layout.tsx
  - lib/article-index.ts
  - existing article components and cluster detect scripts
  - public/robots.txt
  - this brief (yousafe_3_month_seo_topical_authority_claude_code_brief_v2.md)

Create a branch: seo-technical-foundation-and-quarter-plan

Implement, in this order:

1) Roadmap files under content/seo-quarter-plan/:
   - README.md
   - keyword-roadmap.json containing the 20 priority keywords AND placeholders for
     the remaining 64 articles (84 total over 12 weeks), each with the full schema
     from §11.2 of the brief.
   - weekly-calendar.md with the 12 Monday batches.
   - publishing-checklist.md (mirror §12.3).
   - monthly-review-template.md (mirror §13.4).
   - competitor-research-template.md (mirror §5.3).
   - refresh-queue.json (initially empty, populated by the refresh script).

2) SEO guard scripts under scripts/:
   - seo-audit-guard.mjs (orchestrator, exit 1 on any failure)
   - check-sitemap-health.mjs
   - check-internal-links.mjs
   - check-metadata-uniqueness.mjs
   - check-content-quality.mjs
   - check-schema-validity.mjs
   Each writes a JSON report to .seo/reports/. Add .seo/ to .gitignore.

3) package.json scripts:
   - seo:guard, seo:sitemap, seo:links, seo:meta, seo:content, seo:schema
   Merge into existing scripts; do not remove existing entries.

4) robots.txt cleanup: remove any non-standard directive such as
   "Content-Signal: search=yes,ai-train=no". Keep User-agent, Disallow, Sitemap.

5) Sitemap logic: update so it includes only URLs that satisfy the inclusion
   contract in §3.2. Excludes /cdn-cgi, /checkout, /api, /auth, /dashboard,
   /portal/app, /support/admin, /_next, /account, and any URL that 404s,
   redirects, is canonicalized away, is noindex, or has zero incoming links.

6) Hreflang: remove all currently emitted hreflang tags. Do not emit any unless
   the reintroduction criteria in §3.6 are fully met. Add a comment and a guard.

7) Schema.org components under components/seo/:
   - ArticleJsonLd.tsx
   - BreadcrumbListJsonLd.tsx
   - FAQPageJsonLd.tsx
   - HowToJsonLd.tsx
   - PersonJsonLd.tsx
   - OrganizationJsonLd.tsx
   - LegalServiceJsonLd.tsx
   Wire Article + BreadcrumbList into the existing article layout. Wire
   Organization into root layout. Make FAQ conditional on frontmatter.faq.

8) Author entity scaffold:
   - app/authors/[slug]/page.tsx rendering name, bio, credentials, knowsAbout,
     sameAs, and Person JSON-LD.
   - content/authors/ directory with at least one real author MDX file.
   - Link every article byline to /authors/<slug>.

9) Editorial-policy pages (create or expand to meet word-count minimums):
   - /editorial-policy (≥600 words)
   - /corrections-policy (≥300 words)
   - /about (≥500 words; current page expanded)
   - /refund-policy (≥400 words; expanded from current thin version)
   Add to global footer.

10) Orphan triage:
    - Generate the orphan list (URLs in sitemap or index with zero incoming
      internal links).
    - For each: bucket as rescue, merge, noindex, or delete per §10.4.
    - Apply changes in batches of 50–100 URLs per commit.
    - After each batch, re-run seo:sitemap and seo:links.

11) Visible [VERIFY] guard: ensure check-content-quality.mjs catches any rendered
    "[VERIFY" string in indexable content.

12) cdn-cgi link sweep: replace any /cdn-cgi/l/email-protection link with a
    mailto: link or a contact-form link. Block the pattern in seo:links.

Run, in this order:
  npm run lint
  npm run build
  npm run seo:guard
  npm run seo:sitemap
  npm run seo:links
  npm run seo:meta
  npm run seo:content
  npm run seo:schema

If any command does not exist, create it. If any command fails, fix the
underlying issue, do not bypass.

Do NOT in this phase:
- write any of the 84 article files
- add broad dynamic routes for /ca, /uk, /us, /blog, /guide
- create new authors with fabricated credentials
- touch checkout, Stripe, auth, dashboard, portal/app, or support-saas code
- emit hreflang
- change global design tokens
- introduce client-side article rendering

Final report (in the PR description):
1) branch name
2) files changed (grouped by phase A–H)
3) roadmap files created
4) package scripts added
5) SEO guard checks implemented
6) sitemap rules changed
7) hreflang removed
8) schema components added and where wired
9) author scaffold state
10) editorial-policy pages state
11) orphan triage: before/after counts per bucket
12) any remaining Semrush risks with a plan
13) build/lint/SEO check results
14) confirmation no unrelated systems were touched
```

### 15.2 Weekly batch prompt (reusable, Weeks 1–11)

```text
You are Claude Code implementing the YouSafe / MyCaseworks SEO weekly batch for
Week NN: <topic>.

Branch: seo-week-NN-<topic>

Read first:
  - content/seo-quarter-plan/week-NN/research.json (must exist; produced Friday)
  - content/seo-quarter-plan/keyword-roadmap.json (entries for this week's 7 slugs)
  - the brief sections §8.X (this week's plan), §9 (article template), §10
    (internal linking)

Implement:

1) For each of the 7 slugs in week-NN/research.json:
   a) Create the article file under the slug's path.
   b) Fill the frontmatter from §9.1 completely. No empty required fields.
   c) Write the body following the 14-section structure in §9.2.
      - Use the harvested PAA/Reddit questions as the FAQ block.
      - Cite primary sources inline with the verifiedAt date.
      - Include the byline, reviewer line (or honest researcher framing), and
        the "Last verified" date at top and bottom.
   d) Confirm word count meets §9.3 for the kind.
   e) Title ≤70 chars. Meta description ≤155 chars. H1 unique.

2) Wire schema:
   - Article + BreadcrumbList on every article (automatic via layout if Phase F
     done).
   - FAQPage if FAQ has 3–8 visible pairs.
   - HowTo if the body is a numbered procedural guide.

3) Internal linking per §10.3:
   - Add 3–5 inbound links from the parent pillar and from sibling articles to
     each new article.
   - Update each new article to link to the parent pillar, 2–4 siblings, one
     service/intake, one official source.

4) Update keyword-roadmap.json entries:
   - status: planned -> published
   - publishedUrl: <canonical URL>
   - gscBaseline.snapshotDate: <today>

5) Add the 7 new URLs to the sitemap via the registry (automatic if Phase D
   done). Run seo:sitemap to confirm the delta.

Run, in order:
  npm run lint
  npm run build
  npm run seo:guard
  npm run seo:sitemap
  npm run seo:links
  npm run seo:meta
  npm run seo:content
  npm run seo:schema

If any guard fails: fix the underlying article, do not bypass. If any fact in
the article cannot be sourced to a primary source, replace the claim or remove
the article.

Do NOT:
- write more than 7 articles in this batch
- use [VERIFY], TODO, TBD, lorem ipsum, or boilerplate
- claim approval rates, processing times, or fees without an inline primary
  source link
- introduce hreflang
- create new dynamic country/city routes
- modify checkout/auth/portal/support

Final PR description:
1) the 7 slugs published
2) word counts per article
3) primary sources cited per article (count)
4) internal links added per article (in/out counts)
5) schema types emitted
6) guard results
7) any slugs swapped vs original plan and why
8) GSC baseline recorded
```

### 15.3 Monthly review prompt (reusable, end of Month 1/2/3)

```text
You are Claude Code producing the YouSafe SEO Month NN review.

Branch: seo-month-NN-review

Read:
  - the brief §13 (monthly evaluation process)
  - content/seo-quarter-plan/monthly-review-template.md
  - content/seo-quarter-plan/keyword-roadmap.json
  - all article files published in weeks (NN-1)*4 + 1 .. NN*4
  - last 30 days of GSC export (placed at .seo/exports/gsc-month-NN.csv before
    you run; if the file is absent, stop and request it)

Implement:

1) Create content/seo-quarter-plan/month-NN-review.md following the §13.4
   template exactly.

2) Populate every section with real data from the GSC export, the Rich Results
   Test, and the guard reports in .seo/reports/.

3) Build the next-month decision lists per §13.3 decision tree:
   - rewrites (title/meta)
   - refreshes (body)
   - merges and canonicalizations
   - kills (410 or noindex)
   - new article ideas surfaced from GSC queries

4) Update content/seo-quarter-plan/keyword-roadmap.json for the next month's 28
   slugs, swapping out planned topics that no longer make sense.

5) Update content/seo-quarter-plan/refresh-queue.json with any new entries
   surfaced by the decision tree.

Run:
  npm run seo:guard
  npm run seo:sitemap

Final PR description:
1) headline result (did we hit the indexing + ranking thresholds for the month?)
2) top 5 ranking pages this month
3) top 5 quick-win pages for next month
4) top 5 rewrites needed
5) top 5 refreshes needed
6) infrastructure work to do next month
7) the next 28-article plan locked
```

---

## 16. What not to do

Do not:

- create a new repository
- rewrite the whole site
- generate 84 article pages in a single session
- publish content with `[VERIFY]`, `TODO`, `TBD`, `lorem ipsum`, or boilerplate
- use hreflang without real localized URL equivalents
- add noindex pages to sitemap
- make every city/country page indexable without internal links
- create broad catch-all routes for `/ca`, `/uk`, `/us`, `/blog`, or `/guide`
- claim approval rates, legal outcomes, processing times, fees, or thresholds without a primary-source link
- fabricate author credentials or imply attorney/RCIC/OISC review where none exists
- re-request indexing on a page repeatedly when the underlying issue is content quality
- change payment, auth, portal, or support infrastructure
- bypass a guard failure with a comment or flag — fix the underlying issue
- bundle two weekly batches into one branch or PR
- depend on a single SEO tool for difficulty estimates or competitor analysis

---

## 17. Acceptance criteria — infrastructure phase

Claude Code is done with the infrastructure phase (Week 0) only when **all** are true:

- `npm run seo:guard` exists and passes
- `npm run seo:sitemap`, `seo:links`, `seo:meta`, `seo:content`, `seo:schema` all exist and pass
- sitemap contains only canonical, indexable, 200-status, linked, self-canonical pages
- no invalid `robots.txt` directive remains
- no hreflang is emitted
- no visible `[VERIFY]` markers exist in indexable content
- no `/cdn-cgi/l/email-protection` internal links remain
- title, meta description, H1, and primary keyword uniqueness checks pass
- the article registry includes cluster, parent pillar, schema types, author, reviewer, lastVerifiedAt, and gscBaseline fields
- `content/seo-quarter-plan/` exists with all roadmap files
- `keyword-roadmap.json` contains all 20 priority keywords and placeholders for the remaining 64
- schema.org components are wired into the article layout
- at least one `/authors/<slug>` page exists with real, honest credentials and Person JSON-LD
- `/editorial-policy`, `/corrections-policy`, expanded `/about`, expanded `/refund-policy` all live and linked from the footer
- orphan count is < 50 (down from 1,193)
- Semrush re-crawl of the changed surface shows zero new errors of any prior type
- no checkout, Stripe, auth, dashboard, portal, or support files were modified

---

## 18. 90-day success picture

By the end of Month 3, the site should look to Google like:

- a focused, frequently updated, named-author legal-document knowledge base for international students and immigrants in US, UK, and Canada
- with three deep clusters (UK tenancy + Renters' Rights, US F-1/OPT/STEM OPT, Canada study permit/PGWP) and emerging clusters in post-study pathways and city-level tenant rights
- clean technically: zero invalid robots directives, zero broken internal links, zero hreflang conflicts, < 50 orphans, every indexable page in the sitemap, every article schema-marked
- credible editorially: every article has a named author, every legal claim has a primary-source inline citation, every page carries a "Last verified" date, and a transparent corrections policy is in place
- discoverable: 80+ of the 84 new articles indexed, half ranking somewhere in the top 30 for at least one of their targeted queries, a meaningful number ranking in the top 10 for long-tail terms
- referenced: a small but non-zero number of `.edu` and news backlinks earned via real expert quotes and partnerships
- AI-search visible: cited at least occasionally in Google AI Overviews, Perplexity, and ChatGPT browse answers for the long-tail queries it targets

That outcome is the result of the discipline in this brief, not the volume.

---

## Appendices

### Appendix A — required package.json scripts

```json
{
  "scripts": {
    "lint": "<existing>",
    "build": "<existing>",
    "seo:guard":   "node scripts/seo-audit-guard.mjs",
    "seo:sitemap": "node scripts/check-sitemap-health.mjs",
    "seo:links":   "node scripts/check-internal-links.mjs",
    "seo:meta":    "node scripts/check-metadata-uniqueness.mjs",
    "seo:content": "node scripts/check-content-quality.mjs",
    "seo:schema":  "node scripts/check-schema-validity.mjs",
    "seo:refresh-queue": "node scripts/build-refresh-queue.mjs"
  }
}
```

### Appendix B — required content registry fields (recap)

slug, country, cluster, parentPillar, kind, primaryKeyword, secondaryKeywords, searchIntent, funnelStage, reader, decision, officialSources[label,url,verifiedAt], author, reviewer, reviewerCredential, reviewedAt, lastVerifiedAt, title, metaDescription, h1, canonicalUrl, index, reviewStatus, schemaTypes, internalLinks{parent,siblings,serviceOrIntake,officialSource,optionalDeeper}, gscBaseline{impressions,clicks,averagePosition,snapshotDate}.

### Appendix C — schema.org snippet library

See §3.8 for the canonical shapes of Article, FAQPage, BreadcrumbList, HowTo, Person, Organization, and LegalService. The components in `components/seo/` are the runtime emitters of these shapes.

### Appendix D — disclaimer text bank

**Per-article disclaimer (use in every article body, with the rule and date filled in):**

> This article explains how `<rule>` works as of `<month year>`. It is not legal advice for your specific case. Speak with a licensed adviser in your jurisdiction before making a decision based on this article.

**Reviewer line (when a credentialed reviewer signed off):**

> Reviewed by `<Name>`, `<credential>`, on `<ISO date>`.

**Researcher line (when no credentialed reviewer is available — use this, do not pretend):**

> Researched and edited by `<Name>`. This article cites primary sources. It has not been reviewed by a licensed adviser in your jurisdiction. Please confirm with a licensed adviser before acting.

**Corrections invite (link in every article footer):**

> Found an error? See our [corrections policy](/corrections-policy) and let us know — we publish dated correction notes on every article.

---

*End of brief.*

---
## APPENDIX C — SEO_AUDIT_AND_ENHANCED_Q3_MASTER_PLAN.md (verbatim; GSC-derived audit. Charts preserved as PNGs in SEO_AUDIT_AND_ENHANCED_Q3_MASTER_PLAN/)

# YouSafe Consultancy — Comprehensive SEO Audit & Enhanced Q3 2026 Master Plan

**Audit Date:** June 8, 2026 | **Auditor:** Senior SEO Engineer | **Authority Source:** Google Search Central SEO Complete Guide (June 2026) | **Properties Audited:** `yousafeconsultancy.com`, `legal.yousafeconsultancy.com`, `usa.yousafeconsultancy.com`, `ca.yousafeconsultancy.com`, `uk.yousafeconsultancy.com`, `portal.yousafeconsultancy.com`

---

## TL;DR — The Bottom Line

Your website ecosystem has **647 URLs across 6 subdomains** with a solid technical foundation (sitemaps are current, Week 0 infrastructure shipped successfully), but **critical indexing failures are throttling visibility**. Google has discovered **618 pages** yet only **~742 are indexed** — leaving **267 pages in "Discovered - currently not indexed" limbo** plus **87 redirect chains** and **182 noindex exclusions** that waste crawl budget. Most critically, your **19 total clicks in 28 days** with a **0.22% CTR** and **average position of 18.8** indicate the site is trapped on page 2 of SERPs for nearly all queries. The content quality is strong (attorney-reviewed, properly sourced) but the **technical hygiene, internal linking architecture, and E-E-A-T signal amplification** have not kept pace with Google's YMYL scrutiny for legal immigration content. This audit identifies **47 specific actionable fixes** organized by priority, all mapped directly to Google's official SEO guidelines.

---

## 1. Executive Audit Scorecard

The following scorecard summarizes the health of each audited dimension against Google Search Essentials requirements. Each category is scored on a 100-point scale based on the severity and volume of issues found.

| Audit Dimension | Score | Status | Primary Issue | Google Guide Section |
|---|---|---|---|---|
| **Indexing Health** | 42/100 | Critical | 267 pages "Discovered — not indexed"; 87 redirects; 182 noindex pages | §3 — Crawling & Indexing |
| **E-E-A-T Signals** | 55/100 | Warning | Author pages exist but lack Person schema; reviewer credentials thin | §2 — Helpful Content, E-E-A-T |
| **Technical SEO** | 68/100 | Fair | Sitemaps valid but inclusion contract not enforced; orphan risk | §3.2 — Sitemap Rules |
| **Content Quality** | 78/100 | Good | Strong sourcing, proper disclaimers, good word counts | §2 — People-First Content |
| **Internal Linking** | 52/100 | Warning | 14 pages with only 1 incoming link; weak hub-spoke architecture | §3 — Links & Crawlability |
| **Schema Markup** | 60/100 | Warning | Basic Article schema present; missing FAQPage, HowTo, BreadcrumbList | §4 — Structured Data |
| **Page Experience** | 70/100 | Fair | Mobile-friendly; Core Web Vitals unverified in GSC | §4 — Core Web Vitals |
| **Search Appearance** | 48/100 | Critical | 0.22% CTR; average position 18.8; zero rich results | §4 — Snippets, Title Links |

**Overall Site Health: 59/100** — The site has strong content but is being held back by technical indexing failures and weak E-E-A-T amplification. These are fixable within 30–45 days.

![Indexing Status & Impressions Over Time](chart_indexing_impressions.png)
*Figure 1: Google Search Console data showing the gap between discovered and indexed pages, overlaid with daily impression trends. The sharp spike in "Not Indexed" pages on May 11 followed by the persistent plateau indicates sitemap bloat — URLs are being discovered faster than Google can evaluate them for indexing.*

---

## 2. Critical Findings — P0 Blockers

These issues must be resolved before any new content publishing resumes. Per Google's Search Essentials, pages that fail technical requirements cannot rank regardless of content quality.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

### 2.1 The "Discovered — Not Indexed" Crisis (267 Pages)

**The Problem:** Google has discovered **267 pages** but has chosen not to index them. This is the single largest issue in your GSC data. When Google discovers a URL (typically via sitemap submission or internal link) but declines to index it, the reason is almost always one of three algorithmic judgments: the page is perceived as **low-quality**, it is **duplicative** of existing indexed content, or the site's **overall quality signals** (E-E-A-T, crawl budget allocation) are too weak to justify expanding the indexed set.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

**Root Cause Analysis:** Your legal subdomain's sitemap contains **407 URLs**, yet GSC shows only ~742 total indexed pages across the entire ecosystem. Given that you have ~1,282 tracked URLs per your strategy brief, this means approximately **540 pages (42%)** are either not discovered or not indexed. The 267 "Discovered — not indexed" pages represent the most urgent subset because Google has already found them and made an active decision not to index them.

**Google-Aligned Fix:** Google's documentation states that for pages stuck in "Discovered — currently not indexed," you should: (1) ensure the page has **unique, substantial content** (minimum 700 meaningful words per Google's thin content thresholds); (2) verify it has **at least one incoming internal link** from an already-indexed page; (3) confirm the page is not **canonicalized away** or **noindex-tagged**; and (4) check that it does not **duplicate** an existing indexed URL's primary intent.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

| Priority | Action | URLs Affected | Effort | Owner |
|---|---|---|---|---|
| P0.1 | Audit all 267 URLs against sitemap inclusion contract (§3.2 of brief) | 267 | 4 hrs | Technical SEO |
| P0.2 | Remove from sitemap any URL that is canonicalized, noindex, or redirects | ~87 | 2 hrs | Developer |
| P0.3 | Add ≥3 internal links to each rescued orphan from relevant hub pages | ~80 | 6 hrs | Content |
| P0.4 | Noindex or delete pages with <700 words and no unique value | ~100 | 3 hrs | Content |
| P0.5 | Re-submit cleaned sitemap and request indexing on rescued pages | All | 1 hr | SEO Ops |

### 2.2 Redirect Chain Pollution (87 Redirects + 3 Redirect Errors)

**The Problem:** Google reports **87 pages with redirects** and **3 redirect errors** in your indexing status. Redirect chains dilute PageRank (link equity) and waste crawl budget. Google's crawler may stop following redirect chains longer than 5 hops, and each additional hop reduces the equity passed to the destination.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

**The 3 Redirect Errors** are particularly damaging because they represent broken redirect chains that terminate in 404 or 5xx responses. These create "soft 404" signals that tell Google the site has abandoned maintenance.

**Google-Aligned Fix:** Per Google's site move guidelines, use **301 redirects only** for permanent moves, keep chains to a **maximum of 3 hops**, and ensure every redirect source has its target URL in the sitemap while the source is removed.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  Update all internal links to point directly to the final destination URL rather than passing through intermediate redirects.

### 2.3 Sitemap-Index Mismatch (182 Noindex Pages)

![Critical Issues and Device Performance](chart_issues_devices.png)
*Figure 2: Left panel — the 8 categories of indexing failures detected in GSC, with "Discovered — not indexed" (267 pages) as the dominant issue. Right panel — device-level performance showing mobile's surprising 0.48% CTR versus desktop's 0.18%, suggesting mobile rendering may be more compelling or the mobile audience more targeted.*

**The Problem:** Your sitemaps collectively include URLs that are excluded from indexing by `noindex` tags. Google's sitemap guidelines explicitly state: "Include only canonical, indexable URLs in your sitemap."  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  Submitting noindex pages in sitemaps creates a contradictory signal — you're telling Google both "please index this" (sitemap) and "do not index this" (noindex tag). This contradiction erodes Google's trust in your sitemap as a reliable crawl signal.

**Google-Aligned Fix:** Implement the sitemap inclusion contract defined in your brief §3.2: a URL appears in sitemap **if and only if** it responds 200, has indexable robots meta, is self-canonical, has at least one incoming internal link, has no visible placeholders, and is not under excluded paths (`/checkout`, `/cdn-cgi`, `/api`, `/auth`, `/dashboard`, `/portal/app`, `/support/admin`).  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

---

## 3. High-Priority Findings — P1 Issues

These issues significantly impair ranking potential but do not block indexing entirely. They should be addressed in parallel with P0 fixes during Weeks 3–4 of the revised plan.

### 3.1 E-E-A-T Signal Gaps for YMYL Content

Your content covers immigration law, tenancy rights, and visa procedures — all squarely in Google's **"Your Money or Your Life" (YMYL)** category. Google's Search Quality Raters are explicitly instructed to hold YMYL content to the highest E-E-A-T standards.  [(Search Engine Land)](https://searchengineland.com/guide/ymyl)  My analysis of your live article on LLC formation for F-1 students reveals both strengths and gaps:

**Strengths Observed:**
- Author byline present ("MyCaseworks Editorial")
- "Reviewed by" line present
- "Last verified" date displayed (2026-05-09)
- Official sources section with live government links (USCIS, IRS, Study in the States)
- Plain-language disclaimer included
- "Key takeaways" structured summary

**Critical Gaps:**

| E-E-A-T Element | Current State | Google Requirement | Gap Severity |
|---|---|---|---|
| Author credentials | "MyCaseworks Editorial" — generic team name | Named individual with verifiable expertise (J.D., RCIC, etc.) | **High** |
| Author page | Exists at `/authors/denise-platter-cabrera/` but minimal | Full bio, photo, credentials, `sameAs` links, Person schema | **High** |
| Person schema | Not detected on author page | Required JSON-LD with `name`, `jobTitle`, `worksFor`, `knowsAbout`, `sameAs` | **High** |
| Reviewer credential | Listed as "MyCaseworks Editorial" | Named credentialed reviewer (e.g., "Attorney, NY Bar #12345") | **Medium** |
| Article schema | Basic implementation detected | Must include `author`, `reviewer`, `dateModified`, `citation` | **Medium** |
| Organization schema | Not detected on homepage | `LegalService` type with `name`, `legalName`, `logo`, `contactPoint` | **Medium** |
| Editorial policy page | `/editorial-policy/` exists (confirmed in sitemap) | Must be ≥600 words, linked from footer, explain review process | **Low** |

**Google-Aligned Fix:** Google's YMYL guidelines emphasize that **Trustworthiness** is the most important E-E-A-T factor.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  For legal content, this means every claim must be traceable to a primary government source, every author must be a verifiable expert, and every page must carry a clear "not legal advice" disclaimer with a path to professional consultation. The brief's §4 requirements for author hub pages must be fully implemented, not scaffolded.

### 3.2 Internal Link Architecture Weakness

The GSC Pages report reveals that **most pages receiving impressions have 0 clicks**, and the average position is **18.8** (deep page 2). A primary driver of this is weak internal link equity distribution. Google's Link Analysis Systems use internal links to understand site hierarchy and distribute ranking potential.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

**Evidence from Data:**
- The homepage (`yousafeconsultancy.com/`) has the best CTR (3.96%) and position (4.29) — it is the most-linked page
- Legal subdomain articles with internal links to pillars (e.g., `/uk/tenancy/ground-4a-possession-explained/`, position 8.89) outperform orphans
- USA subdomain university pages (e.g., `/universities/georgia-tech`, position 8.09) with hub linkage rank better than disconnected legal articles stuck at position 40+
- **14 pages have only 1 incoming internal link** — these are effectively orphaned from a link equity perspective

**Google-Aligned Fix:** Implement the hub-and-spoke model from your brief §10. Every cluster needs a pillar page (≥600 words, `kind: hub`) that links to all spokes; every spoke must link to its pillar and 2–4 sibling spokes.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  Use descriptive anchor text that names the destination topic — never "click here" or "read more." The internal link matrix from §10.3 (parent + siblings + service + official source) must be enforced programmatically via the guard scripts.

### 3.3 Schema Markup Incomplete

Structured data enables rich results — enhanced search listings with star ratings, FAQ dropdowns, how-to steps, and more. These rich results can increase CTR by 20–30%.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  Your current implementation has basic Article schema but is missing the full suite that Google's guidelines recommend for YMYL legal content.

**Required Schema Types (per Google Guide §3.8 and your brief):**

| Schema Type | Status | Impact | Implementation |
|---|---|---|---|
| `Article` | Partial | Medium | Missing `author` Person reference, `citation` field |
| `BreadcrumbList` | Missing | High | Enables breadcrumb rich snippets in SERP |
| `FAQPage` | Missing | High | Enables FAQ dropdowns; requires 3–8 visible Q/A pairs |
| `HowTo` | Missing | Medium | Enables step-by-step rich results for procedural guides |
| `Person` (author) | Missing | **Critical** | Required for YMYL E-E-A-T; must include `sameAs` |
| `Organization` | Missing | Medium | Must be `LegalService` type, not generic `Organization` |
| `LegalService` | Missing | Medium | Required on service/checkout pages |

### 3.4 CTR Crisis — 0.22% Average

![Countries and Position Distribution](chart_countries_positions.png)
*Figure 3: Left panel — the US dominates impressions (5,860) but with a dismal 0.2% CTR, indicating title/meta mismatch with American search intent. Right panel — only 1.2% of pages rank in positions 1–3, while 55.1% are buried on page 2 or deeper where organic CTR effectively drops to zero.*

Your **0.22% average CTR** is approximately **80% below** the typical benchmark for informational YMYL content (which typically sees 1–3% CTR for positions 8–20).  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  This indicates that even when your pages appear in search results, users are not compelled to click.

**Root Causes:**

1. **Title tags are not CTR-optimized.** Google's title link guidelines recommend titles under 60 characters with the primary keyword first and a brand or year hook.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  Many of your titles appear to exceed this limit or lack compelling differentiation from competitors.

2. **Meta descriptions are missing or generic.** The meta description does not directly affect ranking but strongly influences CTR. Google's snippet guidelines recommend unique descriptions of 150–160 characters that include the primary keyword and a clear value proposition.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

3. **No rich results.** Without FAQ dropdowns, star ratings, or breadcrumb navigation in the SERP, your listings appear as plain blue links against competitors who may have enhanced appearances.

4. **Position distribution is poor.** Only **1.2%** of your pages rank in positions 1–3, and **30.5%** are in positions 4–10. The majority (55.1%) are on page 2 or deeper where CTR naturally collapses to near-zero.

---

## 4. Medium-Priority Findings — P2 Issues

These issues should be addressed during the Month 2 evaluation window as part of the ongoing hygiene cycle.

### 4.1 Mobile-First Indexing Verification

Google predominantly uses the **mobile version** of a site's content for indexing and ranking.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  Your GSC data shows mobile generates **6 clicks at 0.48% CTR** versus desktop's **13 clicks at 0.18% CTR** — mobile CTR is actually higher, which is unusual and suggests either (a) mobile pages have better title/description rendering, or (b) the mobile user base is smaller but more targeted. You should verify in GSC's Mobile Usability report that zero pages have mobile-friendly errors, and confirm that mobile and desktop versions serve identical content.

### 4.2 URL Canonicalization Conflicts

GSC reports **64 "Alternate page with proper canonical tag"** pages. While this is technically a "success" status (Google found the canonical and is respecting it), having 64 pages that require canonicalization indicates **duplicate content proliferation**. Each canonicalized page represents crawl budget spent on a URL that will never rank.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  Common sources include:

- Trailing slash vs. non-trailing slash variants (`/page` vs `/page/`)
- Query parameter variants (`?lang=fr`, `?utm_source=...`)
- HTTP vs. HTTPS (should all redirect to HTTPS)
- WWW vs. non-WWW (should be consolidated)

**Fix:** Audit all 64 URLs to identify the duplication pattern, then implement preventive measures (consistent internal linking, proper redirect rules, canonical self-reference on all indexable pages).

### 4.3 Content Freshness Signals

Google's Freshness Systems prioritize recently updated content for queries tied to time-sensitive topics.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  Your legal content covers rapidly changing policy areas (Renters' Rights Act 2026, STEM OPT rules, Canada study permit caps). The `dateModified` field in your Article schema must be updated whenever content is materially changed — not just typo fixes. The brief's §5.7 freshness rules must be enforced: avoid evergreen phrases like "recently" and use explicit dates (e.g., "as of June 2026").

### 4.4 AI Search Visibility Gap

Google's AI Overviews and other generative search features increasingly intercept queries before they reach traditional SERPs. Google's guidelines state that standard SEO best practices apply to AI features — there are no additional requirements.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  However, content that is **cited by AI systems** shares three traits: direct factual answers in the first 200 words, inline citations to primary sources, and clean Article + FAQPage JSON-LD. Your content structure already aligns with these requirements (key takeaways at the top, official sources section), but the missing FAQPage schema is a significant gap for AI citation.

---

## 5. Content Performance Analysis

### 5.1 Top-Performing Pages (What Works)

The following pages demonstrate what happens when content quality, internal linking, and query alignment converge:

| URL | Clicks | Impressions | CTR | Position | Why It Works |
|---|---|---|---|---|---|
| `yousafeconsultancy.com/` | 4 | 101 | 3.96% | 4.29 | Homepage; most-linked page; clear brand query |
| `legal.yousafeconsultancy.com/us/student-visas/international-student-llc-on-opt-guide/` | 3 | 248 | 1.21% | 7.81 | Specific long-tail query; strong E-E-A-T signals; fresh date |
| `legal.yousafeconsultancy.com/uk/tenancy/ground-4a-possession-explained/` | 2 | 45 | 4.44% | 8.89 | UK tenancy pillar; timely (Renters' Rights Act); well-linked |
| `legal.yousafeconsultancy.com/` | 2 | 46 | 4.35% | 5.63 | Legal subdomain homepage; hub for all clusters |
| `legal.yousafeconsultancy.com/us/student-visas/stem-opt-startup-self-employment-rules` | 1 | 349 | 0.29% | 7.87 | High impressions but low CTR — title/meta needs optimization |

### 5.2 Zero-Click Pages (What Fails)

Approximately **85% of tracked pages (513 of 604)** received zero clicks in the 28-day period. The common patterns among these failures:

| Pattern | Example URLs | Root Cause | Fix |
|---|---|---|---|
| University housing guides | `/guide/university-of-missouri-student-housing/` | Thin content; high competition from university sites; no unique angle | Merge into city-level guides or expand with visa-specific angle |
| Deep position pages | `/guide/curricular-practical-training-cpt-guide/` (pos 90.53) | No internal links; orphaned; thin content | Add hub links, expand to ≥1,500 words, or noindex |
| Form pages | `/us/forms/i-94/`, `/us/forms/i-130/` | Compete with USCIS official pages; no added value | Consolidate into "complete guide" articles with form context |
| Duplicate intent | `/us/opt-90-day-unemployment-cap/` vs `/us/student-visas/opt-90-day-unemployment-cap/` | Canonicalization not enforced; both indexed | Pick canonical; 301 redirect the other |
| Location pages without local facts | `/uk/student-tenant-rights/london/` | May fail the 4-local-facts rule | Verify ≥4 distinct local facts or canonicalize to national pillar |

### 5.3 Query Intent Mismatch

![Sitemap Distribution and Query Categories](chart_sitemap_queries.png)
*Figure 4: Left panel — the legal subdomain carries 63% of all URLs (407 of 647), creating a concentration risk. Right panel — query analysis reveals that 27.2% of search demand is for university housing, yet this is where YouSafe has the weakest competitive differentiation against university sites and housing platforms. The true moat lies in the 12.9% UK visa/tenancy and 6.8% employment/OPT queries where legal expertise is the differentiator.*

Analysis of the Queries report reveals a critical strategic insight: **your highest-impression queries are university housing terms** ("auburn university housing" — 68 impressions, "university of michigan housing" — 46 impressions), but your content differentiation is weak. These queries attract students at the **awareness stage** looking for dorm information, yet your pages compete against university official sites, Apartments.com, and niche housing platforms. Your competitive advantage lies not in generic housing data but in the **visa-legal overlay** — housing rights for international students, tenancy law, deposit disputes, and lease review. The query "tenancy deposit dispute" (position 85.5) and "which rent deposit scheme is best for students in scotland" (position 80.5) represent your true differentiation, yet these pages rank poorly due to weak internal linking and thin content.

---

## 6. Enhanced Q3 2026 Master Plan (Revised)

This revised plan incorporates all audit findings and re-prioritizes the remaining 9 weeks (Weeks 3–12) to address P0 blockers before resuming full publishing velocity. The guiding principle is Google's documented hierarchy of ranking factors: **technical crawlability first, then content quality, then E-E-A-T amplification, then link building.**  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

### 6.1 Revised Timeline

| Phase | Weeks | Dates | Focus | Deliverables |
|---|---|---|---|---|
| **P0 Remediation** | 3 | Jun 8–14 | Fix indexing crisis, redirect chains, sitemap hygiene | 267 orphaned pages triaged; sitemap cleaned; 87 redirects fixed |
| **P1 Implementation** | 4–5 | Jun 15–28 | E-E-A-T hardening, schema completion, internal linking | Person schema live; FAQPage on all new articles; hub-spoke wired |
| **Content Batch 3** | 6 | Jun 29–Jul 5 | Canada study permit / PGWP (Week 3 original plan) | 7 articles: PAL/TAL, PGWP eligibility, refusal patterns |
| **Content Batch 4** | 7 | Jul 6–12 | Comparison & conversion (Week 4 original plan) | 7 articles: OPT vs PGWP, housing comparisons, service bridges |
| **Month 2 Evaluation** | 8 | Jul 13–19 | Full audit; CTR optimization; refresh pass | Title/meta rewrites; GSC data analysis; refresh 10 old pages |
| **Content Batch 5** | 9 | Jul 20–26 | US green card / NIW / H-1B bridge | 7 articles: EB-2 NIW, H-1B cap-exempt, Day 1 CPT risk |
| **Content Batch 6** | 10 | Jul 27–Aug 2 | UK Graduate Route / Skilled Worker | 7 articles: Salary thresholds, switching visas, going-rate calc |
| **Content Batch 7** | 11 | Aug 3–9 | Spouse / dependant routes across all countries | 7 articles: F-2, J-2, partner visas, open work permits |
| **Month 3 Evaluation** | 12 | Aug 10–16 | Full retrospective; refresh; Q4 planning | Final metrics; competitor analysis; Q4 keyword roadmap |

### 6.2 P0 Remediation Protocol (Week 3 — June 8–14)

This week supersedes the original Week 3 content batch. No new articles publish until P0 issues are resolved.

**Day 1–2: Orphan Triage (267 URLs)**

Run the orphan rescue protocol from your brief §10.4 on all 267 "Discovered — not indexed" URLs:

| Bucket | Criteria | Action | Expected Count |
|---|---|---|---|
| **Rescue** | Has unique value, ≥700 words, ≥3 incoming links possible | Add internal links from hubs, keep in sitemap | 80–100 |
| **Merge** | Duplicates a stronger indexed page | 301 redirect to canonical, remove from sitemap | 30–50 |
| **Noindex** | Has utility but should not be indexed (utility pages, duplicates) | Add `noindex`, remove from sitemap | 50–80 |
| **Delete** | No value, no demand, no links | Return 410, remove from sitemap | 40–60 |

**Day 3: Redirect Chain Cleanup (87 URLs)**

1. Export all 87 redirect sources from GSC
2. Map each to its final destination
3. Update internal links to point directly to final destinations
4. Verify no chain exceeds 3 hops
5. Fix the 3 redirect errors (broken chains) immediately

**Day 4: Sitemap Inclusion Contract Enforcement**

Implement the automated sitemap rules from your brief §3.2. The sitemap must include a URL **if and only if** all of the following are true:  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

- Responds with HTTP 200
- Has `index` robots meta or absent (default index)
- Canonical URL equals the URL itself (self-canonical)
- Has at least one incoming internal link from an indexable page, OR is an explicitly whitelisted hub
- Has no visible `[VERIFY]` marker or placeholder string
- Has unique title, H1, and meta description
- Is not under excluded paths (`/checkout`, `/cdn-cgi`, `/api`, `/auth`, `/dashboard`, `/portal/app`, `/support/admin`, `/_next`, `/account`)

**Day 5: Guard Script Verification**

Run the full SEO guard suite and confirm zero failures:

```bash
npm run seo:guard    # Orchestrator — all checks
npm run seo:sitemap  # Sitemap inclusion contract
npm run seo:links    # Internal link integrity
npm run seo:meta     # Title/meta uniqueness
npm run seo:content  # Word count, placeholders
npm run seo:schema   # JSON-LD validity
```

**Day 6–7: Re-submit and Request Indexing**

1. Submit cleaned sitemap in GSC for all 6 properties
2. Request indexing on all rescued URLs (batch of 100/day to avoid rate limits)
3. Verify no new "Discovered — not indexed" entries appear within 48 hours

### 6.3 P1 E-E-A-T & Schema Implementation (Weeks 4–5)

**Week 4: Author Entity & Person Schema**

Implement the full author hub system from your brief §4.2 and §11.8:

| Task | Requirement | Verification |
|---|---|---|
| Create `/authors/<slug>` route | Renders name, photo, bio, credentials, knowsAbout, sameAs links | Visual inspection + schema validator |
| Person JSON-LD on each author page | `name`, `jobTitle`, `worksFor`, `knowsAbout` (array), `sameAs` (LinkedIn, bar assoc.) | Rich Results Test |
| Link every article byline to author hub | Breadcrumb-style author link below title | Click test on 10 random articles |
| Honest researcher framing | If no credentialed reviewer, byline says "Researched and edited by" | Content audit on all new articles |
| Editorial policy expansion | `/editorial-policy/` must be ≥600 words, linked from footer | Word count + footer link check |

**Week 5: Schema.org Component Completion**

Create the full component suite from your brief §11.7 and wire into article layout:

```
components/seo/
├── ArticleJsonLd.tsx        # Already partially implemented — extend
├── BreadcrumbListJsonLd.tsx  # NEW — every article and hub
├── FAQPageJsonLd.tsx         # NEW — conditional on 3–8 FAQ pairs
├── HowToJsonLd.tsx           # NEW — conditional on procedural guides
├── PersonJsonLd.tsx          # NEW — author hub pages
├── OrganizationJsonLd.tsx    # NEW — root layout, @type: LegalService
└── LegalServiceJsonLd.tsx    # NEW — service landing pages
```

Each component must: (a) emit server-side only (no client JS), (b) pass Google's Rich Results Test, (c) be validated by `check-schema-validity.mjs`.

### 6.4 Content Publishing Resumes (Weeks 6–11)

With P0 and P1 infrastructure complete, resume the Monday batch publishing at full velocity. The original 20-keyword roadmap from your brief §7 remains valid, but the **keyword scoring rubric** (§6.1) must be enforced strictly — no article ships below 70 points.

**Content Batch Quality Gates (Every Article):**

| Gate | Requirement | Enforcement |
|---|---|---|
| Word count | Legal canonical ≥1,500 words; blog 700–1,200 | `check-content-quality.mjs` |
| Title | ≤70 characters, primary keyword first, no "Guide"/"Ultimate" | `check-metadata-uniqueness.mjs` |
| Meta description | 130–155 characters, includes primary keyword | `check-metadata-uniqueness.mjs` |
| Schema | Article + BreadcrumbList minimum; FAQPage if ≥3 FAQs | `check-schema-validity.mjs` |
| Internal links | Parent pillar + 2–4 siblings + 1 service + 1 official source | `check-internal-links.mjs` |
| E-E-A-T | Byline with author link, "Last verified" date, disclaimer, sources box | Manual review |
| Freshness | `dateModified` updated; explicit policy dates used | `check-content-quality.mjs` |
| Cannibalization | No duplicate primary keyword within cluster | `check-metadata-uniqueness.mjs` |

### 6.5 CTR Optimization Protocol (Week 8 — Month 2 Evaluation)

Dedicated week for search appearance optimization based on GSC data:

1. **Export all queries** with >100 impressions and <3% CTR
2. **Rewrite titles** for each: primary keyword first, add year (2026), use pipes not dashes
3. **Rewrite meta descriptions** for each: restate the query, hint at the answer, promise specificity
4. **Add FAQPage schema** to all pages with ≥3 PAA-harvested questions
5. **Implement BreadcrumbList schema** for breadcrumb rich snippets
6. **Verify mobile title rendering** (mobile titles often truncate earlier than desktop)

**Title Pattern (from brief §9.4):**
```
<primary keyword, leading> | <brand or year hook>
```

Examples of optimized titles:
- `STEM OPT Employer Refuses to Sign I-983: What to Do (2026)` — 60 chars
- `Ground 4A Student Possession Notice Explained (UK 2026)` — 56 chars
- `PGWP Refused for Full-Time Status Gap: How to Respond` — 55 chars

---

## 7. Technical Implementation Checklist

### 7.1 Sitemap Architecture (Per Google Guide §3.2)

Your current sitemap index correctly references 6 subdomain sitemaps. The following refinements are required:

| Sitemap | URLs | Issue | Action |
|---|---|---|---|
| `legal.yousafeconsultancy.com/sitemap.xml` | 407 | Likely includes noindex/canonicalized pages | Enforce inclusion contract; target <350 indexable URLs |
| `usa.yousafeconsultancy.com/sitemap.xml` | 83 | University pages may be thin | Verify each has ≥4 local facts or canonicalize |
| `ca.yousafeconsultancy.com/sitemap.xml` | 32 | Small but growing | Ensure all indexable; no orphan risk |
| `uk.yousafeconsultancy.com/sitemap.xml` | 48 | University pages may be thin | Same verification as USA |
| `portal.yousafeconsultancy.com/sitemap.xml` | 77 | Auth/workspace pages | Verify all are correctly noindex; remove from sitemap if so |
| `yousafeconsultancy.com/sitemap.xml` | ~30 | Main landing + blog | Verify blog summaries don't exceed 1,200 words |

**Total target indexable URLs after cleanup:** ~550 (down from ~647)

### 7.2 robots.txt Requirements

Google's robots.txt guidelines require:  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

- File must be at root of each domain
- Only standard directives (User-agent, Disallow, Allow, Sitemap)
- No non-standard directives like the previously flagged `Content-Signal: search=yes,ai-train=no`

```
User-agent: Googlebot
Disallow: /checkout/
Disallow: /api/
Disallow: /auth/
Disallow: /dashboard/
Disallow: /portal/app/
Disallow: /support/admin/
Disallow: /_next/
Disallow: /account/
Disallow: /cdn-cgi/

User-agent: *
Disallow: /checkout/
Disallow: /api/
Disallow: /auth/
Disallow: /dashboard/

Sitemap: https://yousafeconsultancy.com/sitemap-index.xml
```

### 7.3 Canonicalization Rules

Google's canonicalization guidelines specify:  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

- Use `rel="canonical"` link tag (preferred method) with **absolute URLs**
- Every indexable page must be **self-canonical** (canonical points to itself)
- Never canonicalize to a URL that redirects
- Don't use `noindex` as a substitute for canonicalization
- Be consistent with internal linking (always link to the canonical version)

**Canonical Audit Action:** Run Screaming Frog or equivalent to verify: (a) every indexable page has a canonical tag, (b) all canonicals use absolute HTTPS URLs, (c) no canonical points to a 404 or redirect, (d) no two pages canonicalize to different versions of the same content.

### 7.4 Core Web Vitals Targets

Google's Page Experience system evaluates three Core Web Vitals metrics:  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/) 

| Metric | Target | Your Status | Priority |
|---|---|---|---|
| **Largest Contentful Paint (LCP)** | ≤2.5s | Unverified in GSC | Verify in GSC; optimize images |
| **Interaction to Next Paint (INP)** | ≤200ms | Unverified in GSC | Minimize JavaScript blocking |
| **Cumulative Layout Shift (CLS)** | ≤0.1 | Unverified in GSC | Add image dimensions; reserve ad space |

**Action:** Check GSC's Core Web Vitals report for each property. Any URL marked "Poor" must be fixed before it can rank competitively. Typical fixes for a Next.js site: use `<Image>` with explicit `width`/`height`, defer non-critical JS, preload hero images, and use a CDN for static assets.

---

## 8. E-E-A-T Enhancement Roadmap

### 8.1 Author Credentialing System

For YMYL legal content, Google's quality raters expect to see **verifiable expertise** behind every article.  [(Search Engine Land)](https://searchengineland.com/guide/ymyl)  Your current "MyCaseworks Editorial" byline does not meet this standard. Implement the following hierarchy:

| Role | Byline Text | Credential Required | Schema |
|---|---|---|---|
| **Legal Author** | "Written by [Name], [Credential]" | J.D. + bar admission, RCIC number, OISC level | `Person` with `sameAs` to bar directory |
| **Researcher** | "Researched and edited by [Name]" | Subject matter expertise, verified background | `Person` with `jobTitle: Legal Researcher` |
| **Reviewer** | "Reviewed by [Name], [Credential], on [Date]" | Active license in relevant jurisdiction | `Person` with review date |

**Implementation:** Create author hub pages at `/authors/<slug>` for every byline. Each page must include: full legal name, credentials with verification links, 80–150 word biography, photograph, topics written about (`knowsAbout`), and external profile links (`sameAs`: LinkedIn, bar association, university). The `Person` JSON-LD must be emitted server-side and validated by the schema guard.

### 8.2 Trust Signals on Every Article

Every article body must include the following trust elements in order:  [(Search Engine Land)](https://searchengineland.com/guide/ymyl) 

1. **Byline block** — Author name (linked to hub), reviewer name if applicable, "Last verified" date
2. **One-sentence answer** — Direct factual answer in the first 200 words
3. **Plain-language disclaimer** — "This article explains how [rule] works as of [month year]. It is not legal advice for your specific case."
4. **Who this is for / not for** — Bullet list of audience inclusions and exclusions
5. **Inline citations** — Every rule, deadline, fee, or threshold links to the primary government source
6. **"Official sources" box** — All cited primary sources with verification dates
7. **"When to get document review" CTA** — Linked to relevant service page
8. **FAQ block** — 4–8 PAA-matched questions with visible answers (mirrored in FAQPage schema)
9. **Last-verified timestamp** — Repeated at bottom of body

### 8.3 Editorial Policy Pages

The following pages must be created or expanded and linked from the global footer:  [(Search Engine Land)](https://searchengineland.com/guide/ymyl) 

| Page | Minimum Words | Purpose | Status |
|---|---|---|---|
| `/editorial-policy/` | 600 | How content is researched, reviewed, dated, corrected | Exists — verify word count |
| `/about/` | 500 | Who YouSafe is, team credentials, service boundaries | Exists — expand |
| `/corrections-policy/` | 300 | How to flag errors; commitment to public correction notes | May need creation |
| `/contact/` | 250 | Contact form + plain-text email | Exists — verify |
| `/terms/` | 400 | Terms of service | Exists |
| `/privacy/` | 400 | Privacy policy | Exists |
| `/refund-policy/` | 400 | Refund policy | Exists — verify ≥400 words |

---

## 9. Backlink & Distribution Strategy

### 9.1 Why Backlinks Matter for YMYL

On-page optimization alone will eventually plateau for YMYL content. Google's Reliable Information Systems and Link Analysis Systems use **domain-level authority signals** to determine whether a legal advice site deserves top rankings.  [(Study in USA or Canada: Visa Document Prep | YouSafe)](https://yousafeconsultancy.com/)  For a site in the immigration law space, the most valuable backlinks come from: `.edu` domains (university international offices), government-adjacent organizations, legal aid nonprofits, and reputable immigration news outlets.

### 9.2 .edu Link Acquisition (Month 2–3)

University international offices maintain "resources for international students" pages that link to selected third-party resources.  [(Semrush)](https://www.semrush.com/blog/ymyl/)  The conversion rate for well-targeted outreach is 5–10% over 60–120 days.

**Process:**
1. Identify the 20 US, 20 UK, and 20 Canada universities with the largest international student populations
2. Find each international office's "resources" or "outside resources" page
3. Map 1–3 specific YouSafe articles that complement (not compete with) their existing links
4. Send a personalized, named email offering the resource — no templates, no mass-send
5. Track responses and links earned in a shared spreadsheet

### 9.3 HARO / Journalist Response (Ongoing)

Monitor HARO, Qwoted, and SourceBottle for journalist queries on immigration, student housing, and visa policy.  [(Semrush)](https://www.semrush.com/blog/ymyl/)  Respond within 6 hours with a quotable expert answer plus verifiable author bio. Target 1–3 backlinks per month on news domains (DR 60+).

### 9.4 Reddit & Community Presence (Ongoing)

Genuine participation in r/iwantout, r/UKvisa, r/CanadaImmigration, r/immigration.  [(Semrush)](https://www.semrush.com/blog/ymyl/)  Rules: one account per platform, real name, answer 5 questions for every 1 link shared, never recycle answers, only link when the article directly answers the top-voted question.

---

## 10. Success Metrics & KPIs

The following targets replace the original strategy's metrics with values grounded in the current GSC baseline:

| Metric | Current Baseline (May 2026) | Month 1 Target (Jul) | Month 2 Target (Aug) | Month 3 Target (Sep) |
|---|---|---|---|---|
| **Total Clicks (28 days)** | 19 | 50 (+163%) | 120 (+140%) | 250 (+108%) |
| **Total Impressions (28 days)** | 8,352 | 15,000 (+80%) | 25,000 (+67%) | 40,000 (+60%) |
| **Average CTR** | 0.22% | 0.50% | 0.80% | 1.20% |
| **Average Position** | 18.8 | 15.0 | 12.0 | 10.0 |
| **Indexed Pages** | ~742 | 800 | 900 | 1,000 |
| "Discovered — not indexed" | 267 | <100 | <50 | <25 |
| **Pages in Position 1–10** | ~192 (31.7%) | 250 | 350 | 450 |
| **Technical Audit Issues** | 8 categories | 3 categories | 1 category | 0 categories |
| **Schema Validity Pass Rate** | ~40% | 80% | 95% | 100% |
| **Orphan Pages** | ~100 | <50 | <25 | <10 |

**Month 1 Milestone:** All P0 issues resolved, sitemap contract enforced, E-E-A-T schema live, 14 new articles published (Weeks 6–7), CTR improved to 0.50%.

**Month 2 Milestone:** 28 additional articles published, title/meta rewrite complete on top 50 pages, first .edu backlink acquired, average position below 15.

**Month 3 Milestone:** 84 total articles published, 90%+ indexed, 50+ pages ranking in top 10 for target keywords, technical audit clean, Q4 roadmap finalized.

---

## 11. Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Google core update during Q3 | Medium | High | Focus on people-first content; avoid any tactic that could be interpreted as manipulation |
| Hreflang reintroduction demand | Low | Medium | Maintain hard ban until per-locale pre-rendered routes exist; document rationale |
| Content reviewer availability | Medium | High | Use honest researcher framing; never fabricate credentials; build reviewer bench |
| Crawl budget exhaustion | Medium | Medium | Sitemap cleanup reduces URL count by ~15%; orphan rescue focuses equity on valuable pages |
| Competitor content refresh | High | Medium | Monitor 5 named competitors monthly; build freshness engine for rapid response |
| AI search reducing traditional CTR | High | Medium | Optimize for AI citation (direct answers, inline citations, FAQPage schema) |

---

## 12. Immediate Action Items (Next 7 Days)

The following tasks must begin immediately upon acceptance of this audit:

| Day | Task | Owner | Deliverable |
|---|---|---|---|
| **1** | Export full list of 267 "Discovered — not indexed" URLs from GSC | SEO Ops | CSV with URL, last crawl date, word count, incoming links |
| **1** | Export full list of 87 redirect URLs from GSC | SEO Ops | CSV with source, destination, hop count |
| **2** | Run Screaming Frog crawl on all 6 subdomains (500 URL limit each) | Technical SEO | Crawl report with title lengths, meta status, canonical data |
| **2** | Verify `robots.txt` on all 6 subdomains has no invalid directives | Technical SEO | Screenshot + directive list |
| **3** | Bucket all 267 orphans per rescue protocol | Content + SEO | 4 buckets with URL lists |
| **3** | Fix 3 redirect errors (broken chains) | Developer | Confirmation + test |
| **4** | Implement sitemap inclusion contract in `sitemap.ts` | Developer | PR with contract logic |
| **4** | Remove noindex pages from all sitemaps | Developer | Sitemap delta report |
| **5** | Add internal links to 80 rescued orphans | Content | Link matrix spreadsheet |
| **5** | Verify all new Week 1–2 articles have Article + BreadcrumbList schema | Technical SEO | Schema validation report |
| **6** | Run full `npm run seo:guard` suite | Developer | Pass/fail report per check |
| **6** | Create author hub page template with Person schema | Developer | Component + sample page |
| **7** | Re-submit all cleaned sitemaps in GSC | SEO Ops | Screenshot confirmation |
| **7** | Request indexing on rescued orphan batches (100/day) | SEO Ops | Tracking spreadsheet |

---

## 13. Conclusion

YouSafe Consultancy has built a **content foundation that is stronger than most competitors** in the international student legal services space. The articles are properly sourced, attorney-reviewed, and structured for readability. The technical infrastructure (Next.js, sitemap generation, guard scripts) is well-architected. However, **the bridge between content quality and search visibility has not been built**. Google's crawlers discover your pages but frequently choose not to index them; when they do index them, the listings appear too deep in SERPs with unoptimized titles and no rich results to attract clicks.

This audit identifies the exact blockage points — **267 pages in indexing limbo, 87 redirect chains, incomplete schema, thin E-E-A-T signals, and a 0.22% CTR crisis** — and maps each fix directly to Google's documented guidelines. The revised Q3 plan front-loads technical remediation (Weeks 3–5) before resuming full content velocity, ensuring that every new article publishes into a clean crawl environment where it has the best possible chance to rank.

The 90-day goal remains achievable: a focused, frequently updated, named-author legal-document knowledge base with **clean technical health, credible E-E-A-T signals, and measurable ranking improvements**. The discipline is in the execution — fixing the foundation before adding more floors.

---

*This audit was conducted in accordance with Google Search Central's SEO Complete Guide (June 2026) and cross-referenced against the YouSafe 3-Month SEO Topical Authority Implementation Brief (v2). All recommendations are actionable, prioritized by ranking impact, and designed to be implemented by the existing Claude Code + developer team.*

---
## APPENDIX D — Week-0 CLI pipeline briefs (verbatim; historical/executed, but the Shared Non-Overlap Contract carries standing pipeline rules)


### D.00_SHARED_NON_OVERLAP_CONTRACT.md

# YouSafe / MyCaseworks SEO Pipeline — Shared Non-Overlap Contract

Use this file in every Kimi 2.6 CLI and Claude Code session.

## Repo

Work only inside the existing repo:

```bash
/Users/phantomdarne/Documents/GitHub/caseworks
```

Never create a new repo. Never run:

```bash
git init
gh repo create
git clone
```

## Roles

- **Kimi 2.6 CLI = implementor / writer**
  - May edit files.
  - May create scripts.
  - May run commands.
  - May commit and push.
  - Must stop after its assigned task.

- **Claude Code = human-quality SEO editor / reviewer**
  - Reviews Kimi's branch.
  - Checks technical SEO, content quality, Semrush regressions, E-E-A-T/YMYL, sitemap, canonical, schema, and internal linking.
  - Returns `APPROVE`, `REQUEST CHANGES`, or `BLOCK`.
  - Does not write new content unless explicitly moved into a revision-review role.

## Non-overlap rules

1. Do not run Kimi and Claude Code at the same time on the same working tree.
2. One branch per week or phase.
3. One tool acts at a time.
4. Kimi writes and stops.
5. Claude reviews and stops.
6. Kimi fixes only Claude's requested changes.
7. Claude gives final approval.
8. No tool starts the next week until the current week is approved.

## Current branch naming

Week 0 infrastructure branch:

```bash
seo-week-00-technical-foundation
```

Future weekly article branches:

```bash
seo-week-01-uk-tenancy
seo-week-02-us-f1-opt
seo-week-03-ca-study-permit-pgwp
```

## Blocked paths

Neither tool may change these unless the operator explicitly authorizes it:

```text
app/checkout/
app/api/stripe/
app/dashboard/
app/auth/
app/portal/
components/checkout/
lib/stripe
lib/auth
support-saas/
portal/
```

## Week 0 allowed paths

Kimi may touch these during Week 0 only when needed:

```text
content/seo-quarter-plan/
docs/seo-briefs/
scripts/
lib/
app/sitemap.xml/
app/robots.txt/
public/robots.txt
app/authors/
content/authors/
app/editorial-policy/
app/corrections-policy/
app/about/
app/refund-policy/
components/article/
components/footer
package.json
.gitignore
```

## Semrush regression rules

Do not reintroduce:

- invalid `robots.txt`
- incorrect URLs in `sitemap.xml`
- hreflang conflicts
- broken internal links
- `/cdn-cgi/l/email-protection` internal links
- low word count pages
- overly long titles
- placeholder markers
- visible `[VERIFY]`, `TODO`, `TBD`, or `lorem ipsum`
- duplicate title/H1/primary keyword among indexable pages
- noindex/canonicalized/redirect/404 URLs in sitemap
- orphan pages in sitemap without a rescue plan

## Hreflang rule

Do not emit hreflang anywhere until true pre-rendered localized routes exist and reciprocal hreflang can be verified.

Client-side translation is not enough.

## Content rule

No visible placeholder markers may appear in articles or policy pages.

If a fact cannot be verified from an official source, rewrite the sentence to avoid the unstable claim or remove it.

## Final handoff rhythm

```text
Kimi implements → Kimi report → Claude review → Kimi fixes → Claude final approval → merge
```

### D.01_KIMI_WEEK_00_IMPLEMENTOR_BRIEF.md

# Kimi 2.6 CLI Brief — Week 0 Technical SEO Foundation

You are **Kimi 2.6 CLI**, the implementor for YouSafe / MyCaseworks SEO Week 0.

Claude Code is the reviewer/editor after you finish. You are the only writer during this phase.

## Working repo

Work only inside:

```bash
/Users/phantomdarne/Documents/GitHub/caseworks
```

Do not create a new repository. Do not run `git init`, `gh repo create`, or `git clone`.

## Branch

Create or use:

```bash
seo-week-00-technical-foundation
```

## Preflight commands

Run before editing:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git status --short
git branch --show-current
```

Confirm the repo root is:

```bash
/Users/phantomdarne/Documents/GitHub/caseworks
```

If not, stop.

## Context files to read first

Read these files before editing. If they are not in the repo, ask the operator to place them under `docs/seo-briefs/`.

```text
docs/seo-briefs/yousafe_3_month_seo_topical_authority_claude_code_brief_v2.md
docs/seo-briefs/SEO_STRATEGY_Q3_2026.md
docs/seo-briefs/Semrush_Site_Audit_yousafeconsultancy.md
docs/seo-briefs/YouSafe-Content-Architecture-Brief-v2.md
docs/seo-briefs/week_00_kimi_claude_instruction_pack.md
docs/seo-briefs/kimi_26_cli_implementor_claude_code_reviewer_seo_playbook.md
docs/seo-briefs/00_SHARED_NON_OVERLAP_CONTRACT.md
```

## Mission

Implement **Week 0 only**: technical SEO foundation and workflow scaffolding.

Do **not** write Week 1 articles yet.

## 1. Create workflow state

Create:

```text
content/seo-quarter-plan/workflow-state.json
```

Use this structure:

```json
{
  "activeWeek": "week-00",
  "activeBranch": "seo-week-00-technical-foundation",
  "writer": "kimi-2.6-cli",
  "reviewer": "claude-code",
  "status": "KIMI_IMPLEMENTING",
  "allowedPaths": [
    "content/seo-quarter-plan/",
    "docs/seo-briefs/",
    "scripts/",
    "lib/",
    "app/sitemap.xml/",
    "app/robots.txt/",
    "public/robots.txt",
    "app/authors/",
    "content/authors/",
    "app/editorial-policy/",
    "app/corrections-policy/",
    "app/about/",
    "app/refund-policy/",
    "components/article/",
    "components/footer",
    "package.json",
    ".gitignore"
  ],
  "blockedPaths": [
    "app/checkout/",
    "app/api/stripe/",
    "app/dashboard/",
    "app/auth/",
    "app/portal/",
    "components/checkout/",
    "lib/stripe",
    "lib/auth",
    "support-saas/",
    "portal/"
  ]
}
```

If the repo uses equivalent paths, adapt only after inspecting the repo. Do not guess silently.

## 2. Create quarter roadmap files

Create:

```text
content/seo-quarter-plan/
├── README.md
├── keyword-roadmap.json
├── weekly-calendar.md
├── publishing-checklist.md
├── monthly-review-template.md
├── competitor-research-template.md
├── refresh-queue.json
└── week-00/
    ├── kimi-report.md
    ├── claude-review.md
    ├── kimi-fix-report.md
    └── final-approval.md
```

The roadmap must reflect:

- Week 0 technical foundation first.
- 7 articles per Monday after Week 0.
- One branch per weekly batch.
- Week 1 = UK tenancy / Renters' Rights.
- Week 2 = US F-1 / OPT / STEM OPT.
- Week 3 = Canada study permit / proof of funds / PGWP.
- Week 4 = evaluation only.
- No new articles during evaluation weeks.

## 3. Create or extend SEO guard scripts

Create or extend these scripts. Do not duplicate existing equivalents.

```text
scripts/seo-audit-guard.mjs
scripts/check-sitemap-health.mjs
scripts/check-internal-links.mjs
scripts/check-metadata-uniqueness.mjs
scripts/check-content-quality.mjs
scripts/check-schema-validity.mjs
```

Each script must:

- exit code `1` on failure
- write JSON report to `.seo/reports/`
- print human-readable summary
- be real, not a fake pass-through script
- catch prior Semrush regressions

Add `.seo/` to `.gitignore`.

Add package scripts without removing existing scripts:

```json
{
  "seo:guard": "node scripts/seo-audit-guard.mjs",
  "seo:sitemap": "node scripts/check-sitemap-health.mjs",
  "seo:links": "node scripts/check-internal-links.mjs",
  "seo:meta": "node scripts/check-metadata-uniqueness.mjs",
  "seo:content": "node scripts/check-content-quality.mjs",
  "seo:schema": "node scripts/check-schema-validity.mjs"
}
```

## 4. Robots cleanup

Find the active robots implementation.

Remove invalid/non-standard directives such as:

```text
Content-Signal: search=yes,ai-train=no
```

Keep only valid robots directives:

```text
User-agent
Allow
Disallow
Sitemap
```

Do not block public article routes.

## 5. Sitemap inclusion contract

Update sitemap generation so `/sitemap.xml` includes only URLs that satisfy all of:

- responds 200
- indexable
- self-canonical
- not redirected
- not canonicalized away
- not noindex
- not under `/checkout`, `/cdn-cgi`, `/api`, `/auth`, `/dashboard`, `/portal`, `/support`, `/_next`, or `/account`
- no visible `[VERIFY]`, `TODO`, `TBD`, `lorem ipsum`, or placeholder strings
- title, H1, and meta description pass uniqueness/length rules
- at least one incoming internal link unless explicitly whitelisted as a hub

Do not include redirect sources, noindex pages, broken pages, or canonicalized-away pages in sitemap.

## 6. Hreflang hard ban

Do not emit hreflang tags.

Do not re-add hreflang until true pre-rendered localized routes exist with reciprocal alternates.

Client-side translation does not count.

## 7. Content quality guard

`check-content-quality.mjs` must fail if an indexable page contains:

```text
[VERIFY
VERIFY OFFICIAL SOURCE
TODO
TBD
lorem ipsum
[answer must match visible body copy]
documents, deadlines, official sources, common pitfalls, FAQs
```

Minimum content gates:

```text
legal canonical: 1,500 meaningful words
blog summary: 700–1,200 meaningful words
hub/guide: 300–700 meaningful words
policy page: at least 250 words
refund policy: at least 400 meaningful words
```

## 8. Metadata guard

`check-metadata-uniqueness.mjs` must fail if:

- title missing
- title over 70 characters
- title under 25 characters
- duplicate title among indexable pages
- missing H1
- duplicate H1 among indexable pages
- missing meta description
- meta description under 70 or over 155 characters
- missing canonical on indexable page
- canonical points to noindex, 404, redirect, or wrong-intent page

## 9. Internal link guard

`check-internal-links.mjs` must fail if:

- any internal link returns 404 or 5xx
- any internal link contains `/cdn-cgi/l/email-protection`
- an indexable article has fewer than 3 incoming internal links, unless explicitly whitelisted as new or hub
- a new article lacks links to parent pillar, siblings, CTA/service page, and official source

## 10. Schema scaffolding

Add or wire server-rendered JSON-LD helpers/components for:

- Article
- BreadcrumbList
- FAQPage
- HowTo where relevant
- Person author pages
- Organization / LegalService where relevant

Do not emit FAQ schema unless the exact questions and answers appear visibly on the page.

## 11. Author and editorial trust scaffold

Create or verify:

```text
app/authors/[slug]/page.tsx
content/authors/
app/editorial-policy/
app/corrections-policy/
app/about/
app/refund-policy/
```

Requirements:

- `/editorial-policy` at least 600 words
- `/corrections-policy` at least 300 words
- `/about` at least 500 words
- `/refund-policy` at least 400 meaningful words
- author pages must not invent credentials
- if no licensed reviewer exists, use honest wording such as “Researched and edited by”

Add these pages to footer navigation if missing.

## 12. Orphan triage framework

Create scripts/data structures to bucket sitemap orphans as:

```text
rescue
merge
noindex
delete
```

Do not mass-delete pages blindly.

Week 0 target is safe triage framework and initial non-destructive cleanup, not destroying content.

## 13. Do not touch

Do not touch:

```text
checkout
Stripe
billing
auth
dashboard
portal
support-saas
user roles
payment or template-product logic
global design tokens
unrelated app routes
```

## 14. Commands to run

Run:

```bash
npm run lint
npm run build
npm run seo:guard
npm run seo:sitemap
npm run seo:links
npm run seo:meta
npm run seo:content
npm run seo:schema
```

If a Week 0 SEO command does not exist, create it. If it fails, fix the cause. Do not weaken the check.

## 15. Final report

Write:

```text
content/seo-quarter-plan/week-00/kimi-report.md
```

Include:

1. Branch name
2. Commit hash
3. Changed files grouped by area
4. Roadmap files created
5. SEO guard scripts created/updated
6. Sitemap inclusion rules implemented
7. Robots cleanup status
8. Hreflang status
9. Schema helpers added/wired
10. Author/editorial pages status
11. Orphan triage status
12. Remaining risks
13. Commands run and results
14. Confirmation that blocked paths were not touched

Then commit, push, and stop.

Do not start Week 1.

### D.02_CLAUDE_WEEK_00_REVIEWER_BRIEF.md

# Claude Code Brief — Week 0 Technical SEO Reviewer

You are **Claude Code**, acting as the human-quality SEO editor and technical reviewer for YouSafe / MyCaseworks Week 0.

Kimi 2.6 CLI is the implementor. You are the reviewer.

Do not start new implementation work unless the operator explicitly asks.

## Review branch

Review:

```bash
seo-week-00-technical-foundation
```

Compare against:

```bash
main
```

Work only inside:

```bash
/Users/phantomdarne/Documents/GitHub/caseworks
```

## Pre-review commands

Run:

```bash
pwd
git rev-parse --show-toplevel
git remote -v
git status --short
git branch --show-current
git diff main...seo-week-00-technical-foundation --stat
git diff main...seo-week-00-technical-foundation --name-only
```

Confirm:

- this is the existing `caseworks` repo
- no new repo was created
- the branch is correct

## Context files to read first

Read:

```text
docs/seo-briefs/yousafe_3_month_seo_topical_authority_claude_code_brief_v2.md
docs/seo-briefs/SEO_STRATEGY_Q3_2026.md
docs/seo-briefs/Semrush_Site_Audit_yousafeconsultancy.md
docs/seo-briefs/YouSafe-Content-Architecture-Brief-v2.md
docs/seo-briefs/week_00_kimi_claude_instruction_pack.md
docs/seo-briefs/kimi_26_cli_implementor_claude_code_reviewer_seo_playbook.md
docs/seo-briefs/00_SHARED_NON_OVERLAP_CONTRACT.md
content/seo-quarter-plan/workflow-state.json
content/seo-quarter-plan/week-00/kimi-report.md
```

If any required file is missing, mark it as a review failure.

## Review mission

Review whether Kimi correctly implemented Week 0 technical foundation.

Review as:

- senior technical SEO auditor
- human SEO editor
- YMYL legal-content QA reviewer
- Semrush regression blocker
- site architecture reviewer

## 1. Scope control

Confirm Kimi did not touch:

```text
app/checkout/
app/api/stripe/
app/dashboard/
app/auth/
app/portal/
components/checkout/
lib/stripe
lib/auth
support-saas/
portal/
```

If blocked paths were touched without explicit need, return `BLOCK`.

## 2. Workflow files

Verify:

```text
content/seo-quarter-plan/
├── README.md
├── keyword-roadmap.json
├── weekly-calendar.md
├── publishing-checklist.md
├── monthly-review-template.md
├── competitor-research-template.md
├── refresh-queue.json
├── workflow-state.json
└── week-00/
    ├── kimi-report.md
    ├── claude-review.md
    ├── kimi-fix-report.md
    └── final-approval.md
```

Confirm they reflect:

- Week 0 technical foundation first
- 7 articles every Monday after Week 0
- one branch per weekly batch
- monthly evaluation weeks
- no hreflang
- no placeholder markers
- no blog-canonical cannibalization

## 3. SEO guard scripts

Verify these exist and are wired into `package.json`:

```text
scripts/seo-audit-guard.mjs
scripts/check-sitemap-health.mjs
scripts/check-internal-links.mjs
scripts/check-metadata-uniqueness.mjs
scripts/check-content-quality.mjs
scripts/check-schema-validity.mjs
```

Confirm each:

- exits 1 on failure
- writes JSON report to `.seo/reports/`
- catches prior Semrush regressions
- is not a fake always-pass script

If a script is fake/pass-through, return `BLOCK`.

## 4. Robots review

Confirm:

- no invalid directive such as `Content-Signal: search=yes,ai-train=no`
- sitemap is exposed
- public article routes are not blocked

## 5. Sitemap review

Verify sitemap excludes:

```text
redirects
404/5xx URLs
noindex pages
canonicalized-away pages
/cdn-cgi
/checkout
/api
/auth
/dashboard
/portal
/support
/_next
/account
pages with visible [VERIFY]
pages with broken metadata
pages with no incoming internal links unless whitelisted hubs
```

Fail if sitemap contains known bad URLs or prior Semrush errors.

## 6. Hreflang review

Confirm hreflang is not emitted anywhere.

Search for:

```text
hreflang
alternates.languages
x-default
```

If live hreflang was re-added without true pre-rendered localized routes, return `BLOCK`.

## 7. Content guard review

Verify `check-content-quality.mjs` catches:

```text
[VERIFY
VERIFY OFFICIAL SOURCE
TODO
TBD
lorem ipsum
[answer must match visible body copy]
documents, deadlines, official sources, common pitfalls, FAQs
```

Confirm word-count gates:

```text
legal canonical ≥1,500 words
blog summary 700–1,200 words
hub/guide 300–700 words
policy pages ≥250 words
refund policy ≥400 words
```

## 8. Metadata guard review

Verify `check-metadata-uniqueness.mjs` fails on:

- missing title
- title over 70 characters
- title under 25 characters
- duplicate title among indexable pages
- missing H1
- duplicate H1 among indexable pages
- missing meta description
- meta description under 70 or over 155 characters
- missing canonical on indexable page
- canonical pointing to noindex/404/redirect/wrong-intent page

## 9. Internal link guard review

Verify `check-internal-links.mjs` catches:

- 404 internal links
- 5xx internal links
- `/cdn-cgi/l/email-protection`
- indexable articles with too few incoming internal links
- missing parent/sibling/service/official-source link coverage where required

## 10. Schema review

Verify schema helpers/components exist and are server-rendered for:

- Article
- BreadcrumbList
- FAQPage
- HowTo where relevant
- Person
- Organization / LegalService where relevant

Confirm FAQPage schema is emitted only when exact FAQ text is visible on the page.

## 11. E-E-A-T review

Verify:

- author page scaffold exists
- author pages do not invent credentials
- byline language is honest
- editorial policy exists and is substantive
- corrections policy exists and is substantive
- about page is expanded
- refund policy is expanded
- footer links to trust pages

If credentials are fabricated or overstated, return `BLOCK`.

## 12. Orphan triage review

Verify Kimi created safe orphan triage with buckets:

```text
rescue
merge
noindex
delete
```

Confirm there was no reckless mass deletion.

Confirm orphan cleanup changes are logged and reviewable.

## 13. Run checks

Run:

```bash
npm run lint
npm run build
npm run seo:guard
npm run seo:sitemap
npm run seo:links
npm run seo:meta
npm run seo:content
npm run seo:schema
```

Do not accept missing SEO commands. Week 0 requires them.

If a check fails, determine whether the failure is legitimate. Do not weaken the standard.

## Review output

Write:

```text
content/seo-quarter-plan/week-00/claude-review.md
```

Return exactly one of:

```text
APPROVE
REQUEST CHANGES
BLOCK
```

### APPROVE

Only if:

- Week 0 requirements are implemented
- no fake guard scripts exist
- no Semrush regression is present
- blocked paths were untouched
- all checks pass

### REQUEST CHANGES

Use if:

- scope is correct
- implementation is mostly sound
- issues are fixable in a Kimi revision pass

List exact files and exact changes needed.

### BLOCK

Use if:

- Kimi touched blocked systems
- Kimi created fake scripts
- Kimi created a new repo
- Kimi reintroduced hreflang
- Kimi weakened sitemap/noindex rules
- Kimi fabricated legal credentials
- Kimi mass-deleted pages unsafely
- Kimi bypassed failing tests

Final review must include:

1. Verdict
2. Changed-files risk summary
3. Semrush regression assessment
4. SEO guard script assessment
5. Sitemap/robots/hreflang assessment
6. Content-quality guard assessment
7. Schema assessment
8. E-E-A-T assessment
9. Orphan triage assessment
10. Commands run and results
11. Exact requested changes, if any

Do not implement Week 1.

### D.03_KIMI_WEEK_00_REVISION_PASS.md

# Kimi 2.6 CLI Brief — Week 0 Revision Pass

Use this only if Claude Code returns `REQUEST CHANGES`.

You are Kimi 2.6 CLI. You are now the revision implementor.

## Repo and branch

Work only inside:

```bash
/Users/phantomdarne/Documents/GitHub/caseworks
```

Use the same branch:

```bash
seo-week-00-technical-foundation
```

Do not create a new branch unless the operator instructs you.

## Read first

Read:

```text
content/seo-quarter-plan/week-00/claude-review.md
content/seo-quarter-plan/week-00/kimi-report.md
content/seo-quarter-plan/workflow-state.json
docs/seo-briefs/00_SHARED_NON_OVERLAP_CONTRACT.md
```

## Mission

Fix only the exact issues Claude listed.

Do not add new SEO ideas.
Do not start Week 1.
Do not touch unrelated files.
Do not modify blocked paths.

## Revision rules

1. Address every Claude requested change.
2. If a requested change would require touching blocked files, stop and report.
3. Do not weaken tests to make them pass.
4. Do not silence failures without fixing the underlying issue.
5. Do not reintroduce hreflang.
6. Do not publish placeholder markers.
7. Do not include noindex, redirect, 404, or canonicalized-away pages in sitemap.
8. Do not invent legal credentials or reviewer names.

## Run checks

After fixes, run:

```bash
npm run lint
npm run build
npm run seo:guard
npm run seo:sitemap
npm run seo:links
npm run seo:meta
npm run seo:content
npm run seo:schema
```

## Write fix report

Write:

```text
content/seo-quarter-plan/week-00/kimi-fix-report.md
```

Include:

1. Claude requested changes
2. Files changed to address each request
3. Commands run and results
4. Remaining risks
5. Confirmation blocked paths were not touched

Commit and push the same branch.

Stop after pushing.

### D.04_CLAUDE_WEEK_00_FINAL_APPROVAL.md

# Claude Code Brief — Week 0 Final Approval Review

Use this only after Kimi completes a revision pass.

You are Claude Code, final reviewer.

## Repo and branch

Work only inside:

```bash
/Users/phantomdarne/Documents/GitHub/caseworks
```

Review branch:

```bash
seo-week-00-technical-foundation
```

Compare against:

```bash
main
```

## Read first

Read:

```text
content/seo-quarter-plan/week-00/claude-review.md
content/seo-quarter-plan/week-00/kimi-fix-report.md
content/seo-quarter-plan/workflow-state.json
docs/seo-briefs/00_SHARED_NON_OVERLAP_CONTRACT.md
```

## Mission

Review only the changes made after your previous review.

Do not add new requirements unless the revision created new risk.

## Run checks

Run:

```bash
npm run lint
npm run build
npm run seo:guard
npm run seo:sitemap
npm run seo:links
npm run seo:meta
npm run seo:content
npm run seo:schema
```

## Return one verdict

Write:

```text
content/seo-quarter-plan/week-00/final-approval.md
```

Return exactly one:

```text
APPROVE
REQUEST CHANGES
BLOCK
```

Approve only if:

- all requested changes were fixed
- all checks pass
- no blocked paths were touched
- no Semrush regression remains
- no fake guard scripts exist
- no placeholder markers remain on indexable pages
- hreflang remains banned
- sitemap includes only valid indexable self-canonical URLs

Do not implement Week 1.

### D.05_OPERATOR_SEQUENCE.md

# Operator Sequence — Week 0 Kimi + Claude Pipeline

Use this as your personal control checklist.

## Step 1 — Prepare repo

Place all strategy and brief files in:

```text
/Users/phantomdarne/Documents/GitHub/caseworks/docs/seo-briefs/
```

Include:

```text
yousafe_3_month_seo_topical_authority_claude_code_brief_v2.md
SEO_STRATEGY_Q3_2026.md
Semrush_Site_Audit_yousafeconsultancy.md
YouSafe-Content-Architecture-Brief-v2.md
week_00_kimi_claude_instruction_pack.md
kimi_26_cli_implementor_claude_code_reviewer_seo_playbook.md
00_SHARED_NON_OVERLAP_CONTRACT.md
01_KIMI_WEEK_00_IMPLEMENTOR_BRIEF.md
02_CLAUDE_WEEK_00_REVIEWER_BRIEF.md
03_KIMI_WEEK_00_REVISION_PASS.md
04_CLAUDE_WEEK_00_FINAL_APPROVAL.md
```

## Step 2 — Kimi implements

Open Kimi 2.6 CLI.

Paste:

```text
Read docs/seo-briefs/00_SHARED_NON_OVERLAP_CONTRACT.md and docs/seo-briefs/01_KIMI_WEEK_00_IMPLEMENTOR_BRIEF.md. Implement Week 0 only.
```

Let Kimi work.

Kimi must produce:

```text
content/seo-quarter-plan/week-00/kimi-report.md
```

Kimi commits and pushes:

```text
seo-week-00-technical-foundation
```

Kimi stops.

## Step 3 — Claude reviews

Open Claude Code.

Paste:

```text
Read docs/seo-briefs/00_SHARED_NON_OVERLAP_CONTRACT.md and docs/seo-briefs/02_CLAUDE_WEEK_00_REVIEWER_BRIEF.md. Review Week 0 branch only. Do not implement Week 1.
```

Claude writes:

```text
content/seo-quarter-plan/week-00/claude-review.md
```

Claude returns:

```text
APPROVE
REQUEST CHANGES
BLOCK
```

## Step 4 — If Claude requests changes

Return to Kimi.

Paste:

```text
Read docs/seo-briefs/03_KIMI_WEEK_00_REVISION_PASS.md and content/seo-quarter-plan/week-00/claude-review.md. Fix only Claude's requested changes.
```

Kimi writes:

```text
content/seo-quarter-plan/week-00/kimi-fix-report.md
```

Kimi commits and pushes.

## Step 5 — Claude final approval

Return to Claude.

Paste:

```text
Read docs/seo-briefs/04_CLAUDE_WEEK_00_FINAL_APPROVAL.md. Review only the revision changes and return APPROVE, REQUEST CHANGES, or BLOCK.
```

Claude writes:

```text
content/seo-quarter-plan/week-00/final-approval.md
```

## Step 6 — Do not start Week 1 until approved

Week 1 begins only after Claude returns:

```text
APPROVE
```
