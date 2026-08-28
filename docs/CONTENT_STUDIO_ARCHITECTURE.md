# Content Studio — Architecture (canonical)

**Last updated:** 2026-07-27  
**Live UI:** https://portal.yousafeconsultancy.com/dashboard/admin/content

This document is the source of truth for how Content Studio / SEO Factory is
*supposed* to work. Patches that contradict this model should update the model
here, not invent a second write path.

---

## 1. One sentence

**One job engine** plans ownership, generates with DeepSeek V4 Pro (then
Cloudflare → free tiers), scaffolds + audits, **renders build-safe files**,
ships through **one door** (`shipContent` → `putRepoFile`), and prefers
**PR → CI green → merge** so estate Cloudflare deploys stay green.

---

## 2. System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Admin UI  /dashboard/admin/content                              │
│  admin-command-center · content-studio-workspace                │
└────────────────────────────┬────────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
  seo-factory/*        content-studio/jobs     cron/war-room-daily
  (plan/generate/      (queue approve)         (GH Actions 09:00 UTC)
   auto-run/ship)
     │                       │                       │
     └───────────────────────┼───────────────────────┘
                             ▼
              lib/seoFactory/pipeline.ts
              (ONLY generation orchestration)
                             │
         resolveOwner → AI → scaffold → audit
                             │
                             ▼
              lib/seoFactory/ship.ts  ←── ONLY Git write door
                 renderTarget + depth + quality + shipGate
                             │
                             ▼
              lib/githubContents.putRepoFile
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
     caseworks          yousafe-consultancy    portal
     (legal page.tsx)   (regional *.md)        (catalogue mdx)
          │                  │                  │
          └──────── CF deploy per repo CI ──────┘
```

---

## 3. Invariants (non-negotiable)

| # | Invariant |
|---|-----------|
| I1 | **No Git write outside `shipContent` / `githubContents`.** Legacy routes must call the pipeline or `shipContent`. |
| I2 | **Host ↔ repo** from `HOST_REPO` only (`legal→caseworks`, regional→consultancy, `market→portal`). |
| I3 | **Rendered payload** must pass `assertShipAllowed` before any commit (CTAPanel, FM, path patterns). |
| I4 | **Unattended ships never direct-push `main`.** They open a PR, wait for CI when possible, then merge. Human **Approve → main** may direct-commit. |
| I5 | **AI order:** DeepSeek V4 Pro (NVIDIA) → Cloudflare Workers AI → Groq → Gemini → OpenRouter → rest. |
| I6 | **Content type follows path/host** (`reconcileContentTypeWithPath`) — never `legal_guide` on `usa/content/universities/*`. |

---

## 4. Lifecycle (single state machine)

```
queued → planning → generating → scaffolding → auditing
      → rendering → gated → shipping → verifying_ci
      → deployed | pr_open | held | failed
```

Persisted on `content_jobs` (+ `event_log`, `audit_json`, `deploy_sha`).

| Terminal | Meaning |
|----------|---------|
| `deployed` / `merged` | Commit on `main` (CF deploy triggered) |
| `pr_open` / `pr_created` | PR open; CI may still be running or failed |
| `held` / `drafting` | Quality/ownership gate; no Git write |
| `failed` | Hard error (AI all failed, GitHub 5xx, etc.) |

---

## 5. Quality stack (order)

1. Ownership plan + blockers  
2. AI generate + depth expand  
3. Editorial scaffold (FM, TL;DR, disclaimer, official sources)  
4. `auditContent` scorecard  
5. **On ship:** `assertContentDepth` → `assertQualityGate` → `assertShipAllowed`  
6. **On merge:** poll commit checks; merge only if not failed  

Depth floors (Google-aligned): legal 2200w (target 2500, max 2800) · regional 1200w · blog 800w · gig 500w.

---

## 6. Target file contracts

### caseworks (`legal`)

- Paths: `app/{us,uk,ca,au}/**/page.tsx`, `app/blog/**`, `app/guide/**`, `app/compare/**`, `app/templates/**`, `app/articles/**`, `app/topics/**`
- Must import `ArticleLayout` + `CTAPanel` with `headline`/`body`/`cta`/`href`
- `href` always a non-empty string (Next Link prerender)

### yousafe-consultancy

- `usa|uk|ca|au/content/{from,universities,blog,…}.md` or `landing-page/content/**`
- YAML FM: `title`, `canonical`, `ownerHost`

### portal market

- `catalogue/**/*.mdx`

---

## 7. Entry points (all must use the same engine)

| Entry | Path |
|-------|------|
| Manual stream | `POST /api/seo-factory/generate-stream` |
| Manual JSON | `POST /api/seo-factory/generate` |
| Legacy generate | `POST /api/content-studio/generate` → **delegates to pipeline** |
| Auto-Pilot | `POST /api/seo-factory/auto-run` |
| Queue approve | `PATCH /api/content-studio/jobs` |
| War Room daily | GH Actions → `POST /api/cron/war-room-daily` phases |

---

## 8. Why ships used to fail (structural, not “one bad article”)

1. **Dual write paths** — legacy generate skipped shipGate  
2. **Path model mismatch** — registry `/guide/*` not allowed by shipGate  
3. **Audit on raw AI markdown** without scaffold (missing FM/disclaimer)  
4. **Direct main commits** red-X'd caseworks before any PR safety net  
5. **Sync HTTP War Room** vs Worker timeouts (phased cron is the mitigation)  
6. **Wrong content type** (`legal_guide` on university MD) destroyed depth floors  

---

## 9. Ops checklist

```bash
# Health (admin session)
# Content Studio → Health tab → expect nvidia-deepseek primary

# Worker secrets (pinned on every portal deploy)
CONTENT_AI_PROVIDER=nvidia-deepseek
NVIDIA_DEEPSEEK_MODEL=deepseek-ai/deepseek-v4-flash-0731
NVIDIA_API_KEY=…
GITHUB_TOKEN=…   # content ship PAT
CRON_SECRET=…

# Manual War Room
gh workflow run war-room-daily.yml -f dry_run=true -f limit=1
```

---

## 10. Related code

| Concern | Module |
|---------|--------|
| Pipeline | `lib/seoFactory/pipeline.ts` |
| Ship door | `lib/seoFactory/ship.ts` |
| Gates | `shipGate.ts`, `contentDepth.ts`, `contentQualityGate.ts`, `audit.ts` |
| Render | `renderTarget.ts` |
| Ownership | `ownership.ts` |
| AI | `lib/contentAiProvider.ts` |
| GitHub | `lib/githubContents.ts` |
| Daily | `dailyWarRoom.ts` + `.github/workflows/war-room-daily.yml` |
