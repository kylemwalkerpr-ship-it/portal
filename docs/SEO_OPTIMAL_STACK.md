# YouSafe SEO — Maximally Optimal Stack

End-state architecture for Content Studio + GSC + agent MCP.

```
┌──────────────────────────────────────────────────────────────────┐
│  AGENT LAYER (Grok / Cursor / Claude)                            │
│  MCP: mcp-gsc  → live GSC queries, inspect, sitemaps             │
│  Skills: weekly report · cannibalization · opportunities · index │
└─────────────────────────────┬────────────────────────────────────┘
                              │ terms / diagnostics
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  PORTAL SEO WAR ROOM  (portal.yousafeconsultancy.com)            │
│  1. GET/POST /api/seo-factory/war-room                           │
│     CTR curve gap · strike distance · cannibal · AEO hubs        │
│     Noise filter · estimated gain ranking · playbook writeHints  │
│  2. GET/POST /api/seo-factory/optimal-plan                       │
│     War Room first + keyword lanes + authority + estate          │
│  3. Auto-Pilot (useWarRoom:true) / Keywords / Manual stream      │
│  4. Estate shipGate (host·path·format) before any Git write      │
│  5. Approve → main + deploy monitor (Workers AI)                 │
│  AI: Entrim Qwen3.6 27B → Entrim DeepSeek V4 Flash             │
│      (ENTRIM_API_KEY — single-key cascade, no NVIDIA/CF legs)   │
│  Ship door: shipContent only (PR → CI → merge; human may main)   │
│  Prompts: play-specific SERP/AEO tactics (title CTR, strike…)    │
└─────────────────────────────┬────────────────────────────────────┘
                              │ PR → CI green → merge
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  ESTATE REPOS                                                    │
│  legal → caseworks (page.tsx)                                    │
│  usa|uk|ca|au|apex → yousafe-consultancy (*.md)                  │
│  market → portal catalogue (*.mdx)                               │
└──────────────────────────────────────────────────────────────────┘
```

Canonical architecture: **`docs/CONTENT_STUDIO_ARCHITECTURE.md`**.

## Daily automation (midday Kenya)

| Item | Value |
|------|--------|
| Schedule | **12:00 Africa/Nairobi** (`0 9 * * *` UTC) |
| Workflow | `.github/workflows/war-room-daily.yml` |
| Endpoint | `POST /api/cron/war-room-daily` (Bearer `CRON_SECRET`) |
| Volume | **Top 5** War Room plays by estimated ranking gain |
| Ship | `merge` → main (quality + depth gates still apply) |
| Report | Email + `war_room_daily_runs` table + Actions artifact |

**Secrets / vars**

- `CRON_SECRET` — required (same as weekly payouts)
- `WAR_ROOM_REPORT_EMAIL` or `SEO_REPORT_EMAIL` or `ADMIN_EMAIL` — comma-separated recipients for the daily URL report
- `vars.PORTAL_URL` — optional override (default `https://portal.yousafeconsultancy.com`)

**Manual run:** GitHub → Actions → “SEO War Room Daily (midday Kenya)” → Run workflow (optional dry-run).

Phases (timeout-safe): `plan` → `run` ×5 → `finalize` (persist + email list of work + URLs).

## War Room plays (technician ranking)

| Play | When | Action |
|------|------|--------|
| `title_ctr_rewrite` | Pos 4–15, CTR ≪ expected | Rewrite title/meta/H1 + expand depth |
| `strike_distance` | Pos 11–20, solid impr | Expand to page-1 (checklist, FAQ, entities) |
| `page1_defend` | Pos ≤10 | Refresh FAQ/schema/TL;DR — protect rank |
| `deep_demand_build` | Pos >20, real impr | Full guide / net-new pillar |
| `cannibal_merge` | Same query → multi URLs | One canonical pillar (human merge path) |
| `aeo_entity_hub` | Mid demand, entity-rich | Definition-first + FAQ for AI Overviews |

Priority = estimated gain clicks × authority × play weight. Brand/meal-plan/noise queries are dropped.

## Why this combination (not alternatives)

| Layer | Choice | Why max optimal |
|-------|--------|-----------------|
| First-party demand | **GSC** (not Ahrefs free trials) | Free, truthful, already authorized for yousafe |
| Agent GSC tools | **mcp-gsc** (uvx `mcp-search-console`) | Free MIT, 20 tools, inspect + analytics |
| Ranking engine | **War Room** (CTR gap · strike · cannibal) | Ranks by *gain*, not vanity volume |
| Planner feed | **optimal-plan** (war-room first + lanes) | Estate-aware; paid MCPs don’t know legal vs usa host |
| Generation | **Entrim Qwen3.6 27B → Entrim DeepSeek V4 Flash** (`ENTRIM_API_KEY`) + play prompts | Long-form primary; one-key Entrim cascade |
| Ship | **Single door `shipContent` + CI-gated merge** | Unattended never direct-pushes main |

Paid SEO MCPs (Ahrefs, Semrush, DataForSEO) add **competitor** volume only. Layer them later if you buy API access — never replace GSC + estate gate.

## Credentials (one SA, two consumers)

**Canonical service account (GCP project `yousafe-gsc-reader`):**

```
gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com
```

Use this SA for portal Worker **and** local MCP:

1. **GSC UI (required once per property)**  
   Search Console → Settings → Users and permissions → **Add user**  
   - Email: `gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com`  
   - Permission: **Full**  
   - Property: `sc-domain:yousafeconsultancy.com` (and any URL-prefix properties you still use)

2. **Local MCP key file** (private key JSON for that SA — never commit to git):
   ```bash
   ./scripts/setup-gsc-mcp.sh /path/to/yousafe-gsc-reader-*.json
   # → ~/.config/gsc/service_account.json (mode 600)
   grok mcp doctor gsc
   ```

3. **Worker secrets** (production Content Studio):
   - `GSC_SERVICE_ACCOUNT_JSON` = full JSON key for the same SA  
   - `GSC_SITE_URL=sc-domain:yousafeconsultancy.com`

4. MCP env (already in `~/.grok/config.toml`):
   - `GSC_CREDENTIALS_PATH=$HOME/.config/gsc/service_account.json`
   - `GSC_SKIP_OAUTH=true`

If GSC returns **403**, the SA email is not yet a property user — fix step 1 before debugging tokens.

OAuth desktop client is fine for interactive MCP only; **automation should use this SA**.

## Grok MCP (user config)

`~/.grok/config.toml` includes `[mcp_servers.gsc]`. After placing the SA JSON:

```bash
grok mcp doctor gsc
```

## Daily optimal operator loop

1. **Agent (MCP):** “Top high-impression low-CTR queries for sc-domain:yousafeconsultancy.com last 28d; exclude brand.”
2. **Studio:** Controls dry-run off → Keywords **optimal plan** (or Auto-Pilot with authority mix).
3. **Generate** (stream into workspace) → edit Split/Preview.
4. **Re-audit** → **Approve → main** (or bulk approve drafts).
5. **Monitor CI** → fix if deploy monitor opens an issue.
6. **MCP:** “Inspect canonical URL indexing status after deploy.”

## Agent → Studio handoff format

When MCP returns queries, feed Studio Auto-Pilot:

```http
POST /api/seo-factory/auto-run
{ "terms": ["opt stem extension checklist", "..."], "limit": 3, "shipMode": "none" }
```

Or open Manual with the term → Plan (shows shipGate) → Generate.

Prefer `shipMode: "none"` for agent-drafted batches, then human **Approve → main**.

## Property URL

Always use the property string GSC expects, typically:

```
sc-domain:yousafeconsultancy.com
```

Not a random `https://caseworks.com/` placeholder.

## Safety

- MCP destructive tools off by default (`GSC_ALLOW_DESTRUCTIVE` unset).
- Studio never ships without shipGate (host/path/format).
- Do not commit SA JSON to git.
