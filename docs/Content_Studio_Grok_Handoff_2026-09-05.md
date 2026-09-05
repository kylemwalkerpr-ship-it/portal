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

## Current git / Deploy (as of handoff)
| Item | Value |
|------|--------|
| `origin/main` tip | `109ca8f` — `feat(studio): Drafting stage file vault for last 10 jobs` |
| Prior tip | `6d366d3` — `feat(studio): move Jobs queue under Approve & Track` |
| **Live green Deploy** | `2a4da13` — Flesch/Harper JSON-LD strip (run `33950316233` success ~6:47–6:53 AM UTC / ~2:47–2:53 AM ET) |
| **Deploy RED** | `109ca8f` run `33951450540` **FAILED Typecheck** — `studio-drafting-file-vault.tsx:125` Property `bg`/`fg`/`label` does not exist on type `Element` |
| Dirty local (uncommitted) | `package.json` + `package-lock.json` (+TipTap-looking deps, ~10 lines package.json) — **Phase 3 TipTap editor NOT committed yet** |
| Working tree otherwise | Phases 1–2 on origin; TipTap deps dirty only |

**Immediate unblock:** Fix TS in `components/design/studio-drafting-file-vault.tsx` (~L125 status badge typing), commit, push, get Deploy green. Then finish TipTap Phase 3 (deps already partially in dirty package.json).

---

## Scores
| Lens | Score | Notes |
|------|-------|-------|
| Live E2E (2026-09-04) | **42/100** | Original Grok admin audit |
| DeepSeek×4 gaps (2026-09-05) | Code **72/100** · Live **58/100** | `docs/Content_Studio_Pipeline_Gaps_2026-09-05.md` (`e8a6773`) |
| Path to 100 | Not done | Pulse routine still enabled |

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

