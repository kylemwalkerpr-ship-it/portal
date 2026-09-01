# GLM 5.3 — Content Studio four-stage quality close

You are **GLM 5.3** (full, not Flash). Repo: `/Users/phantomdarne/Documents/GitHub/yousafe-portal`.
Do NOT commit, push, deploy, or print secrets.
Do NOT touch marketplace homepage copy, study-abroad apex, or the in-progress market palette work (`contexts/palette-context.tsx`, `components/marketplace/*` palettes, `app/marketplace/layout.tsx`).

Live desk still shows after generate + Fix All:

```
SHIP BLOCKERS
TLDR_FORMAT_INVALID — In 60 seconds must contain 3–5 separate bullet lines
AHREFS_META_TOO_LONG — Meta description is 161 chars (Ahrefs maximum 160)

QUALITY WARNINGS
UNVERIFIED_INTERNAL_LINK (many)
META_DESCRIPTION — length 161
SCHEMA_FAQ — Missing FAQPage JSON-LD
```

These **must not survive** brief → draft → audit → revise. Google derank risk. Human publication standard.

## Goal

The four stages always emit a draft that **already passes** the ship gate for those codes. LLM “Fix All” is a last resort; **deterministic repair after every model write** is the closer. Do not weaken the gate regexes to hide failures.

## Stage contract

| Stage | Files | Must guarantee |
|---|---|---|
| Brief | `lib/seoFactory/prompts.ts`, `briefModel.ts`, `editorialContract.ts` | Brief JSON/prompt requires: `## In 60 seconds` with 3–5 lines each starting `- `; `description` 70–160 **inclusive** (never 161); `## FAQ` with ≥4 `###` questions; only internal hrefs from the estate allowlist (or relative paths the ship layer already verifies). |
| Draft | `pipeline.ts`, `pipelineStream.ts`, `editorialScaffold.ts` | After **every** generate/refine/segment merge: `applyDeterministicRepairs`. Exit that function with TL;DR bullets, meta ≤160, FAQPage JSON-LD present, unverified internals stripped or rewritten. |
| Audit | `contentQualityGate.ts`, `audit.ts`, `ahrefsIssues.ts`, `linkAudit.ts` | Keep blockers. Count meta with the **same** function used to clamp. TL;DR count `/^[-*+]\s+\S/gm` on the section body. |
| Revise | `app/api/content-studio/reaudit/route.ts` (`callAiFix`), inline editor Fix All | After AI returns: run **the same** `applyDeterministicRepairs` + `evaluateContentQuality`. If `tldr_format_invalid` or `ahrefs_meta_too_long` remain, **loop deterministic clamp** (not another 16k token rewrite). Fix All must not reintroduce 161-char meta or paragraph TL;DR. |

## Exact defect mechanics (fix these, do not guess)

### 1. TLDR_FORMAT_INVALID

Gate: `lib/seoFactory/contentQualityGate.ts` ~426–444.

Prior scaffold rewrite (`editorialScaffold.ts` ~647) is **not enough on live**. Prove why:

- YAML/`---` / extra `##` truncating the section match
- bullets indented with spaces (gate is `^[-*+]`)
- numbered lists, `•`, em-dashes on one line
- repair runs **before** a later refine that overwrites TL;DR
- Fix All prompt restores a paragraph

**Required:** one function `ensureTldrBullets(body): string` used by scaffold **and** reaudit. After it, the gate’s own regex yields **3–5** matches. Test: paragraph TL;DR, `1. 2. 3.`, single-line `a - b - c`, indented `  - item`.

### 2. AHREFS_META_TOO_LONG 161

`AHREFS_META_MAX = 160`. `clampMetaToAhrefs` in `ahrefsIssues.ts` slices then strips a partial word — can leave **161** if the YAML value counts differently (quotes, `\n`, en-dash vs hyphen, “description: ” included).

**Required:**

- Single `metaDescriptionLength(s)` used by clamp **and** gate.
- Clamp **loop** until `length <= 160` and `>= 70` (word-boundary trim; if still 161, hard `slice(0,160)`).
- Re-apply after Fix All. Test: 161-char and 200-char descriptions become 70–160; gate reports no `ahrefs_meta_too_long`.

### 3. SCHEMA_FAQ

`audit.ts` looks for `"@type":"FAQPage"`. `jsonLdBody.ts` / scaffold must **inject** FAQPage from `## FAQ` / `###` Qs when missing. Empty `mainEntity:[]` does **not** count as a good page — require ≥3 Q&A pairs. If FAQ headings exist, emit JSON-LD; if not, **create 4 FAQ headings from H2s** then schema. Do not leak raw JSON into visible body (existing `renderable_metadata_leak` blocker).

### 4. UNVERIFIED_INTERNAL_LINK

`linkAudit.ts` / estate allowlist. Invented `/us/...` paths fail.

**Required after draft and Fix All:** every markdown `[text](url)` whose host is yousafe / caseworks / relative:

- keep if in verified live URL set (whatever `linkAudit` already loads)
- else **rewrite to nearest estate link** (`ESTATE_ANCHOR_LINKS`) or **demote to plain text**
- never leave a href that the gate flags `unverified_internal_link`

Test: body with 3 fake internals → 0 `unverified_internal_link` after repair; at least one real estate link remains.

## Studio model pin (code change, same task)

Wire **Run BiOS `glm-5.3`** (id likely `glm-5.3`) as:

- default **brief** + **review / Fix All** (`callAiFix` / `DEFAULT_REVIEW_PIN` / `DEFAULT_BRIEF_PIN`)
- catalog slot `runbios-glm-53` next to flash
- `opencode.jsonc` already can list `glm-5.3` — keep it

Draft default may stay MiniMax M3 for speed **only if** the deterministic closer always runs after MiniMax. If a pin is `auto`, brief/review → `runbios-glm-53` not flash.

Do not send top-level `thinking` to Run BiOS (400). Use `reasoning_effort` only.

## Tests (must fail before your fix, pass after)

Use **exact live messages**:

- `In 60 seconds must contain 3–5 separate bullet lines`
- `Meta description is 161 chars`
- `Missing FAQPage JSON-LD`

Files: `tests/content-quality-gate.test.ts`, `tests/ahrefs-issues.test.ts`, `tests/editorial-scaffold.test.ts`, `tests/content-format-and-gate.test.ts`, new `tests/pipeline-four-stage-close.test.ts` if cleaner.

Simulate: applyDeterministicRepairs on a fixture that looks like a MiniMax draft (paragraph TL;DR, 161 meta, FAQ headings no JSON-LD, 5 fake internals) → `evaluateContentQuality` has **zero** of those four codes.

Also: `npx tsc --noEmit`

```
npx jest tests/content-quality-gate.test.ts tests/ahrefs-issues.test.ts tests/editorial-scaffold.test.ts tests/pipeline-four-stage-close.test.ts --no-coverage
```

## Do not

Weaken gates. Fake LLM citations. Approve/merge live jobs. Marketplace palette files.

## Report

PROJECT: YouSafe
TASK: four-stage quality close + GLM 5.3 review pin
FILES CHANGED / IMPLEMENTATION / TESTS / RESULTS / KNOWN ISSUES / UNCERTAINTY
