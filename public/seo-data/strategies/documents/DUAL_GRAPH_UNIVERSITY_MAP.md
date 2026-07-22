# Dual university graph map (v1)

**Date:** 2026-07-14  
**Policy default:** Option B — regional hosts own campus journey; legal keeps procedural pillars.  
**Status:** USA + UK maps shipped; full operator sign-off still optional.

## Ownership

| Journey | Owner host | Legal role |
|---|---|---|
| US university campus | `usa.yousafeconsultancy.com/universities/*` | noindex `/guide/*-international-student-guide` satellites + `/us/student-visas/*` procedure |
| UK university campus | `uk.yousafeconsultancy.com/universities/*` | noindex `/guide/uk-*-international-student-guide` satellites + `/uk/*` procedure |
| CA university campus | `ca.yousafeconsultancy.com/universities/*` | No legal campus-guide mass; legal owns `/ca/*` study-permit / PGWP procedure |
| AU campus journey | Not built (strategy: defer /from-uni farm) | Legal owns `/au/*` subclass 500 / 485 procedure; regional is utility + services |

## Files

| File | Purpose |
|---|---|
| `SEO strategies/dual-graph-university-map-v1.csv` | Full row-level ownership recommendations |
| `caseworks/lib/seo/dual-graph-university-map.json` | Runtime legal→usa (`map`), legal→uk (`ukMap`), legal→ca (`caMap`) |
| `caseworks/lib/seo/dual-graph.ts` | Helpers for guide handoff UI |
| `caseworks/lib/seo/dual-graph-aliases.ts` | USA + UK + CA slug aliases |
| `yousafe-consultancy/usa/lib/dual-graph-reverse-map.json` | usa slug → legal satellites |
| `yousafe-consultancy/uk/lib/dual-graph-reverse-map.json` | uk slug → legal satellites |
| `yousafe-consultancy/ca/lib/dual-graph-reverse-map.json` | CA policy + procedure/city handoffs (campus reverse empty) |
| `yousafe-consultancy/au/lib/dual-graph-reverse-map.json` | AU policy + procedure handoffs (no campus farm by design) |

## Stats (generation run)

- Legal uni/housing style guides mapped: **250**
- 1:1 matches to usa universities: **230**
- 1:1 matches to uk universities: **20**
- 1:1 matches to ca universities: **0** (no legal `ca-*` campus farm)
- Unmatched US university guides: **0**
- Unmatched UK university guides: **0**
- Unmatched CA university guides: **0** (none published)
- USA university inventory: **212**
- UK university inventory: **56**
- CA university inventory: **100** DLIs

## Recommended actions (implemented)

1. **Matched US university guides + housing** → keep **noindex** on legal `/guide/*`; surface USA journey URL on-page.
2. **Matched UK university guides** → keep **noindex** on legal `/guide/uk-*`; surface UK journey URL on-page.
3. **Canada** → no legal campus `/guide/*` mass. **ca host owns** `/universities/*` journey; legal owns `/ca/*` procedure + city tenancy. Dual-graph banner + expanded handoffs on ca university pages (Option B procedure graph).
4. **Australia** → no campus farm on either host. **au host owns** intake/settlement; legal owns full `/au/*` procedure map (subclass 500, GS, 485, conditions, refusals, NSW renting). Resources + llms dual-graph notes.
5. **Legal procedural** → `/us/student-visas/*`, `/uk/*`, `/ca/*`, and `/au/*` remain the form/statute owners.
6. **Unmatched** → none remaining for US/UK university guides; housing may still prefer city tenants.

## How to regenerate

From `Documents/GitHub`:

```bash
npx tsx scripts-gen-dual-graph.mts
```

## Operator decision still open

- **Confirm Option B** (recommended) vs Option A (legal owns uni guides; 301 regional → legal).
- Whether to **delete** unmatched legal housing mass vs keep as noindex archives.
