# YouSafe SEO — Maximally Optimal Stack

End-state architecture for Content Studio + GSC + agent MCP.

```
┌──────────────────────────────────────────────────────────────────┐
│  AGENT LAYER (Grok / Cursor / Claude)                            │
│  MCP: mcp-gsc (AminForou)  → live GSC queries, inspect, sitemaps │
│  Skills: weekly report · cannibalization · opportunities · index │
└─────────────────────────────┬────────────────────────────────────┘
                              │ terms / diagnostics
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  PORTAL CONTENT STUDIO  (portal.yousafeconsultancy.com)          │
│  1. GET/POST /api/seo-factory/optimal-plan                       │
│     GSC live/snapshot + authority (AEO/SEO/GEO) + lanes          │
│  2. Auto-Pilot / Keywords / Manual generate (stream)             │
│  3. Estate shipGate (host·path·format) before any Git write      │
│  4. Approve → main + deploy monitor (Workers AI)                 │
│  AI: CF primary → Groq → Gemini → OpenRouter (gig chain)         │
└─────────────────────────────┬────────────────────────────────────┘
                              │ PR / commit
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  ESTATE REPOS                                                    │
│  legal → caseworks (page.tsx)                                    │
│  usa|uk|ca|au|apex → yousafe-consultancy (*.md)                  │
│  market → portal catalogue (*.mdx)                               │
└──────────────────────────────────────────────────────────────────┘
```

## Why this combination (not alternatives)

| Layer | Choice | Why max optimal |
|-------|--------|-----------------|
| First-party demand | **GSC** (not Ahrefs free trials) | Free, truthful, already authorized for yousafe |
| Agent GSC tools | **mcp-gsc** (uvx `mcp-search-console`) | Free MIT, 20 tools, inspect + analytics |
| Planner / ranking | **Studio optimal-plan** (authority + GSC lanes) | Estate-aware; paid MCPs don’t know legal vs usa host |
| Generation | **CF AI + gig fallbacks** | Same free cascade as marketplace AI |
| Ship | **shipGate + Approve→main** | Prevents broken caseworks pages / wrong subdomain |

Paid SEO MCPs (Ahrefs, Semrush, DataForSEO) add **competitor** volume only. Layer them later if you buy API access — never replace GSC + estate gate.

## Credentials (one SA, two consumers)

Use the **same** Search Console service account for portal Worker **and** MCP:

1. GSC → Users → Full (or Restricted with API) for `sc-domain:yousafeconsultancy.com` (+ host properties if used).
2. Save SA JSON to:
   ```bash
   ~/.config/gsc/service_account.json   # mode 600
   ```
3. Worker secret (production): `GSC_SERVICE_ACCOUNT_JSON` + `GSC_SITE_URL=sc-domain:yousafeconsultancy.com`
4. MCP env (local agent):
   - `GSC_CREDENTIALS_PATH=$HOME/.config/gsc/service_account.json`
   - `GSC_SKIP_OAUTH=true`

OAuth desktop client is fine for interactive MCP only; **automation should use SA**.

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
