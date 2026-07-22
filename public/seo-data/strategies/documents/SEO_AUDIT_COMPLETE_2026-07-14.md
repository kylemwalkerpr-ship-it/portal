# YouSafe Estate — Complete SEO Audit

**Date:** 2026-07-14  
**Scope:** Live crawl + source guards across `caseworks`, `yousafe-consultancy`, `yousafe-portal`, `yousafe-saas`  
**Method:** Live HTTP probes (robots, sitemaps, meta/canonical samples), `seo-audit-guard.mjs` on caseworks + consultancy, content-quality thin-page inventory, prior plan reconciliation (SEO_MASTER_PLAN + May/June audits)

---

## 0 · Executive summary

| Score area | Grade | Notes |
|---|---|---|
| Technical foundation (robots/sitemaps/canonicals) | **B+** | Estate sitemaps healthy; a few critical host/www issues remain |
| On-page metadata uniqueness | **A** | Caseworks: 0 duplicate titles/H1s; 297 indexable |
| Schema / honesty | **A−** | Guards pass; marketing homepages light on JSON-LD |
| Content depth (caseworks) | **C+** | **~147 pages under 1,500w** (warn-only gate); primary growth lever |
| Conversion SEO (marketplace) | **D+** | 77 URLs; **zero caseworks → market links** still open |
| Estate consistency | **B** | B1 (AU in index) + B2 (`/ai`, llms.txt) largely done; `host:` still on portal/support |
| AI / GEO readiness | **B** | `/ai` + `llms.txt` live everywhere intended; CF blocks GPTBot / Google-Extended |

**Overall:** The estate is **technically mature and guard-protected**, but organic growth is still blocked by (1) **thin legal content**, (2) **no authority funnel from caseworks → marketplace**, and (3) a handful of **live host/canonical inconsistencies** that confuse crawlers.

**Live indexable inventory (sitemap `<loc>` counts, 2026-07-14):**

| Host | Sitemap URLs |
|---|---:|
| yousafeconsultancy.com | 35 |
| usa.yousafeconsultancy.com | 376 |
| ca.yousafeconsultancy.com | 216 |
| uk.yousafeconsultancy.com | 49 |
| au.yousafeconsultancy.com | 12 |
| legal.yousafeconsultancy.com | 648 |
| portal/market (market.* URLs) | 77 |
| support.yousafeconsultancy.com | 0 (empty by design) |
| **Estate total** | **~1,413** |

---

## 1 · Estate map & roles

| Property | Host | Primary SEO role | Live status |
|---|---|---|---|
| Apex | `yousafeconsultancy.com` | Brand, blog, country picker | 200, indexable |
| www | `www.yousafeconsultancy.com` | Should consolidate to apex | **200 (no redirect)** |
| USA / CA / UK / AU | `*.yousafeconsultancy.com` | Regional service + journey pages | 200, sitemaps OK |
| Caseworks | `legal.yousafeconsultancy.com` | Deep legal / procedural authority | 200, 648 URLs |
| Marketplace | `market.yousafeconsultancy.com` | Conversion / gigs / providers | 200, indexable, 77 URLs |
| Portal | `portal.yousafeconsultancy.com` | Auth members area | Serves market sitemap; host directive issues |
| Support | `support.yousafeconsultancy.com` | Internal helpdesk | **noindex, empty sitemap** ✅ |
| Checkout | `checkout.yousafeconsultancy.com` | Deprecated | **301 → market.** ✅ |

---

## 2 · Automated guard results (source)

### 2.1 caseworks (`legal.*`)
```
seo-audit-guard.mjs → 7/7 PASS
  No Scaffolding, Sitemap Health, Internal Links, Metadata Uniqueness,
  Content Quality (gate), Schema Validity, GEO/AI
```

| Metric | Value |
|---|---|
| Total pages (metadata check) | 305 |
| Indexable | 297 |
| Noindex | 8 |
| Duplicate titles / H1s / keywords | **0** |
| Titles > 60 chars | 1 (`uk/tenancy` 68) + 1 approaching (63) |
| Built sitemap URLs (`out/`) | 649 (host-correct, no dups) |
| Live sitemap URLs | 648 |
| Thin-article noindex markers remaining | **0** |
| Content-quality warnings | **148** (147 low word count + 1 blog over-length) |

**Note:** Content Quality is **warn-only** in the gate (still “PASS”). Thin content is the real backlog, not a green light.

### 2.2 yousafe-consultancy (B3 guard)
```
seo-audit-guard.mjs → 9/9 gating PASS, 37 WARN
```

| App | Guard inventory (source) | Live sitemap |
|---|---:|---:|
| landing-page | 35 | 35 |
| usa | 174 | **376** |
| ca | 15 | **216** |
| uk | 132 | **49** |
| au | 12 | 12 |

**Gap:** The consultancy guard under/over-counts vs live for dynamic routes (`from/[slug]`, `universities/[slug]`, resources maps). Treat **live sitemaps as authority** for inventory; fix the guard’s static inventory for CA/USA/UK so CI matches production.

**WARN cluster:** ~37 pages missing explicit meta descriptions (mostly services/book/about/contact/resources/support/legal policies across usa/ca/uk/au + apex refund-policy). Pages may inherit layout defaults → weaker SERP CTR and possible near-duplicates.

---

## 3 · Live technical findings

### 3.1 Critical / High

| ID | Severity | Finding | Evidence | Fix |
|---|---|---|---|---|
| **T1** | **Critical** | **`www` does not 301 to apex** | Both `https://www…` and apex return **HTTP 200**. Homepage canonical on www correctly points to apex, but dual-host serving still risks crawl budget split and soft-duplicate signals. | Cloudflare: 301 `www` → apex (all paths). Keep HSTS. |
| **T2** | **Critical** | **`market` robots.txt declares wrong Host** | Live `market…/robots.txt` ends with `Host: https://portal.yousafeconsultancy.com` and `Sitemap: https://portal.yousafeconsultancy.com/sitemap.xml`. Sitemap body correctly lists `market.*` URLs. | Remove non-standard `host:` from portal robots (or serve host-aware robots). On market host, robots should not advertise portal as preferred host. Prefer **no Host directive** (Google ignores it; Bing can misread it). |
| **T3** | **High** | **Caseworks thin content backlog** | 147 pages &lt; 1,500w: 48 severe &lt;400, 61 moderate 400–799, 38 near 800–1199. Regions: **US 88 · UK 40 · CA 3 · other 15**. | Resume Track A1: expand genuine canonicals in cluster batches (not FAQ hubs). |
| **T4** | **High** | **Marketplace funnel quality (not absence)** | Cluster CTAs exist (`MarketplaceClusterCTA` + 15 cluster maps); live legal pages show market chrome. **Real issue:** only ~4 gigs / ~2 providers in market sitemap; category pages are shells (“Immigration Services (1 services)”). | Prioritize supply; then gig-level CTAs. See deep strategy §5. |
| **T5** | **High** | **`/us/student-visas` still 404 live** | Live `legal…/us/student-visas[/]` → **404**. Source no longer references bare path (guard links PASS); hub itself missing. External/old links and any residual equity die here. | Add hub page **or** 301 trailing-slash path to `/us/student-visas/f1-visa-rights-international-student-complete-guide/`. |

### 3.2 Medium

| ID | Severity | Finding | Fix |
|---|---|---|---|
| **T6** | Medium | `host:` still in `yousafe-portal` + `yousafe-saas` `robots.ts` | Remove `host` field estate-wide (caseworks/consultancy already clean). |
| **T7** | Medium | Marketing homepages weak structured data | Apex + USA homepage: **0** `application/ld+json` blocks in HTML sample. Legal homepage has 5; legal article sample has 6. | Add honest `Organization` + `WebSite` (and `BreadcrumbList` where relevant) on regional/brand roots without fake ratings. |
| **T8** | Medium | USA homepage: **no canonical detected** in live HTML sample | Apex/www/legal/market have canonicals; usa homepage grep found none. | Verify `generateMetadata` / layout on `usa` root; force absolute self-canonical. |
| **T9** | Medium | Missing explicit meta descriptions on ~37 consultancy utility pages | Guard WARNs | Unique descriptions for services, about, contact, book, resources, support, policies. |
| **T10** | Medium | AU content layer still thin | Live AU sitemap **12 URLs** only | After schema/`/ai` parity (done), prioritize AU article/service depth vs US/CA. |
| **T11** | Medium | Marketplace SEO surface small | 77 URLs (categories/templates/providers/gigs) | Editorial category hubs, provider directory copy, BreadcrumbList, Service schema; keep DB sitemap filters for inactive gigs. |
| **T12** | Medium | Cloudflare managed robots block AI trainers | `GPTBot`, `Google-Extended`, `Applebot-Extended`, etc. Disallow | Intentional for training; note this **reduces AI-overview / LLM citation surface** even with `/ai` + `llms.txt`. Revisit if GEO is a KPI. |

### 3.3 Low / hygiene

| ID | Finding | Notes |
|---|---|---|
| **T13** | Checkout 301 → market | Correct; keep excluded from sitemap index |
| **T14** | Support noindex + empty sitemap | Correct design |
| **T15** | Sitemap index includes AU + legal + portal | **B1 AU gap closed** live |
| **T16** | `/ai` + `llms.txt` 200 on apex, usa, ca, uk, au, legal | **B2 largely closed** |
| **T17** | Title length outliers (caseworks) | 1–2 UK titles 63–68 chars |
| **T18** | Blog summary over max | `blog/stem-opt-extension-2026` 1,255w (max 1,200) |
| **T19** | Pipeline stalled since ~2026-06-19 | STATUS still on CA brief / lock saga; content cadence not running |

---

## 4 · Content audit (caseworks)

### 4.1 Word-count bands (`check-content-quality.mjs`, 2026-07-14)

| Band | Count |
|---|---:|
| Severe &lt; 400w | 48 |
| Moderate 400–799w | 61 |
| Near 800–1,199w | 38 |
| Close 1,200–1,499w | ~0 in parsed set (many “closest” sit 900–1,167) |
| **Total low-word warnings** | **147** |

**By region (path prefix):** US **88** · UK **40** · CA **3** · AU **1** · other **15**

### 4.2 Severe examples (&lt;400w) — expand, merge, or noindex

Intentionally short hubs/FAQs can stay short; **article-shaped** URLs below should not.

Examples of thin article-shaped pages:
- `us/cpt-vs-opt` (188)
- City interview set: `f1-visa-interview-{nairobi,lagos,mumbai,london}` (~222–242)
- `us/day-one-cpt-risk` (251)
- `us/l1a-vs-l1b` (283)
- `us/daca-renewal-2026` (285)
- `us/aos-vs-consular-processing` (291)
- `us/i751-remove-conditions` (298)
- `uk/visa-refusal-admin-review` (207)
- `uk/family-visa-parent-route` (226)
- `uk/spouse-visa-document-checklist` (228)
- `uk/renters-rights-2026` (273)

### 4.3 Best next expansion cluster (highest ROI)

**US student housing / tenancy cluster** (tight internal linking, many 900–1,100w pages close to threshold):
- eviction-notice, renting-austin/bay-area, lease red flags, security deposit, roommate disputes, sublet rules, rent increase, landlord repairs, student-tenant-rights overview

**Then US immigration near-miss:**
- f1-f2-spouse, asylum-i589, sevis-termination, 1040nr, eb1a, tps-renewals, i-765-opt-common-mistakes

**UK tenancy / immigration near-miss:**
- periodic-tenancies-2026, section-21-abolished, renters-rights-act pages, spouse refusal reasons

### 4.4 Quality rules (unchanged — enforce on every expansion)

From master plan I.2–I.6:
- Page-specific prose; no shared ≥8-word n-grams across ≥3 pages
- No Review/AggregateRating/fake LegalService address
- 8 required elements on legal canonicals (answer-first, audience, next decision, controlling source, checklist, risk trigger, worked example, paid-review CTA)
- Government citations only; update `dateModified`
- **≥1 marketplace link** per expanded page (new requirement vs pure A1)

### 4.5 Methodology note

June 2026 source audits used a richer prose counter (JSX + lede/FAQ props) and reported some pages ≥1,500w after expansion. Today’s `check-content-quality` still lists many student-visa paths under 1,500w. **Treat the current tool as the CI tracker**, but spot-check rendered HTML before rewriting already-expanded pages to avoid double work.

---

## 5 · Property-by-property notes

### 5.1 legal.yousafeconsultancy.com (caseworks) — primary organic asset
**Strengths**
- Guard 7/7; unique metadata; honest schema; GEO answer blocks; large sitemap (648)
- Sample article: solid title/canonical/robots + **6 JSON-LD** blocks
- Restore-hook / scaffolding discipline in place

**Gaps**
- Thin depth (~half of tracked pages under target)
- No marketplace funnel links
- Missing `/us/student-visas` hub (404)
- Minimal outbound conversion architecture

### 5.2 Regional apps (usa / ca / uk / au)
**Strengths**
- Live sitemaps large on USA/CA; `/ai` + `llms.txt` present
- Checkout deprecated cleanly
- Guard gating passes

**Gaps**
- AU depth (12 URLs)
- UK live sitemap (49) vs source guard (132) — reconcile which inventory is intended
- Missing meta descriptions on utility pages
- USA homepage: weak/missing canonical + no JSON-LD in sample
- Brand/regional vs legal **intent ownership** still needs active linking (not cross-domain canonicals)

### 5.3 market.yousafeconsultancy.com
**Strengths**
- Indexable, self-canonical, DB-backed sitemap with active-gig filters, category/subcategory coverage
- Cap raised to 5,000 (good)

**Gaps**
- Wrong robots Host (portal)
- Only 77 URLs — thin commercial layer vs 648 legal URLs
- Category pages historically listing-heavy (editorial hubs still a growth lever)
- No inbound equity from caseworks

### 5.4 support.yousafeconsultancy.com
Correctly **noindex** + empty sitemap. Remove `host:` for consistency only.

### 5.5 Cloudflare layer
- Managed Content-Signal + bot disallow for AI trainers prepended to app robots
- App sitemap directives still present after CF block (good)
- Confirm GSC property set includes all hosts + sitemap-index submission

---

## 6 · What improved since the June master plan

| Prior open item | Status 2026-07-14 |
|---|---|
| AU missing from sitemap-index | **Fixed live** |
| No `/ai` on brand/regional | **Fixed live** (all 200) |
| llms.txt estate coverage | **Fixed live** |
| Consultancy SEO guard suite | **Present, gating pass** |
| Checkout deprecation | **301 to market** |
| robots `host:` on marketing apps | **Mostly fixed**; still on portal + support |
| Thin-article noindex markers (85) | **Markers gone** (content either expanded or differently handled — re-verify indexability of those URLs) |
| Caseworks thin backlog | **Still open** (primary) |
| Caseworks → market links | **Still open** (primary conversion) |
| www → apex | **Still open** |

---

## 7 · Prioritized action plan

### P0 — This week (high leverage, small PRs)
1. **Cloudflare 301:** `www.yousafeconsultancy.com/*` → `yousafeconsultancy.com/*`
2. **Robots host cleanup:** remove `host` from portal + saas; ensure market host does not advertise portal as preferred host
3. **Fix `/us/student-visas` 404:** hub page or 301 to F-1 rights pillar
4. **USA homepage canonical + Organization/WebSite JSON-LD** (and apex if still missing)

### P1 — Next 2–4 weeks (growth)
5. **Caseworks → market link pass:** start with top 50 legal URLs by impressions/GSC; one contextual link + end CTA to category
6. **Thin expansion Batch A (US severe &lt;400):** ~12 genuine canonicals (not FAQ hubs), CA-Batch-1 quality bar + marketplace link each
7. **Unique meta descriptions** for 37 consultancy utility pages
8. **Title trim** for remaining 60–70 char caseworks titles

### P2 — Next quarter
9. US housing cluster expansion (900–1,100w → ≥1,500w)
10. UK thin immigration/tenancy expansion
11. Marketplace category editorial hubs + BreadcrumbList + Service schema
12. AU content depth program
13. Brand vs legal cannibalization map (same intent → contextual links to legal; no duplicate long-form)
14. Reconcile consultancy guard inventory with live sitemaps (USA/CA/UK)
15. Resume Monday content cadence / pipeline (STATUS stuck mid-June)

### P3 — Strategic / optional
16. Decide Cloudflare AI bot policy vs GEO goals
17. GSC monthly pack (CWV, duplicate-without-canonical, query CTR &lt;3%)
18. Restore-hook archive reconciliation (caseworks A3)
19. hreflang only if true locale routes exist (still correctly banned by default)

---

## 8 · KPI targets (90 days)

| KPI | Baseline (this audit) | 90-day target |
|---|---|---|
| Caseworks pages ≥1,500w (legal canonicals) | Large minority under threshold | +60 expanded pages; severe band &lt;400 cut by ≥70% |
| Caseworks pages with ≥1 market link | ~0% | 100% of new/expanded; ≥40% of top 100 by traffic |
| www consolidation | Soft canonical only | Hard 301; GSC www property de-emphasized |
| market robots Host correctness | Wrong (portal) | No Host / host=market |
| Marketplace organic landing pages | 77 | 77 + editorial hubs; category word count ≥400 |
| Guard regressions | 0 FAIL | Stay 0 FAIL on both guards |

---

## 9 · Tooling reference

```bash
# caseworks
cd caseworks && node scripts/seo-audit-guard.mjs
node scripts/check-content-quality.mjs
node scripts/check-metadata-uniqueness.mjs
node scripts/sitemap-validate.mjs

# consultancy
cd yousafe-consultancy && node scripts/seo-audit-guard.mjs
```

**Live discovery URL for the whole estate:**  
`https://yousafeconsultancy.com/sitemap-index.xml`  
(lists apex, usa, ca, uk, au, legal, portal)

---

## 10 · Out of scope / not re-audited here

- Full GSC / Ahrefs rank & backlink export (Ahrefs MCP unavailable this session)
- Core Web Vitals lab/field (PageSpeed) across 1,400 URLs
- Full on-page crawl of every market gig body
- Competitor SERP analysis for the 20 target keywords
- yousafe-saas feature UX beyond robots/sitemap policy

---

## 11 · Bottom line

The YouSafe estate has a **strong technical spine** (sitemaps, guards, schema honesty, GEO files, multi-region inventory ~1.4k URLs). Rankings and revenue will not unlock from more infrastructure alone. The next decisive work is:

1. **Deepen caseworks content** (thin → authoritative),  
2. **Pipe that authority into the marketplace**, and  
3. **Close the remaining live crawl bugs** (www redirect, market/portal Host, missing student-visas hub, homepage canonical/schema).

Treat this document as the 2026-07-14 baseline superseding stale “zero JSON-LD / AU missing from index” claims while keeping the June content and conversion theses intact.
