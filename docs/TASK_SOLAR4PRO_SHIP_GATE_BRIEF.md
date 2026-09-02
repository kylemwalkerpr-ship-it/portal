# SOLAR 4 PRO — SUPERVISOR BRIEF · Ship-gate & drafting-pipeline investigation

**Issuer:** YouSafe Content Studio (supervisor) · **Model:** Solar 4 Pro (senior staff engineer)
**Mode:** two strictly-orded phases.
  PHASE 1 — PROGRAMMATIC (you, Solar, no browser): investigation → root cause → the smallest coordinated fix set → proof via suite/tsc/build. Nothing here touches the live UI.
  PHASE 2 — LIVE VERIFICATION (supervisor-gated): only AFTER your fixes land on `main` and deploy, the supervisor runs the browser E2E; you review the transcript and close the loop. You do not drive the browser yourself in Phase 1.
**Read before touching code:** `docs/CONTENT_STUDIO_ARCHITECTURE.md` (source of truth), `docs/SEO_MASTER_ENGINE.md`, `CONTENT_STUDIO_HANDOFF.md`.

---

## 1. Mission

Find and fix, at the root, the two unresolved live defects in the drafting/ship pipeline:

1. **Silent ship-withhold**: a stream attempt ended `"error":"Ship withheld · audit 94 · words 2312"` with `"jobId":null` — quality looked green (audit 94, 2,312 words inside the 2200–2800 window, depth met), and the code path for that message is the *fallback branch where `gateHold` is null and `shipMode` resolved `none`*. The article never got a job row, so the whole Approve→PR leg is unreachable for that path.
2. **Backing-stack flakiness in the brief**: the Full-Brief endpoint intermittently fails end to end — Entrim 524 (upstream gateway, both Qwen + DeepSeek), NVIDIA minimax 429, Grok 403 (team credits exhausted at `4f1b898f-d114-41b9-b8ef-136fbbf33005`). One retry sometimes succeeds; the loop currently burns the fallback chain once and gives up.

While investigating (1), verify the previously-shipped drafting hardening is still structurally sound (single canonical window, one-run contract, dual-pipeline dedupe+trim, grow-guard, continuation dedupe) and flag any regression.

## 2. Committee invariants — NEVER break

- I1 No Git write outside `shipContent`/`githubContents`.
- I3 Rendered payload must pass `assertShipAllowed` before any commit; gates stay the authority; human Approve stays.
- I5 AI order: Entrim Qwen3.6 (default) → Entrim DeepSeek → Grok; Claude Opus is OUT OF COMMISSION everywhere (no Run BiOS Claude leg, ever).
- Single-pass drafting: the drafter writes ONE article in ONE run; per-section budgets from the brief are hardlined; no segmented/repeated full writes; no echo of the brief/draft block.
- Canonical word window = `depthSpecForType(final content type)` only; brief/input overrides are dead (`clampBriefWordBudget` returns spec verbatim).
- Bloat is a hard blocker (`word_count_over_max`) — trim/dedupe run on every attempt in BOTH pipelines (`pipeline.ts` + `pipelineStream.ts`).
- Determinism: no invented impressions/revenue; `expected_revenue` null without live supply or real impressions.
- Suite green, tsc clean, production build green before any claim of done.

## 3. Evidence to confirm first (do not re-argue)

- Live reproduction of the silent withhold: `scripts/verify-approve-e2e.mjs` (env `ADMIN_EMAIL`/`ADMIN_PASSWORD`; topic defaults to a UK blog). Expected today: brief may succeed on retry; generation yields an in-window single-copy article (2,312w/audit 94 in the last successful run) then the silent hold.
- Confirm the exact stream the studio sends: capture `generate-stream` POST body (shipMode, contentType, region, sectionBudgets) — the workspace hardcodes behavior; check whether `effectiveRequested` can resolve non-`pr` via `selectedBrief.ship_mode`/`opportunity` payload.
- `lib/seoFactory/pipelineStream.ts` ship block (~1216–1360): enumerate EVERY branch that can set `shipMode='none'` with `gateHold=null` and reach the fallback message at 1353; prove which one fires with the observed numbers (audit 94, minAudit 65, blockers 0, depth met, requested 'pr').
- Job-row persistence: after the withheld ship, `createClient(SUPABASE_SERVICE_ROLE_KEY)` insert path at ~1362+ — the expected status is `drafting` when content exists; explain why `jobId:null` (row missing) — worker died? insert threw? `skipShipIfBelowScore` interplay?
- `resolveShipMode` (top of pipelineStream + `pipeline.ts`): confirm the 'pr' path returns 'pr' unconditionally, and find the actual mode at ship time.

## 4. Hypotheses to test (in order)

- H1 `effectiveRequested` ≠ 'pr' at ship time (studio/opportunity payload) → ship resolves 'merge'/'none' branch and silently falls to the fallback message. Trace value from `body.shipMode` → `input.shipMode` → workspace payload line ~6470.
- H2 The quality-guard branch condition misfires (e.g. `meetsShipQuality(audit)` false due to a warning-level scorer or `indexable` nuance) though numbers look green — reproduce with the actual audit object (blockers list) at ship time (event log / replay).
- H3 The `shipContent(pr)` attempt threw and the catch at 1310 ran, then shipMode was 'none' — check what error `shipContent` produced (GitHub token scope for the estate repo? ownership `blocked_on_supply`? filePath registry miss for the blog path).
- H4 Brief flakiness is upstream-only: implement brief-level 524/504 retry (jittered, max 2) BEFORE the fallback chain, keep the chain, and surface a backend-specific error to the UI (the operator must see "Entrim 524 vs Grok 403 credits" clearly — the current combined message does, but the retry budget is wrong).
- H5 (verification only) The multi-copy/over-window era regressions: confirm per-attempt dedupe+trim in BOTH pipelines, ONE-GO gated to attempt 1, grow-guard, continuation dedupe, FAQ reserve ≥ contract, budget pack targets the target — run `tests/section-budgets.test.ts`, `tests/depth-rescue.test.ts`, `tests/depth-expand.test.ts`, `tests/pipeline-*.test.ts` and the E2E.

## 5. Workplan — PHASE 1 ONLY (programmatic, no browser)

1. **Replay without a browser**: use the captured evidence already on record (`SSE tail: Ship withheld · audit 94 · words 2312 · jobId:null` — see supervisor summary) plus the stream/pipeline CODE to pin the exact branch. If you need the studio's request shape, read the payload construction in `components/design/admin-content-studio.tsx` (~line 6470: `shipMode`, `contentType`, `indexable`, `sectionBudgets`) — do NOT open a live browser.
2. Root-cause H1–H3 from code + recorded evidence; extract the minimal failing branch into a UNIT test (pure `resolveShipMode`-class harness where possible, integration otherwise).
3. Fix (smallest coordinated set):
   - if H1/H2: correct the mode/gate logic so a `pr`-requested, quality-green draft ALWAYS attempts the PR (or emits an explicit, non-null `gateHold` reason string when it can't — the operator must never see a reason-less withhold);
   - if H3: wrap `shipContent` errors with the underlying reason (token scope, ownership, path) into `shipError` and persist the job row as `drafting` regardless (content exists → row must exist);
   - H4: brief-level 524/504 retry (jittered, max 2) BEFORE the fallback chain + honest backend-specific errors; keep the chain Qwen→DeepSeek→Grok; never forward a model a leg does not own (guard already shipped — keep it).
4. Prove: new unit tests for the failing branch + brief retry; FULL unit suite + tsc + production build all green.
5. Deliver: root-cause write-up (exact file:line of the branch + why it fired with the observed numbers), the diff, and the test/tsc/build output. DO NOT claim live verification — that is Phase 2 and belongs to the supervisor.

## 5b. Phase 2 (supervisor, after deploy) — live browser verification

- Supervisor runs `scripts/verify-approve-e2e.mjs` against the deployed build (admin session).
- Expected on success: brief (may retry), single-copy in-window draft, job row `drafting`, ship = PR-created or an EXPLICIT reason string — never the silent fallback.
- You review the transcript, confirm acceptance, and close the ticket.

## 6. Acceptance criteria

PHASE 1 (yours):
- [ ] New unit test(s) reproduce the silent-withhold branch and pass after the fix (no soft mock-over-mocking — the test proves the branch cannot yield `gateHold=null` with `shipMode='none'` on a green, `pr`-requested draft).
- [ ] A quality-green, `pr`-requested draft either attempts the PR **or** produces an explicit reason string (no reason-less `Ship withheld`).
- [ ] Job-row persistence: whenever content exists the row lands (status `drafting`) even when ship is withheld; `jobId` non-null on content-bearing streams.
- [ ] Full-Brief retries 524/504 twice (jittered) before fallbacks and surfaces backend-specific errors (Grok credits depletion named as such).
- [ ] All invariants in §2 hold; full suite, tsc, build green.

PHASE 2 (supervisor): live E2E transcript shows brief → single-copy in-window draft → job row → ship with an explicit outcome; you review and confirm.

## 7. Environment

- Repo: `kylemwalkerpr-ship-it/portal`; deploy: push to `main` → Cloudflare Workers (auto).
- Live: `https://portal.yousafeconsultancy.com`; Supabase `krggzrxxnqfsbbklatxl` (anon in `.env.test`; service key on the Worker).
- E2E: `scripts/verify-deploy-e2e.mjs`, `scripts/verify-approve-e2e.mjs` (env creds only, never committed); Playwright Chromium installed locally.
- AI state: Entrim Qwen3.6 (default, may 524), Grok credits EXHAUSTED (403), NVIDIA minimax 429 — treat these as environmental realities, not bugs to fix.
- Tests: `env -u RUNBIOS_API_KEY -u RUNBIOS_BASE_URL -u RUNBIOS_GLM_MODEL npm test`; tsc: `npx tsc --noEmit`; build: `NODE_OPTIONS='--max-old-space-size=5120' npx next build --webpack`.