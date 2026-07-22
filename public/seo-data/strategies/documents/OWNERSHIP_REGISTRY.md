# Estate keyword → URL ownership registry

**Version:** 2026-07-14  
**Policy source:** `SEO_DEEP_STRATEGY_2026-07-14.md` §§3, 10  
**Machine-readable sheet:** [`ownership-registry-v1.csv`](./ownership-registry-v1.csv)

## Purpose

One **primary search intent** maps to **one indexable owner URL** across the whole estate (apex, regional, legal, market). Supporting URLs may exist only if they:

1. Target a *different* intent (modifier, news, summary), **and**
2. Link clearly to the owner, **and**
3. Are not competing for the same primary keyword.

## Column definitions

| Column | Meaning |
|---|---|
| `primary_keyword` | Query we intend to win (or defend) |
| `intent_class` | `procedural` · `checklist` · `geo_modifier` · `university_modifier` · `comparison` · `transactional` · `brand` · `news_summary` · `hub` |
| `owner_host` | `legal` · `usa` · `ca` · `uk` · `au` · `apex` · `market` |
| `owner_url` | Absolute canonical owner |
| `supporting_urls` | Pipe-separated URLs allowed to rank for related/long-tail only |
| `action` | `keep` · `301` · `noindex` · `merge` · `build` · `supply_first` |
| `market_destination` | Preferred market URL when inventory exists |
| `status` | `confirmed` · `proposed` · `blocked_on_supply` · `needs_decision` |
| `notes` | Constraints, cannibal risks, measurement notes |

## Standing rules (do not violate)

1. **Procedural / YMYL → legal.** Regional pages hand off; they do not restate form-level law without citations.
2. **Geo “from {country}” → regional `/from/`.** Must link to legal pillars; need ≥4 unique local facts or `noindex`.
3. **University modifiers → one graph only.** Default **proposed:** `usa/universities/{slug}` owns campus journey; legal `/guide/*university*` either supports with distinct intent or consolidates (`needs_decision` until operator picks Option A/B in deep strategy §4.2).
4. **Blog → news/summary only**, always links to legal canonical.
5. **Transactional → market**, but only when category has real supply (`supply_first` otherwise).
6. **Hubs** (`/us/student-visas/`, `/us/work-visas/`) own cluster navigation keywords; spokes own long-tail procedure.

## How to extend

1. Before creating any page, search this CSV + live sitemaps for the primary keyword.
2. If an owner exists → expand owner, do not create sibling.
3. Add a row when shipping a new owner; set `status=confirmed` after deploy + GSC inspection.

## First 50 rows

See CSV. Summary of decisions encoded there:

| Theme | Owner | Losers / supports |
|---|---|---|
| F-1 rights / status | legal `/us/student-visas/f1-visa-rights-…` | blog, generic “F-1 visa” brand pages |
| Student visas hub | legal `/us/student-visas/` (**built 2026-07-14**) | bare 404 fixed |
| STEM OPT procedure | legal `/us/student-visas/opt-stem-opt-complete-guide/` (or checklist spoke) | guide + blog = support/301 candidates |
| CPT vs OPT | legal student-visas or `/us/cpt-vs-opt/` — **one only** (row notes) |
| OPT checklist | legal OPT checklist spoke | regional never owns checklist |
| Study permit CA | legal CA checklist / PGWP pages | ca `/from` = geo only |
| UK renters rights | legal UK tenancy pillar | city pages = local spokes |
| F-1 from Nigeria | usa `/from/nigeria/` | must link legal F-1 pillar |
| MIT F-1 journey | usa `/universities/mit/` | legal guide MIT = needs_decision |
| Hire immigration help | market category/gig | **blocked_on_supply** until ≥3 gigs |
| Brand YouSafe | apex `/` | www 301 to apex |

---

*Registry is the operational source of truth for content sprints. Technical P0 items are separate (robots, www, hubs, auditor).*
