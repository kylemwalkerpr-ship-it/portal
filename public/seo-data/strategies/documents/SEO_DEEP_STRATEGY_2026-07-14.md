# YouSafe Estate — Senior SEO Engineering & Strategy Deep Dive

**Date:** 2026-07-14  
**Audience:** Operator + implementors  
**Companion:** `SEO_AUDIT_COMPLETE_2026-07-14.md` (baseline technical audit)  
**This doc:** Strategy, architecture, measurement truth, cannibalization, conversion math, 90-day operating system

---

## 0 · The strategy in one page

YouSafe is not one website. It is a **four-layer acquisition machine** that is only half-wired:

| Layer | Host(s) | Job | Reality check |
|---|---|---|---|
| **A. Brand** | apex + www | Trust, country picker, blog discovery | Soft dual-host; thin homepage schema |
| **B. Regional acquisition** | usa / ca / uk / au | Win *modifier* queries (`from Nigeria`, `MIT F-1`) | USA/CA are **~95% programmatic** `/from` + `/universities` |
| **C. Authority library** | legal (caseworks) | Win *procedural / YMYL* queries; earn links & AI citations | Strong templates, real attorney E-E-A-T start; **382 `/guide/` pages dominate** |
| **D. Conversion** | market | Monetize intent via gigs/providers | **Only ~4 gigs + ~2 providers in sitemap** — the funnel ends in a nearly empty store |

**Senior diagnosis:** You have built a sophisticated **content factory and technical SEO platform**, but the **business SEO loop is broken at the last mile**. Rankings without supply (marketplace inventory) and without clear layer ownership produce traffic that cannot convert cleanly—and programmatic scale without differentiation invites Google “scaled content” risk.

**The single highest-leverage strategy shift:**

> Stop optimizing as if “more indexable URLs” is the goal.  
> Optimize as if **one searcher has one owner page**, and every owner page has a **real next commercial action with real supply**.

---

## 1 · Architecture map (what actually exists)

### 1.1 Live URL mass (sitemap authority)

| Property | URLs | What they actually are |
|---|---:|---|
| legal | 648 | Library: **382 `/guide/`** + 94 `/us/` + 57 `/uk/` + 35 `/ca/` + 14 `/au/` + templates/topics/compare/blog/services |
| usa | 376 | **203 `/from/*` + 161 `/universities/*`** + ~12 utility |
| ca | 216 | **204 `/from/*`** + ~12 utility |
| uk | 49 | 21 universities + 16 from + utility |
| au | 12 | Utility only — **no geo/uni programmatic layer** |
| market/portal | 77 | Categories/templates/providers + **~4 gigs** |
| apex | 35 | Brand + blog list + policies |
| support | 0 | Correctly empty / noindex |

**Implication:** ~**60%+ of the entire estate URL count is programmatic long-tail** (legal guides + regional from/uni), not hand-crafted procedural pillars.

### 1.2 Legal library composition (the real caseworks product)

```
/guide/     382   ← university + housing scale layer (primary URL mass)
/us/         94   ← US procedural / immigration / housing articles
/uk/         57
/ca/         35
/au/         14
/templates/  11
/topics/     11
/compare/    10
/blog/        4
…utility…
```

Rough theme split of `/guide/` (slug heuristics):
- Housing ~173  
- University-ish ~145  
- Other/visa/life ~64  

**This is a classic “programmatic campus + city housing graph”** bolted onto a smaller set of true legal canonicals.

### 1.3 Regional apps are not “country blogs”

They are **origin-country and university landing factories**:

- USA: `from/{country}` × ~200 + `universities/{slug}` × ~160  
- CA: `from/{country}` × ~200 only  
- UK: thinner copy of the same idea  
- AU: not built  

Sample quality (live DOM):

| Page | Words | Gov citations | Schema | Pattern |
|---|---:|---:|---|---|
| usa/from/nigeria | ~1,160 | **0** | Article+FAQ | Shared H2s: Where you apply / Financial evidence / FAQ |
| usa/from/india | ~1,050 | **0** | same | same template fingerprint |
| usa/universities/mit | ~1,285 | **0** | same | same |
| ca/from/nigeria | ~1,090 | **0** | same | same |
| legal F-1 rights pillar | ~1,920 | **7** | Article+Person+Breadcrumb+… | Distinctive, source-led |
| market category study-permits | ~173 | 0 | ItemList only | Listing shell |

**Implication:** Regional pages can rank for “easy” geo modifiers, but they **do not currently pass the YMYL citation bar** that legal pages do. That is fine *if* they hand off to legal—and dangerous if they try to rank as authoritative procedure guides.

---

## 2 · Measurement truth (your “thin content crisis” is partly fake)

### 2.1 The content-quality tool undercounts real pages

`caseworks/scripts/check-content-quality.mjs` counts words by regexing JSX text nodes in the **page.tsx file only**:

```js
const textNodes = content.match(/>([^<]{3,})</g) || []
const wordCount = visibleText.split(/\s+/).filter(w => w.length > 2).length
```

It **misses**:
- Body copy in imported data modules / props  
- Content injected by `ArticleLayout`, expanded article generators, MDX-like structures  
- FAQ/lede objects that render as real copy  

**Live counterexample:**

| URL | Tool warning (source) | Live DOM words (approx) |
|---|---:|---:|
| `/us/cpt-vs-opt/` | **188w** “thin” | **~1,859w** |
| `/us/renting-austin-students/` | ~1,007w warn | **~2,447w** |
| F-1 rights pillar | various | **~1,920w** + 7 gov links |

Also: **`/guide/` is exempted as “hub”** in the same script—so **382 guide URLs are invisible to the thin-content tracker** even though they are indexable long-form/programmatic pages.

### 2.2 Strategic consequence

The June/July “expand 157 thin pages” program was directionally right for *some* shells, but **you cannot prioritize from `check-content-quality` alone**. Doing so will:

1. Rewrite pages that are already thick live  
2. Ignore the real risk mass (`/guide/` + regional `/from` + `/universities`)  
3. Create false confidence when the gate says PASS

### 2.3 Replace the measurement system (P0 for SEO engineering)

Build / adopt a **rendered-word + unique-n-gram** auditor:

1. Crawl `out/**/*.html` (or live sample) after build  
2. Extract main content CSS selector (article body), not chrome  
3. Count words; count ≥8-word n-grams shared across ≥3 URLs  
4. Count first-party gov citations  
5. Count outbound market links with category/gig specificity  
6. Flag template fingerprint (shared H2 sequence)  

Only then re-open the “thin backlog.”

---

## 3 · Intent ownership model (who should win which query)

### 3.1 Intent classes

| Intent class | Example query | Correct owner | Wrong owner |
|---|---|---|---|
| **Procedural / risk** | “STEM OPT I-983 requirements”, “SEVIS termination reinstatement” | **legal** deep article | regional from page |
| **Checklist / docs** | “study permit document checklist 2026” | **legal** canonical | blog summary |
| **Geo-modified student** | “F-1 visa from Nigeria” | **usa/from/nigeria** *as journey page* → links to legal F-1 pillar | competing legal country page (don’t build) |
| **University-modified** | “MIT F-1 housing / CPT rules” | **Pick ONE:** either legal/guide/{uni} OR usa/universities/{slug} | both ranking for same intent |
| **Comparison** | “OPT vs PGWP” | legal/compare or single compare hub | both brand blog + legal blog + guide |
| **Transactional** | “hire immigration attorney F-1 OPT” | **market** category/gig | legal article as end-state |
| **Brand** | “YouSafe consultancy” | apex | market |

### 3.2 The three-body problem you actually have

For university + F-1 adjacent demand, a searcher can hit:

1. `legal…/guide/{university}-international-student-guide/`  
2. `usa…/universities/{slug}/`  
3. Sometimes a procedural `legal…/us/…` or blog summary  

Example STEM OPT stack (same estate, same intent family):

- `/guide/stem-opt-extension-requirements-2026/`  
- `/us/stem-opt-extension-checklist-2026/`  
- `/us/student-visas/stem-opt-extension-checklist/`  
- `/blog/stem-opt-extension-2026/`  

That is **not topical authority**—that is **self-competition** unless each URL has a deliberately different SERP job (and canonicals/links enforce it).

### 3.3 Ownership rules (adopt as policy)

1. **One primary keyword → one indexable URL** across the *entire estate*, not per-app.  
2. **Regional pages own modifiers** (country, campus lifestyle, embassy/consulate logistics, local document quirks).  
3. **Legal pages own statutes, forms, deadlines, refusal risk, evidence standards.**  
4. **Blog owns newsy / “what changed”** and always defers to legal for procedure.  
5. **Guides on legal are either:**  
   - (A) campus/housing *long-tail satellites* of a legal pillar, **or**  
   - (B) deprecated in favor of regional university pages—**not both at full index**.  
6. **Market owns money queries** and must have supply before SEO investment.

---

## 4 · Cannibalization & scaled-content risk

### 4.1 Programmatic fingerprint risk (High)

Regional `/from` and `/universities` pages share structural fingerprints:

- Same H2 scaffold (“Where you apply”, “Financial evidence”, “Common challenges”, FAQ)  
- Near-identical word budgets (~1.0–1.3k)  
- **Zero government outbound links** in samples  
- Shared brand chrome (“safe path…”)  

Google’s March 2024+ scaled content / site reputation abuse posture is hostile to:

> Large sets of auto-generated pages with thin unique value and little original expertise.

**You are not doomed**—the pages have some localization—but without:

- unique local facts (≥4: consulate, common refusal reasons by post, fee payment rails, document apostille norms, processing anecdotes *from real ops data*),  
- gov citations,  
- and links *into* legal pillars,

…this layer is a **ranking liability at scale**, not an asset.

### 4.2 Dual university graphs (High)

| Graph | Host | Count | Citation quality |
|---|---|---:|---|
| legal `/guide/*university*` | legal | ~145 | varies; stronger chrome |
| usa `/universities/*` | usa | 161 | weak citations in sample |

**Decision required (strategy, not engineering preference):**

**Option A — Legal owns university guides; regional links only**  
- 301 or noindex usa/universities → legal/guide equivalents where 1:1 map exists  
- usa keeps `/from` as acquisition  

**Option B — Regional owns university modifiers; legal merges guides into pillars**  
- noindex or consolidate legal university guides  
- legal keeps procedural US hubs; regional becomes campus SEO engine  

**Option C (status quo) — keep both**  
- Only acceptable if titles/H1s/intents are hard-differentiated (e.g. legal = “visa/status rules at X”, regional = “admissions + housing journey at X”) **and** reciprocal canonical linking is perfect  
- Today this is not disciplined enough → **recommend against C**

**Recommendation:** **Option B** if marketplace/regional is the brand commercial surface; **Option A** if MyCaseworks/legal is the long-term domain authority bet. Given marketplace-led v2.0 thesis, **Option B slightly preferred**—but only after a mapping spreadsheet.

### 4.3 Guide housing vs US housing articles

~173 housing guides + multiple `/us/renting-*` city articles. City legal pages (Austin sample) are strong. Housing *guides* may duplicate city/state tenant angles.

**Rule:** City tenant-rights procedural → `/us/renting-{city}-students/`. Campus housing logistics → one graph only.

### 4.4 Soft www duplicate (Medium-High)

`www` and apex both 200 with apex canonical. Soft-canonical works often—but with multi-subdomain complexity, **hard 301 is non-negotiable hygiene**.

---

## 5 · Conversion SEO (where the strategy actually fails)

### 5.1 Correction to the baseline audit

Earlier baseline said “zero caseworks → market links.” **That was incomplete.**

Reality:
- `MarketplaceClusterCTA` + `marketplaceClusterMap.ts` map **15 clusters → market categories**  
- Live legal articles show **~4–16 market references** (nav/footer/CTA chrome)  
- Inline body links to market categories exist on some expanded pages  

So the problem is **not absence of chrome**. It is:

### 5.2 The empty store problem (Critical)

Live market sitemap supply:

| Type | Count |
|---|---:|
| Gigs | **~4** |
| Providers | **~2** |
| Categories | dozens of shells |

Category page title example: **“Immigration Services (1 services)”** with ~188 words of body.

**SEO law:** You cannot win commercial intent with category pages that advertise empty shelves. Content SEO above an empty marketplace trains bounce and tanks quality signals.

**Strategic priority order must invert:**

1. **Supply** (providers, gigs, templates with real fulfillment)  
2. **Category editorial** (only for categories with ≥3 active offers)  
3. **Caseworks deep links to specific gigs** (not only `/categories/immigration`)  
4. More top-of-funnel URLs  

Doing (3)–(4) without (1) increases traffic that cannot buy.

### 5.3 CTA taxonomy is too coarse

Cluster map examples:

- UK student routes → `study-permits` (US/CA-coded taxonomy smell)  
- Tenancy → `settlement` (not a tenancy-specific catalog)  
- Work visas → `work-permits`  

For conversion rate, CTAs should resolve to:

`/gigs/{specific-offer}` or `/categories/{leaf}` **with inventory**,  
not always top-level buckets.

### 5.4 Portal vs market host confusion (Critical technical + brand)

Live `market` robots.txt:

```
Host: https://portal.yousafeconsultancy.com
Sitemap: https://portal.yousafeconsultancy.com/sitemap.xml
```

While HTML canonicals correctly say `market…`.  
This is a **split-brain preferred-host signal**. Remove `Host` entirely; make robots host-aware if portal and market share a deployment.

### 5.5 Conversion path design (target state)

```
Query → Owner page (one)
   ├─ Answer / trust (E-E-A-T, gov sources)
   ├─ Internal: 2–4 sibling + 1 pillar
   ├─ Soft CTA: matching market category (if supply ≥3)
   └─ Hard CTA: specific gig OR book/intake with UTM
        utm_source=caseworks|usa|ca
        utm_medium=inline|end|cluster
        utm_content={path}
```

No owner page should dead-end on “sign up to portal” without a marketplace object when the query is commercial.

---

## 6 · E-E-A-T / YMYL strategy

### 6.1 What is already good

- Honest schema (no fake AggregateRating / invented LegalService addresses) — guards enforce this  
- Named attorney reviewer path: **Denise Platter Cabrera (CA Bar #298948)** with independent-review framing  
- Editorial policy / corrections / disclaimer surfaces on legal  
- GEO structure on strong legal pages: “In 60 seconds”, “Who this is for”, FAQ, official sources  

### 6.2 What is weak

- Most bylines still **MyCaseworks Editorial** (honest, but low Experience signal)  
- Regional programmatic pages: **no gov sources**, template voice  
- Apex/regional homepages: **no Organization/WebSite JSON-LD** in live samples  
- Cloudflare blocks `GPTBot` / `Google-Extended` while you invest in `/ai` + `llms.txt` — **strategy conflict** if AI Overview / LLM referral is a KPI  

### 6.3 YMYL operating rules

1. Any page giving form numbers, eligibility, or legal consequences must have **≥2 live first-party gov links** in body.  
2. Programmatic pages that cannot clear (1) must **narrow scope** to logistics/journey and defer legal claims to legal.*  
3. Expand attorney-review program by **cluster** (US student work; CA study permit; UK tenancy)—not random articles.  
4. `dateModified` visible + true; fee figures only if non-volatile or clearly dated.  

---

## 7 · Information architecture recommendations

### 7.1 Legal: hub hierarchy that matches how Google clusters topics

Target shape:

```
/us/                          country hub (short)
  /us/student-visas/          PILLAR (currently 404 — critical)
    /us/student-visas/{spoke}
  /us/work-visas/
  /us/family-visas/
  /us/renting-*-students/     city spokes under housing pillar
/guide/                       either satellites OR reduced set
/compare/                     cross-country only
/templates/                   commercial-adjacent, link up to guides
```

**Ship a real `/us/student-visas/` pillar** (or 301 to the F-1 rights guide and update every child). A 404 pillar is an IA wound: orphans spokes, wastes internal links, confuses crawl paths.

### 7.2 Regional: make `/from` and `/universities` “journey hubs,” not pseudo-legal

Required modules on every programmatic page:

1. Unique lede with **local facts** (consulate city, common post-specific issues, currency/funds norms)  
2. “Legal rules live here” box → 2–3 legal deep links  
3. “Get help” → market only if inventory  
4. FAQ unique to that country/uni (not shared stems)  
5. At least one **first-party** official link (embassy, school ISSS, IRCC/USCIS overview)  

If a page cannot earn unique facts, **noindex it**.

### 7.3 AU strategy

AU legal has ~14 solid checklist-style URLs; AU regional has 12 utility pages and **no from/uni graph**.  

**Do not clone 200 `/from` pages to AU** until:

- measurement system is fixed,  
- ownership rules chosen,  
- and marketplace AU supply exists.

Prefer **10 excellent AU legal spokes** + regional service pages over another programmatic farm.

### 7.4 Apex blog

Blog index links into legal library (good). Ensure each blog post:

- targets “what’s new / how to choose / vs” intents only  
- ≤1,200w  
- canonical self, with prominent “full procedure → legal” link  
- does not restate checklist depth  

---

## 8 · Technical strategy (beyond the first audit)

| Item | Why it matters strategically |
|---|---|
| www → apex 301 | Crawl consolidation before multi-host complexity multiplies |
| market Host directive | Prevents preferred-domain confusion on the money domain |
| USA/CA homepage missing canonical | Regional entry pages are paid/organic landing surfaces—must self-canonicalize |
| Homepage JSON-LD missing on apex/usa/ca | Brand entity graph incomplete vs legal |
| `ut-arington` typo slug | Quality / trust spoor in programmatic sets |
| Alias 404s (`/universities/nyu` vs `new-york-university`) | Soft 404 risk if external links use common abbreviations—add alias redirects |
| Sitemap index omits market host explicitly | Portal sitemap emits market URLs (OK) but GSC should have market property + sitemap |
| Guard inventory ≠ live (usa 174 vs 376) | CI lies; fix static route discovery for dynamic `[slug]` maps |
| Content-quality exemptions + undercount | False thin backlog; blind to guides |

---

## 9 · Competitive / SERP strategy (how to play the board)

### 9.1 Where you can win (fit)

- Long-tail procedural: form sequences, refusal recovery, status-violation branches  
- International student housing + visa interaction (underserved combo)  
- Cross-country compare pages (`OPT vs PGWP`) with honest jurisdiction separation  
- Campus-specific *if* unique ISSS/policy facts exist  

### 9.2 Where you will struggle without brand/links

- Head terms: “immigration lawyer”, “F-1 visa”  
- Pure marketplace terms without reviews/supply  
- Generic “study in USA” against governments, British Council, big portals  

### 9.3 Moat design

Your moat is **not word count**. It is:

1. **Operational truth** from real case prep (checklists that match what your consultants actually request)  
2. **Attorney-reviewed accuracy** on YMYL spokes  
3. **Internal graph** that moves users from geo page → procedure → paid brief  
4. **Freshness** tied to policy dates (USCIS/IRCC/UKVI/Home Affairs)  

Publish fewer pages; make each page a **node in a product workflow**.

---

## 10 · Prioritization framework (RICE-style for SEO)

Score each initiative: **Reach × Impact × Confidence / Effort** (1–10 scales).

| Initiative | R | I | C | E | Priority |
|---|---:|---:|---:|---:|---|
| Marketplace supply (gigs/providers) | 10 | 10 | 9 | 8 | **P0 business** |
| Fix measurement (rendered QA) | 8 | 9 | 9 | 4 | **P0 eng** |
| www 301 + market robots Host | 7 | 7 | 10 | 2 | **P0 tech** |
| `/us/student-visas` pillar or 301 | 6 | 8 | 9 | 3 | **P0 IA** |
| Intent ownership map + de-index/merge dupes | 9 | 9 | 7 | 7 | **P1 strategy** |
| University graph consolidation (legal vs usa) | 8 | 8 | 6 | 7 | **P1** |
| Regional unique-facts + gov links pass | 8 | 7 | 7 | 6 | **P1** |
| Category editorial only where supply ≥3 | 6 | 7 | 8 | 4 | **P1** |
| Gig-level CTAs from top legal URLs | 7 | 8 | 7 | 5 | **P1** |
| Attorney review expansion by cluster | 5 | 8 | 6 | 7 | **P2** |
| AU programmatic clone | 4 | 4 | 4 | 8 | **Defer** |
| Mass “expand all thin warnings” | 5 | 3 | 3 | 9 | **Defer / re-measure** |
| hreflang estate-wide | 3 | 2 | 4 | 8 | **Ban remains** |

---

## 11 · 90-day operating system

### Days 0–14 — Stop the bleeding

1. www → apex 301  
2. Remove portal/market `Host` robots confusion  
3. Fix `/us/student-visas`  
4. Ship **rendered content auditor** (even a one-off script on `out/`)  
5. GSC: verify properties for apex, www (then deprecate), legal, usa, ca, uk, au, market; submit sitemap-index + market sitemap  
6. Freeze new programmatic URL generation until ownership decision is signed  

### Days 15–45 — Choose owners & prune

7. Build **estate keyword→URL registry** (spreadsheet): primary KW, owner URL, supporting URLs, market destination, status (index/noindex/301)  
8. Resolve university dual graph (Option A or B)  
9. Resolve STEM OPT / multi-path duplicates (keep one procedural canonical; 301 or noindex others; blog stays summary)  
10. Noindex or consolidate weakest `/from` pages lacking unique facts  
11. Marketplace: minimum viable catalog per money category (target ≥5 gigs in study/work/family before SEO push)  

### Days 46–90 — Depth where it pays

12. Expand/refresh **only** pages that: rank 4–20, have impressions, and fail rendered quality bar  
13. Internal link sprints: every new/updated legal page gets 5 inbound contextual links from existing indexables  
14. Attorney-review wave on top US student-work cluster  
15. Category hubs with inventory: 400–700w editorial + FAQ + ItemList of real gigs  
16. Monthly eval (master plan VI.2): CWV, duplicate-without-canonical, CTR losers, cannibal pairs  

### Explicit non-goals for 90 days

- Cloning CA/USA `/from` volume to AU  
- Adding hreflang  
- Publishing 7 articles/week if ownership registry isn’t ready  
- Expanding pages solely because source word-count warned  

---

## 12 · KPI stack (strategy-grade)

### North-star

**Qualified marketplace clicks from organic landing pages with ≥30s engagement and non-bounce**, not raw organic sessions.

### Supporting KPIs

| KPI | Why |
|---|---|
| % organic landings on “owner” URLs (registry) | Measures cannibalization control |
| Indexable URL count **with** unique main-content ≥800w **and** ≥1 gov citation (YMYL) | Quality-weighted index size |
| Active gigs / category | Supply health |
| CTR from legal→market (Plausible `marketplace_cta_click`) | Funnel |
| GSC cannibal queries (same query, 2+ estate URLs) | Self-competition |
| Pages in pos 4–15 improved to ≤3 | Classic optimization band |
| Soft-404 / crawled-not-indexed rate on `/from` + `/universities` + `/guide` | Programmatic health |

---

## 13 · Revised severity list (strategy lens)

### Critical
1. Marketplace **supply insufficiency** (~4 gigs) vs 1,400 content URLs  
2. **Intent ownership vacuum** across legal guides / regional uni / legal us for same SERPs  
3. **Broken measurement** driving wrong content roadmap  
4. market/portal **Host** split-brain  

### High
5. Programmatic scaled-content risk (`/from`, `/universities`, `/guide` housing/uni) without unique facts + citations  
6. Missing student-visas pillar (404)  
7. www dual hosting  
8. Regional/brand homepage canonical + entity schema gaps  

### Medium
9. Coarse market CTA taxonomy  
10. E-E-A-T concentration (one named attorney)  
11. AI bot blocking vs GEO investment tension  
12. Guard/live inventory drift  

### Low / already good
- Honest schema discipline  
- Support noindex  
- Checkout 301  
- AU in sitemap-index  
- `/ai` + `llms.txt` presence  
- Strong legal page template on best articles (F-1 rights, UK renters act samples)

---

## 14 · What a senior SEO would tell the founder in the room

1. **You over-built inventory of pages and under-built inventory of services.** SEO cannot monetize an empty market.  
2. **Your “thin content” panic is partly a bad ruler.** Fix the ruler before hiring writers to expand hundreds of pages.  
3. **Programmatic SEO is your growth engine and your risk engine.** Same system. Govern it with unique facts or cut it.  
4. **Caseworks is the moat; regional is the net; market is the till.** Wire them as a system, not three brands that happen to share a footer.  
5. **Stop shipping URL volume. Start shipping owner pages with supply-backed CTAs.**  

---

## 15 · Immediate decision checklist (need operator answers)

1. **University SEO owner:** legal `/guide` or usa `/universities`?  
2. **Is marketplace the commercial north star still?** (If yes, supply first.)  
3. **Minimum unique-facts bar** for keeping a `/from` page indexable?  
4. **AI Overview ambition:** open Google-Extended/GPTBot or keep blocked?  
5. **Attorney-review capacity** for next 90 days (articles/month)?  

Until (1)–(2) are answered, engineering should only ship **P0 tech/IA/measurement**, not new content farms.

---

*This deep dive supersedes naive “expand all thin warnings” sequencing from earlier plans where it conflicts. Technical P0 items in `SEO_AUDIT_COMPLETE_2026-07-14.md` remain valid; content prioritization is rewritten by §§2, 3, 5, and 10 above.*

---

## 16 · Implementation log (2026-07-14)

| Deliverable | Location |
|---|---|
| Ownership registry (template + 50 rows) | `OWNERSHIP_REGISTRY.md` + `ownership-registry-v1.csv` |
| Rendered auditor | `caseworks/scripts/seo-rendered-audit.mjs` · `npm run seo:rendered` |
| First auditor run | `.seo/reports/rendered-audit.json` — **710 indexable**; thin mass is **`/guide/`** (avg ~592w, 351 thin), not `/us/` (avg ~2075w) |
| www → apex middleware | `yousafe-consultancy/landing-page/middleware.ts` + `P0_CLOUDFLARE_WWW_REDIRECT.md` |
| robots Host fix | `yousafe-portal/app/robots.ts` (host-aware, no `host:`) · `yousafe-saas/app/robots.ts` |
| `/us/student-visas/` hub | `caseworks/app/us/student-visas/page.tsx` |
| USA/CA homepage canonical | server `page.tsx` wrappers + `home-client.tsx` |
