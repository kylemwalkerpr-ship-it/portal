# Content Studio — Grok Bot cold-start handoff
**Written:** Sat Sep 5, 2026 ~3:05 AM America/New_York  
**User:** Kyle Walker  
**Outgoing agent:** senior supervisor on my SEO engine (Grok Bot)  
**Purpose:** Resume Content Studio path-to-100 after SuperGrok account switch. Do not restart from the Sept 4 audit; pick up below.

---

## Mission (unchanged)
Drive YouSafe Content Studio (yousafe-portal) to **100% functional**. Zero tolerance for leaving below that bar. Prefer DeepSeek via OpenCode (`entrim/deepseek-ai/DeepSeek-V4-Flash --auto`) for heavy lifts; Grok supervises. Cloud Agents are **not** on this plan. OpenAI/ChatGPT credits were exhausted earlier — implement locally if ChatGPT is requested.

**Repos**
- Portal: `/Users/phantomdarne/Documents/GitHub/yousafe-portal` (Mac `15a2a25d-044a-41d0-89b7-22995bc818c5` / Darnes-MacBook-Air.local)
- Marketing site: `/Users/phantomdarne/Documents/GitHub/yousafe-consultancy`
- Live admin: `https://portal.yousafeconsultancy.com/dashboard/admin/content` (Clerk Super Admin)
- GitHub portal: `kylemwalkerpr-ship-it/portal`

---

## Current git / Deploy (as of this wake ~2:55 PM ET)
| Item | Value |
|------|--------|
| `origin/main` tip | `95604ae` — `fix(seo): stop JSON-LD/orphan-link leaks in consultancy blog render` |
| Recent stack | `0374e31` shipReady stamp · `8e924d6` CF Pages docs · `cc00bd3` factory quality · `eefeec1` I-485 subtype · `2ed9583` SEO Intel lock |
| **Live green Deploy** | `95604ae` run `33985378000` **success** |
| Cancelled (superseded) | Deploys for `0374e31` / `8e924d6` / `cc00bd3` cancelled by newer pushes — tip green is what matters |
| Dirty local (uncommitted) | scratch scripts under `scripts/i129-*` / `scan-body-corruption.mjs` — **do not commit unless asked** |
| Cold-start historical note | Early handoff tip was `109ca8f` vault TS-red; long since superseded — see rescore sections below |

**Immediate unblock (path-to-100):** CF Pages token Pages Edit + Ahrefs recrawl + optional I-129 FAQ JSON-LD — not vault TS.

---

## Scores
| Lens | Score | Notes |
|------|-------|-------|
| Live E2E (2026-09-04) | **42/100** | Original Grok admin audit |
| DeepSeek×4 gaps (2026-09-05) | Code **72/100** · Live **58/100** | `docs/Content_Studio_Pipeline_Gaps_2026-09-05.md` (`e8a6773`) |
| Live E2E after CA+AU (~07:30 AM ET) | **~80/100** | Prior honest rescore in this doc |
| **Live E2E this wake (~2:55 PM ET)** | **88/100** | I-129 chrome + Wave C I-485 + smoke + tip Deploy — see rescore section below |
| Path to 100 | Not done | Pulse routine still enabled; CF Pages token + Ahrefs + FAQ JSON-LD open |

---

## Proven / shipped (do not re-litigate)
- **Blog Approve→GitHub proven:** 7Sisters Admissions Essay — consultancy `7d82204` approve&deploy, `747846e` blog-data, `a87a273` sitemap.
- P0–P1 waves A/B (keyword placement, outline, Grok pin, SEO action, region filter, Review scope) on main earlier.
- `9a24439` Audit&Fix KEEP--- / over-max trim / topic lock / review pin
- `e4e5604` shipGate survives Save fail
- `5a2730f` + `a3e5c89` over-max trim + disclaimer protect (`**Disclaimer:**`)
- `ada24a0` CI vault sync retry + continue-on-error
- `7ade8e4` / `70cc9d0` KEYWORD_PASTED_HEADING deterministic rewrite (outline-safe)
- `1337ad3` persist `audit_json.shipReady`; Save must not wipe gate; modal Approve uses `jobPassesShipGate`
- `d7fc3f7` P0-GEN word-budget: expand enforces budget; disclaimer restore re-trim; outline respects remaining; brief min/max clamped to SPECS
- `2a4da13` Flesch/readability/Harper ignore JSON-LD + markdown chrome (`stripNonClientChrome`, harperText harden)
- `6d366d3` Jobs queue moved under **Approve & Track**
- `109ca8f` Drafting file vault (last 10) — **on main but Deploy red (TS)**

---

## In-flight / unfinished at handoff
1. **Fix Deploy red on vault** (`studio-drafting-file-vault.tsx` type errors) → green Deploy.
2. **Phase 3 TipTap document editor** for Drafting (Google Docs–class + SEO + Harper) — DeepSeek tasked; deps dirty in package.json, **no TipTap component commit yet**. Spec in conversation: additive only; keep Audit&Fix/Re-audit/Trim/Markdown; body-only Flesch.
3. **Harper live re-verify** after `2a4da13`: first browser pass was STALE_DEPLOY (JSON-LD still in Flesch). Post-green re-verify was dispatched; treat as **needs confirmation** — Grammar lint PASS earlier; Flesch/Apply split/Auto-fix/AI Style had fails on stale build; grammar Apply vocab fail + AI Style blank may still be real bugs.
4. **Regional E2E** Canada Express Entry CRS job `c72d74c4` (`c72d74c4-f70e-4a3e-bb77-1156e6baffab`) — title "Canada Express Entry CRS for International Student Graduates: 2026 Guide", region CA, `regional_page`, Express Entry/CRS/IRCC body. Blockers before Approve: `seo_score` 19; bad `canonicalUrl` `https://www.alberta.ca/iqas.aspx/`. Approve not proven for regional. **Do not** use `e1c5e2ee` (`e1c5e2ee-44ab-436b-aca8-3693b18dd427`) — that id is **US Green Card** (stale reuse); quarantine for regional E2E; never Approve as CA proof.
5. **Long-form E2E** — not started.
6. **Live rescore to 100** — pending after regional + long-form + editor work.

---

## DeepSeek Drafting overhaul (user order ~2:56 AM ET)
Phased, additive, do not break pipeline:
1. ✅ Jobs → Approve & Track (`6d366d3`)
2. ⚠️ Vault last-10 (`109ca8f`) — code on main, **Deploy failed TS**
3. ❌ TipTap full editor + SEO/Harper chrome — **not landed**

OpenCode model: `entrim/deepseek-ai/DeepSeek-V4-Flash --variant max --auto`. Do not hijack PAIN OpenCode sessions on Mac.

---

## Gaps doc (authoritative backlog)
`docs/Content_Studio_Pipeline_Gaps_2026-09-05.md`  
Slice audits: `tmp/cs-audit-2026-09-05/01-discover-brief.md` … `04-types-live-gaps.md`

**P0s from rollup — code fixes mostly landed in `d7fc3f7`/`1337ad3`; re-verify live.** Remaining product P1s include Discover→Brief dead intel wiring, stale SEO Intel lock, Wave C regional+long-form E2E, AI Style blank UI, etc.

---

## Routines / ops
- Routine **Content Studio 100% pulse** — enabled, `*/15 9-19 * * 1-5` America/New_York; **stay quiet when no material change** (do not spam). Delete only after live E2E rescore 100 + user stop.
- Mac OpenCode often runs **PAIN** phases — unrelated; ignore for Content Studio.
- Prefer Mac machineId for portal git/gh.

---

## Next actions for new Grok session (ordered)
1. Read this handoff + `docs/Content_Studio_Pipeline_Gaps_2026-09-05.md`.
2. Fix `studio-drafting-file-vault.tsx` TS errors → push → green Deploy.
3. Finish TipTap Drafting editor Phase 3 (commit dirty TipTap deps properly); Deploy; browser smoke Drafting vault + editor + Harper/Flesch (no JSON-LD).
4. Confirm Harper checklist a–f on live I-129 draft; fix any remaining Apply/AI Style bugs.
5. Clerk Super Admin session → finish regional Approve ship proof → long-form E2E → rescore /100.
6. Keep pulse routine until 100%.

## Do not
- Re-run full Sept 4 failure audit from scratch.
- Force-push main.
- Claim 100% until regional + long-form E2E + green Deploy of editor/vault.
- Use Cloud Agents (plan blocked).

## Update (~3:05 AM ET) — Harper re-verify blocked
Post-`2a4da13` browser pass could not validate Harper/Flesch:
- I-129 / Untitled: **No draft body stored** / word count 0; Audit & Fix disabled
- Markdown view: **Unauthorized** banner
- Draft queue: provider timeout / jobs stuck loading
Treat Harper a–f as **still unverified on live**. Next session: restore a job with real body (or re-open after auth), then re-run checklist. Also investigate Unauthorized on draft fetch if it persists after Clerk Super Admin session.

---

## Live rescore after regional + long-form proofs (2026-09-05 ~07:30 AM ET)

**Portal HEAD:** `2852a20` (Deploy green for Approve in-app modal).  
**Method:** Same pillar lens as `docs/Content_Studio_Pipeline_Audit_Report_2026-09-04.md` (max 100) + gaps dual lens. **Not 100%.**

### How score is computed
1. **Live E2E /100** — weighted pillars in the 09-04 audit report (Discover 15 · Brief/SEO 20 · Grok pin 15 · Draft 15 · Review/metrics 15 · Approve→GitHub 10 · cohesion 10). No separate scoreboard API; admin UI shows per-job audit score + `shipReady`, not path-to-100.
2. **Gaps dual score** — `docs/Content_Studio_Pipeline_Gaps_2026-09-05.md` Code vs Live after DeepSeek×4 rollup.
3. **Wave C bar** (`Content_Studio_100_Fix_Plan.md`) — blog + regional + long-form/`article` through Approve→GitHub before claiming 100.

### Current estimate

| Lens | Score | Notes |
|------|------:|-------|
| Live E2E (pillar) | **80 / 100** | Was 42 (09-04) → 58 (gaps) → **~80** after CA regional + AU blog live ships |
| Code (gaps lens) | **88 / 100** | Was 72; P0-GEN + P0-SHIP landed (`d7fc3f7`/`1337ad3`); P1s remain |
| Path to 100 | **Not done** | Pulse routine still enabled |

### Pillar breakdown (honest)

| Stage | Max | Now | Green / open |
|-------|----:|----:|--------------|
| Discover / Ingest / Plan | 15 | 13 | GSC/GA4 bridges + honest radar (`3cfbc93`); multi-stage ingest E2E not freshly walked; cron retry timed out (exit 28) |
| Brief Assembly + SEO Intel | 20 | 15 | Placement/region fixed; **SEO Intel lock still stale on topic/region change (P1-E1)** |
| Grok pin fidelity | 15 | 13 | Grok default Content AI + style-review |
| Draft generation quality | 15 | 12 | TipTap + budget P0s; **`article`→caseworks long-form CS ship still unproven** (AU `91786e3e` is `blog_post`) |
| Review / Audit & Fix / metrics | 15 | 12 | shipReady persist, KEEP chrome gate, AI Style API green ~18–20s on 3 jobs; **I-129 KEEP reaudit before Approve** |
| Approve → GitHub merge | 10 | 8 | Blog + regional live 200 proven; in-app confirm; article→caseworks open; Warwick is sister live page |
| Cohesion | 10 | 7 | Handoff was stale; smoke checklist in `tmp/path-to-100-smoke-checklist.md` |
| **Total** | **100** | **80** | |

### Proven live (do not re-litigate)
- Regional CA CRS `c72d74c4` → https://ca.yousafeconsultancy.com/canada-express-entry-crs-international-student-graduates/ **200**
- AU blog `91786e3e` → https://yousafeconsultancy.com/blog/australia-student-visa-fee-increase **200** (merged)
- UK Warwick sister pages **200** + JSON-LD Article/FAQPage present
- Harper/AI Style sample (Mac, no Approve): AU merged, CA merged, I-129 drafting — all `style_ok` 200 in 17–21s; `harper_ready` body≥40

### Still open (selected)
- SEO Intel lock reset (P1-E1)
- Multi-stage ingest smoke (Discover sync → brief → generate → audit → shipReady)
- I-129 `a80c077c` KEEP reaudit (hold Approve)
- True long-form `article`/`legal_guide` → caseworks Approve→GitHub
- Ahrefs recrawl of shipped URLs
- CF API token CI health beyond Deploy green (Worker secrets hourly OK; content-studio-retry flaky timeout)
- CF/vault Deploy history: latest portal Deploy **success** on `2852a20`

### Next 3 P0 actions
1. Reaudit I-129 `a80c077c` for KEEP chrome / escaped script; only Approve if clean (or quarantine).
2. Fix SEO Intel lock reset on topic/region/keyword change (P1-E1).
3. Run smoke checklist + ship one clean `article`→caseworks Wave C proof; Ahrefs-recrawl CA/AU URLs.

*End rescore update — docs only.*
---

## Live rescore after I-129 chrome fix + multi-stage smoke (2026-09-05 ~2:55 PM ET)

**Portal tip:** `95604ae` — `fix(seo): stop JSON-LD/orphan-link leaks in consultancy blog render`  
**Deploy YouSafe Portal:** run `33985378000` **success** (Build and deploy Worker green). Earlier tip candidates `0374e31` / `8e924d6` / `cc00bd3` Deploys were **cancelled** by newer pushes — tip Deploy is the one that counts.  
**Method:** Same pillar lens as 09-04 audit + prior ~07:30 AM ET rescore (~80). Live HTTP + quality spot-checks this wake. **Not 100%.**

### Score

| Lens | Score | Notes |
|------|------:|-------|
| Live E2E (pillar) | **88 / 100** | Was ~80 after CA+AU; +Wave C I-485 caseworks, I-129 chrome fix, SEO Intel lock, Discover→shipReady smoke, tip Deploy green |
| Code (gaps lens) | **92 / 100** | shipReady stamp, renderTarget durable, subtype guard, factory quality, SEO Intel reset |
| Path to 100 | **Not done** | CF Pages token + Ahrefs recrawl + optional FAQ JSON-LD + residual ops gaps |

### Pillar breakdown (honest)

| Stage | Max | Prior (~80) | Now | Green / open |
|-------|----:|------------:|----:|--------------|
| Discover / Ingest / Plan | 15 | 13 | 14 | GSC/GA4 live in smoke `9a378602` (sync 1768 rows, GA4 `550749414`); not full 15 — cron retry historically flaky |
| Brief Assembly + SEO Intel | 20 | 15 | 17 | **SEO Intel lock reset** `2ed9583`; Grok brief in smoke |
| Grok pin fidelity | 15 | 13 | 14 | Content AI / style-review Grok; smoke style-review 200 |
| Draft generation quality | 15 | 12 | 14 | **Wave C article→caseworks** I-485 live; factory `cc00bd3`; TipTap Phase 3 still not the Wave C bar |
| Review / Audit & Fix / metrics | 15 | 12 | 13 | shipReady stamp `0374e31`; I-129 live dek clean / no KEEP; **optional FAQ JSON-LD not on I-129** (only Org/WebSite) |
| Approve → GitHub merge | 10 | 8 | 9 | Blog + regional + article caseworks all live 200; **CF `CLOUDFLARE_API_TOKEN` still lacks Pages Edit** (Mac OAuth workaround) |
| Cohesion | 10 | 7 | 7 | Smoke artifacts + this rescore; **Ahrefs recrawl still open**; I-129 briefly shipped with chrome (fixed `95604ae` — partial credit only) |
| **Total** | **100** | **80** | **88** | |

### Live proofs verified this wake (HTTP 200 + spot-checks)

| Proof | URL | Spot-check |
|-------|-----|------------|
| CA CRS | https://ca.yousafeconsultancy.com/canada-express-entry-crs-international-student-graduates/ | 200; canonical OK; Related guides = real links; Article+FAQPage JSON-LD; no KEEP |
| AU fee blog | https://yousafeconsultancy.com/blog/australia-student-visa-fee-increase | 200; canonical blog path; Related guides real; no KEEP / no escaped dek |
| I-129 | https://yousafeconsultancy.com/blog/i-129-nonimmigrant-worker-petition/ | 200; **dek clean** (no escaped JSON-LD); Related guides → `legal…/us/` real `<a>`; canonical on blog path (`95604ae` / prior `7067bae` path fix) |
| Wave C I-485 | https://legal.yousafeconsultancy.com/us/form-i485-adjustment-of-status-document-checklist/ | 200; job `8b936567` / caseworks `e57b034`; Article JSON-LD; US AOS (not AU 485) — subtype `eefeec1` |
| UK Warwick sister | https://uk.yousafeconsultancy.com/universities/uk-student-visa-process-for-warwick-university/ | 200; Article+FAQPage; Related guides real |

### Multi-stage smoke

- Job `9a378602-5cec-4048-9fb9-ab2e28fe3435` — Discover→Brief→Generate→Audit→**shipReady STOP** (no Approve)  
- Artifacts: `tmp/path-to-100-smoke/` (`CHECKLIST_RESULTS.md`, `smoke-report.json`, `shipready-persist-evidence.json`)  
- Evidence: `audit_shipReady=true`, blockers=0, seo_score=100, word_count=1197

### Key SHAs (tip → older)

| SHA | What |
|-----|------|
| `95604ae` | stop JSON-LD/orphan-link leaks in consultancy blog render (**tip**; Deploy green) |
| `0374e31` | stamp `audit_json.shipReady` on POST reaudit + drafts Save |
| `8e924d6` | CF Pages token scopes docs + I-485 helper regression tests |
| `cc00bd3` | durable caseworks render quality for factory ships |
| `eefeec1` | Form I-485 = US AOS, not AU graduate 485 |
| `2ed9583` | reset SEO Intel lock on topic/region/keyword change |

### Closed since last rescore (~80 @ `ff39e42` / `2852a20`)

1. SEO Intel lock reset (`2ed9583`)
2. Multi-stage Discover→shipReady smoke PASS (`9a378602`)
3. Wave C long-form `article`→caseworks I-485 live 200
4. I-129 chrome / escaped JSON-LD dek + orphan Related guides fixed live (`95604ae`)
5. I-485 subtype guard + factory render quality + shipReady persist (`eefeec1` / `cc00bd3` / `0374e31`)
6. Tip Deploy green on `95604ae` (run `33985378000`)

### Still open (actionable)

1. **GH `CLOUDFLARE_API_TOKEN` Pages Edit** — CI still broken for Pages write; Mac OAuth workaround only (`docs/ops-cloudflare-pages-token.md`)
2. **Ahrefs recrawl** of shipped CA / AU / I-129 / I-485 / Warwick URLs (if still desired)
3. **Optional FAQ JSON-LD** not re-emitted on live I-129 (FAQ section in HTML; schema = Org/WebSite only)
4. Residual: content-studio-retry cron flakiness; TipTap Phase 3 not required for Wave C bar but unfinished if product wants Docs-class editor
5. Do **not** Approve contaminated IDs (`a80c077c`, `e1c5e2ee`); smoke job `9a378602` left at shipReady on purpose

### Next 3 P0 actions

1. Fix org/repo `CLOUDFLARE_API_TOKEN` scopes → Pages Edit; confirm Pages deploy without Mac OAuth.
2. Ahrefs-recrawl (or GSC URL inspection) on the five live proofs above.
3. Re-emit FAQPage JSON-LD on I-129 (or accept as optional and close) → then re-rescore toward 100.

*End rescore — docs only. No Cloud Agents. No random job Approves.*
