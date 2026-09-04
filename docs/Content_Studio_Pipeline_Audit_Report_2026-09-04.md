# YouSafe Content Studio — Pipeline Failure Audit Report

**Date:** 2026-09-04 (America/New_York)  
**Method:** Live Super Admin browser on `portal.yousafeconsultancy.com/dashboard/admin/content`  
**Models:** Grok 4.6 / xAI pinned for brief (+ draft where reached)  
**Intent:** Observe and document systemic failures — **not** rescue individual articles  
**Deploy under test:** `4d5eb99` (and prior studio batch)

---

## Executive score

# **42 / 100**

The upstream engine (ingest + planner) works. The **Brief → Draft handoff is systemically broken** for 2/3 content types via an impossible keyword-placement gate. The one type that reached Draft (blog) then hit an **unrepairable outline blocker** and never reached Approve/GitHub. End-to-end “Discover → merge” is **not operational** under Grok in the admin UI as tested.

| Stage | Score | Max | Notes |
|-------|------:|----:|-------|
| Discover / Ingest / Plan | 14 | 15 | Both engine actions succeeded |
| Brief Assembly + SEO Intel | 6 | 20 | SEO lock works; placement gate P0 |
| Grok pin fidelity | 8 | 15 | Brief pin OK; regen/persist drifts to Entrim |
| Draft generation quality | 5 | 15 | Blog drafted in-window but missed outline; regional/long-form never drafted |
| Review / Audit & Fix / metrics | 4 | 15 | Unpatchable blockers; Re-audit can false-clear; Style gaps |
| Approve → GitHub merge | 1 | 10 | Path exists in code; **0** live ships in this audit |
| Code ↔ product ↔ docs cohesion | 4 | 10 | Handoff “Entrim-only”; SEO action drift; type/repo complexity |
| **Total** | **42** | **100** | |

---

## Runs summary

| Run | Type | Topic | Farthest stage | Outcome |
|-----|------|-------|----------------|---------|
| 1 | `blog_post` | 7Sisters Admissions Essay Alternative: 2026 Checklist | Draft / Review | Ship gate **92/100** blocked (`missing_outline_section`); Approve disabled; no GitHub |
| 2 | `regional_page` | Australian University Application Essay Help: 2026 Step-by-Step Guide | Brief Assembly | **86%** readiness; placement **9/25**; Generate locked; no draft |
| 3 | `article` (long-form) | Australia Student Visa Fee Increase: 2026 Step-by-Step Guide | Brief Assembly | **86%**; placement **14/25** with only **14 UI selectors** for 25 keywords; Generate locked; no draft |

**Prep:** Ingest knowledge OK (136 stored / 592 fetched / 0 errors). Run planner OK (20 plans persisted).

---

## Failure ledger (systemic)

### P0 — Blocks the factory

**F1 / F10 / F14 — Keyword merge vs placement UI (orphan denominator)**  
SEO / full-brief merge expands keywords (often to ~25) but Brief Assembly renders fewer placement controls (14 observed). Gate requires all keywords placed → **Generate mathematically unreachable** without dropping terms or a code fix. Hit on blog (trimmed to pass), regional (stuck 9/25), long-form (stuck 14/25 with only 14 selectors).

**F2 / F7 — Draft can meet word floor while omitting brief outline H2s**  
Blog ~992 words (800–1200 OK) still blocked by `missing_outline_section`. Pipeline generate/audit often omits `outline`; desk later evaluates `contentSpec.outline`.

**F3 — Audit & Fix cannot add headings → `patch_rejected_twice`**  
EditorPatch forbids new `##`. Outline completion pre-pass must succeed; if not, Fix loop rejects twice and leaves document unchanged (looks like a revert). Primary repair UX is a dead end for this blocker class.

**F8 — Re-audit can false-clear**  
`/reaudit` may evaluate **without** `outline` while ship / Audit & Fix still block. Operators cannot trust the Re-audit banner.

### P1 — Corrupts operator decisions

**F4 / F9 — Grok pin lost on regenerate**  
Defaults + `job.ai_provider` overwritten by last runtime provider (cascade to Entrim). UI reads `ai_provider`, not `lineage.ownerProvider`. Regen showed Entrim Qwen after Grok draft.

**F11 — SEO action drift**  
Analyze said `CONSOLIDATE`; writer contract said `WATCH` (regional + long-form).

**F12 / F15 — Region-inappropriate sources / interlinks**  
AU topics retained USCIS/US sources; AU long-form suggested CA/US estate links.

**F13 — Review queue not scoped to current work**  
With no job for the selected brief, Review showed unrelated documents awaiting audit.

### P2 — Secondary / incomplete observation

**F5 — AI Style unavailable** on the blog draft path in this session (despite recent harden).  
**F6 — Approve/GitHub never exercised** in live UI during audit (consequence of P0).  
**Docs drift:** `CONTENT_STUDIO_HANDOFF.md` still “Entrim-only”; catalog treats Grok as live third family.

---

## What worked

- Masthead **Ingest knowledge** + **Run planner** (SSE tape, persisted plans).
- Discover → Research handoff with real opportunity topics.
- Grok 4.6 selectable and successful for **Generate Full Brief** + **Generate SEO Brief** (no silent brief fallback observed).
- Blog: once readiness forced to 100%, generate-stream produced an on-topic body inside the blog word window; Grammar/Flesch/SEO metrics surfaced.
- SEO Intel can lock a writer contract and sync/merge keywords into the Keywords field (even though placement UI then breaks).

---

## Code ↔ product cohesion (high-signal)

| Claimed / implied | Observed |
|-------------------|----------|
| Brief readiness → Generate | Placement denominator > rendered controls → permanent lock |
| Audit & Fix clears ship blockers | Cannot clear `missing_outline_section` via patches |
| Re-audit reflects ship readiness | Can omit outline evaluation |
| Grok end-to-end when pinned | Brief yes; regen/persist drifts to Entrim |
| Approve → main / PR for blog→consultancy, article→caseworks | **Unverified live** — never reached Approve |
| Handoff: Entrim-only AI | UI + catalog: Grok live |

---

## Recommended fix order (for engineering)

1. **Placement gate:** placement rows must equal keyword list (or gate only counts placeable rows); auto-assign leftover KWs to outline H2s / FAQ.
2. **Outline coverage at generate:** pass canonical outline into generate + pipeline audit; fail/stream-complete only when H2s present (or auto-insert sections before desk).
3. **Audit & Fix:** if `missing_outline_section` remains, force outline-completion path (not EditorPatch); never stop at `patch_rejected_twice` without an operator-visible “insert section” action.
4. **Re-audit:** always pass `contentSpec.outline` — same contract as ship.
5. **Provider pin:** persist `ownerProvider` / brief pin; regen picker must not reset to `DEFAULT_DRAFT_PIN` after Grok.
6. **SEO semantics:** single action enum shared by analyze UI + writer contract.
7. **Sources/interlinks:** filter by selected region/host before Evidence gate counts them.
8. **Review scope:** bind Review to current job/brief; don’t list unrelated queue items as the primary surface.

---

## Score rationale (why not lower/higher)

- **Not <35:** Discover/ingest/plan and Grok briefing are real, working product surface area.  
- **Not >55:** Two of three types never drafted; the one that drafted never shipped; repair UX lies; Approve/GitHub unproven in this audit.  
- **42** = “factory can research and brief, but cannot reliably manufacture and ship.”

---

## Artifacts

- Failure notes: `/home/box/content-studio-e2e-audit-notes.md`
- Blog job (blocked): `3fe0ec35-501f-4140-940c-45815d19605b`
