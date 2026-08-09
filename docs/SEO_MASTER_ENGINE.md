# SEO Master Engine — Architecture Blueprint

> The strategic brain of the content estate. It plans the full immigrant journey
> across every country we serve, feeds on fresh intelligence daily, and hands
> ranked, compliance-ready missions to the existing War Room / Content Studio
> execution pipeline.

## 1. Concept

The estate (regional sites, blog, caseworks, marketplace catalogue) produces
content that must walk a potential immigrant through the **entire journey**:

```
intent → schools → work → housing → visa → settlement → citizenship → family → relatives
```

× **4 countries** (US · UK · CA · AU). Every page the estate ships should answer
one question inside one (stage × country) cell, interlink to its journey
neighbors, and push the reader toward the marketplace service that solves that
step.

The **SEO Master Engine** is the layer that makes this true:

| Layer | Role | Where |
|---|---|---|
| **Ontology** | The journey map — stages × countries, seed keywords, statutes, services, interlink graph | `lib/seoEngine/ontology.ts` |
| **Knowledge** | Daily ingestion of fresh intel (gov feeds, Google Search Central, Google Trends, GSC signals) | `lib/seoEngine/knowledge.ts` |
| **Compliance** | Deterministic AEO / GEO / YMYL checklist + scorer for every mission | `lib/seoEngine/compliance.ts` |
| **Planner** | Ranks GSC demand × knowledge bias × lifecycle priority into cluster plans | `lib/seoEngine/planner.ts` |
| **Panel** | Master Planner dashboard inside the Command Center | `components/design/admin-seo-engine.tsx` |
| **API** | `GET/POST /api/seo-engine/{lifecycle,knowledge,plan,status}` | `app/api/seo-engine/*` |
| **Cron** | `POST /api/cron/seo-engine-daily` (CRON_SECRET) — knowledge → plan daily | `app/api/cron/seo-engine-daily` |

## 2. What feeds the engine (2026 playbook)

1. **GSC demand** — real query signals (clicks, impressions, position, CTR) via
   the existing OAuth/service-account/snapshot pipeline (`lib/gscAuth`,
   `lib/gscContentBrief`). The planner only works with *real* demand, never
   invented keywords.
2. **Government policy feeds** — USCIS Newsroom, UK Home Office (immigration),
   IRCC News, AU Home Affairs media — scraped daily, deduped by URL, tagged to
   lifecycle stages, AI-summarized (best-effort).
3. **Google Search Central** — the official guidance stream (helpful content,
   AI-search optimization, link best practices) keeps our compliance rules
   aligned with Google's own word.
4. **Google Trends** — daily trending queries per country surface emerging
   demand before it hits GSC.
5. **Life-cycle ontology** — the strategic map that converts raw demand into a
   coherent journey plan, so we never over-cover one stage and starve another.

## 3. AEO / GEO / YMYL compliance (deterministic scorer)

Every cluster plan ships with a 0–100 compliance score and an explicit
checklist:

- **AEO (Answer Engines)** — direct-answer first paragraph, question-form
  headings, FAQ block + FAQPage JSON-LD, statistics panels, procedural steps.
- **GEO (Generative Engines)** — quote-able passages, named authoritative
  sources, entity clarity, semantic HTML, Article/FAQ/Service JSON-LD
  (LLM-citation tactics verified against the Princeton/Georgia Tech GEO study:
  statistics lift LLM visibility ~40%).
- **YMYL (Your Money or Your Life)** — immigration is YMYL-critical:
  statutory anchors cited (INA / IRPA / UK Immigration Rules / Migration Act),
  professional disclaimer, named author with credentials (OISC / CICC / MARA /
  licensed attorney), accuracy date + official-source verification, freshness
  flag.
- **Technical** — title/meta, contextual internal links (Google link best
  practices: descriptive anchors, ≥1 inbound per pillar), IndexNow submission,
  cannibalization guard (cluster id resolved against the live ledger).

The scorer is **deterministic and auditable** — the dashboard shows exactly
which items a plan passes or misses, and why.

## 4. Master Planner flow

```
GSC signals ─┐
             ├─► opportunityScore(stage priority × demand × gap × knowledge bias)
Knowledge ───┤        │
             │        ▼
Ontology ────┘   ranked cluster plans
                    ├─ pillar + spokes + FAQ blueprint
                    ├─ compliance score + checklist
                    ├─ distribution targets (estate repos per content type)
                    ├─ interlink plan (journey neighbors + marketplace CTA)
                    └─ AI-drafted brief narrative (optional, best-effort)
```

Plans persist to `seo_cluster_plans` (idempotent by `cluster_id`). From the
panel, one click ("⚡ Brief") pushes a plan into the Command Center's autopilot
composer, which then flows through the existing quality gates → PR → merge →
deploy → IndexNow.

## 5. Tables (supabase/migrations/20260809_seo_master_engine.sql)

| Table | Purpose |
|---|---|
| `seo_lifecycle_stages` | (stage × country) ontology rows |
| `seo_knowledge` | ingested intel, deduped by URL, tagged to stages/countries |
| `seo_cluster_plans` | planner output, ranked, compliance-scored |
| `seo_engine_runs` | audit trail — every knowledge/plan/daily run logged |
| `seo_engine_config` | engine settings (sources registry, intervals) |

## 6. Daily automation

- GitHub Actions cron (or existing cron infra) calls
  `POST /api/cron/seo-engine-daily` with `Authorization: Bearer $CRON_SECRET`.
- Phase `knowledge` → ingest up to N items per source, AI-summarize (budgeted).
- Phase `plan` → run planner, persist top cluster plans.
- Phase `all` → knowledge then plan.
- Every run recorded in `seo_engine_runs` — verifiable, accountable,
  transparent.

## 7. Manual override (human-in-the-loop)

- Every CTA in the panel is explicit: **Ingest now**, **Run planner**, **Brief**
  (which pre-fills the composer but still requires the admin to launch).
- The planner never ships content; it only plans. Shipping stays behind the
  existing approve/PR gates.
- Knowledge items carry source URLs + timestamps so a human can verify any
  claim before it becomes content.
