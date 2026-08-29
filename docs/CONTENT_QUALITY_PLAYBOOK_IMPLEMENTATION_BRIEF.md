# Content Quality Playbook and Audit–Editor Loop — Implementation Brief

**Status:** Proposed implementation contract for GLM; supervisor approval required at each milestone.
**Scope:** Content Studio / SEO Factory article pipeline only.
**Authority:** This brief refines, but does not replace, `CONTENT_STUDIO_ARCHITECTURE.md` and `SEO_MASTER_ENGINE.md`.

## 1. Objective and the standard of proof

Build one versioned, machine-readable quality system that every Content Studio
stage uses: **Briefing → Writing → Reviewing → Shipping**. It must make the
rules, job-specific obligations, audit findings, repair permissions, and ship
decision traceable from one canonical definition.

The desired outcome is an enforceably safe content workflow:

- Every page is planned against real intent, its content type, jurisdiction,
  verified internal links, and approved authoritative sources.
- Every writer and reviewer receives the same immutable job specification and
  the same rendered quality rules.
- Every change is audited again before it replaces the previous document.
- An AI repair can never silently damage an unflagged heading, list, link,
  source, metadata field, schema block, or section order.
- No document ships while any blocking requirement is open. A bounded loop
  escalates to human review rather than weakening a rule or regenerating the
  document.

"Airtight" is an engineering property here: deterministic rules, explicit
budgets, complete audit evidence, preservation checks, and tests. It cannot
truthfully mean a guarantee of rankings, traffic, inclusion in any search
product, or an ability to bypass Google systems. The system must instead
produce durable, useful, people-first, evidence-backed content and make every
enforced claim auditable.

## 2. Non-negotiable design decisions

1. **One rule registry; no duplicated policy prose.** Gate code, severity,
   owner, repair class, prompt instruction, and test fixture reference come
   from one TypeScript registry. A prompt may render a rule; it may not invent
   or redefine one.
2. **One immutable ContentSpec per job.** The brief is not free-form text. It
   is a versioned, persisted specification that all three model stages receive
   unchanged. Models cannot invent links, sources, required keywords, content
   type, region, or structural obligations.
3. **Deterministic first; AI only for semantic prose.** Formatting, schema,
   link cleanup, citation allowlisting, heading deduplication, and safe
   normalization are programmatic. AI is used only where editorial judgement is
   required.
4. **Targeted edits, not document regeneration.** A reviewer receives only
   outstanding findings and is permitted to change only the associated
   anchored spans. Any result that violates preservation invariants is rejected
   wholesale and the previous document remains authoritative.
5. **Clear gates precede every AI call.** If all blocking gates are clear, no
   further repair call is permitted. Warnings may be shown and optionally
   improved, but never justify a destructive full-document rewrite.
6. **One ship decision.** Existing `shipContent`, `assertContentDepth`,
   `assertQualityGate`, and `assertShipAllowed` remain the sole path to a Git
   write. The new loop may only produce a draft plus evidence; it never ships.
7. **No silent fallback.** Provider failure, a malformed AI result, a stalled
   loop, an unverifiable source, or a preservation failure ends in an explicit
   held-for-review state with evidence.

## 3. The two canonical sources of truth

The implementation must keep these separate. Combining them into one giant
prompt would recreate drift.

### 3.1 Canonical Rule Registry: `contentQualityPlaybook.ts`

Create `lib/seoFactory/contentQualityPlaybook.ts`. It is the executable
registry for durable rules, not a second evaluator.

```ts
export type GateSeverity = 'format_blocker' | 'blocker' | 'warning' | 'info'
export type GateOwner = 'brief' | 'writer' | 'deterministic' | 'reviewer' | 'human'
export type RepairClass = 'deterministic' | 'targeted_ai' | 'human_only'

export type GateDefinition = {
  code: string
  title: string
  severity: GateSeverity
  owner: GateOwner
  repairClass: RepairClass
  appliesTo: ContentType[] | 'all'
  requirement: string
  promptInstruction: string
  evidence: string
  shipEffect: 'block' | 'allow_with_flag' | 'advisory'
  evaluator: string
  testFixture: string
}

export const PLAYBOOK_VERSION = '2026.08.1'
export const CONTENT_QUALITY_PLAYBOOK: readonly GateDefinition[] = [/* … */]
```

The registry is canonical for rule metadata. Existing pure evaluators remain
the canonical implementation of their predicates until they are deliberately
moved; they must return registered codes only. The registry provides helpers:

- `gate(code)` and `severityFor(code)`;
- `renderBriefRules(spec)`, `renderWriterRules(spec)`, and
  `renderReviewerRules(findings, spec)`;
- `ownerFor(code)` and `repairClassFor(code)`;
- `assertRegisteredFindingCodes(findings)`;
- `playbookManifest()` for an admin-visible version and diagnostics endpoint.

Do **not** make runtime behavior depend on Markdown documentation. Generate
`docs/CONTENT_QUALITY_PLAYBOOK.md` from the registry, or assert that its
rendered section matches the registry in a snapshot test. Human strategy docs
remain principles and rationale; code is the runtime authority.

### 3.2 Canonical job specification: `ContentSpec`

Create `lib/seoFactory/contentSpec.ts`. Resolve it once during planning,
validate it before generation, persist a JSON snapshot in the existing job
audit payload, and pass the exact snapshot to every stage.

```ts
export type ContentSpec = {
  version: typeof PLAYBOOK_VERSION
  jobId: string
  contentType: ContentType
  region: Region
  indexable: boolean
  target: { canonicalUrl: string; host: string; path: string }
  intent: { primaryQuery: string; reader: string; queryNeed: string; stage: string }
  primaryKeyword: string
  requiredKeywords: Array<{ phrase: string; kind: 'short' | 'long_tail'; optional?: boolean }>
  wordBudget: { min: number; target: number; max: number }
  outline: Array<{ heading: string; level: 2 | 3; purpose: string }>
  requiredSections: string[]
  verifiedEstateLinks: Array<{ url: string; anchor: string; role: 'hub' | 'related' }>
  approvedSources: Array<{ url: string; publisher: string; jurisdiction?: string; purpose: string }>
  ymyl: { disclaimerRequired: boolean; statutoryAnchors: string[]; freshnessRequired: boolean }
  aeoGeo: { answerFirst: boolean; faqRequired: boolean; quotableEvidenceRequired: boolean }
  provenance: { plannerRunId?: string; generatedAt: string; sourceHashes: Record<string, string> }
}
```

Rules for `ContentSpec`:

- It is created from owner resolution, Master Engine output, GSC/keyword data,
  `contentDepth`, verified live URL data, and citation policy—not model prose.
- It is append-only/versioned. A user changing intent, target URL, or sources
  creates a new spec revision and a fresh audit baseline; it never mutates a
  running repair loop.
- All model prompts include the spec version and a compact, identical facts
  projection. Every audit transcript records the spec and playbook versions.
- The reviewer may select only `approvedSources` and
  `verifiedEstateLinks`. It may remove a dead link but cannot replace it with
  an unapproved URL.
- The current `editorialBriefPromptBlock`, `qualityPromptBlock`, formatting
  block, depth prompt, link allowlist, and citation allowlist must be rendered
  from `ContentSpec` plus the rule registry. Do not maintain parallel arrays in
  route handlers or prompt files.

## 4. Rules that the first playbook release must cover

The registry must map existing codes before adding new policy. Existing ship
semantics stay unchanged in release one unless this brief explicitly says
otherwise.

| Rule family | Required enforcement and owner |
|---|---|
| Intent, ownership, content type | `reconcileContentTypeWithPath`, one cluster/URL, primary query, reader need, journey stage. Brief owns facts; mismatch blocks shipping. |
| Depth and content type | Existing `contentDepth` min/target/max values are reused by brief, writer, reviewer, and ship. Below floor blocks; under target warns; padding, repetition, and stuffing do not count as depth. |
| Answer-first and reader utility | Direct answer in the opening answer block; logical H2 progression; self-contained FAQ answers; steps/checklists/tables only when they genuinely improve comprehension. Missing answer-first or concrete explanation is initially a warning, with fixtures before any promotion. |
| Voice and engagement | Existing human-voice, sentence-rhythm, slop, outcome-promise, and stuffing gates remain registered and centrally described. No “human-like” score may override factual or YMYL blockers. |
| Document format | One H1, skeleton order, valid Markdown lists/tables, valid frontmatter, no leaked metadata/schema, source and structural sections exactly once. Renderer-visible corruption is a `format_blocker`, owned by deterministic code. |
| Headings | Preserve current named structural duplication checks. Add document-wide normalized H2/H3 uniqueness as `duplicate_heading`; promote repeated structural H2s such as `Related guides` to `format_blocker` only with fixture coverage and migration notes. |
| Keywords | Preserve anti-stuffing protection. Required short/long-tail terms must have clean semantic placement. Support `optional: true` only when the planner records why no natural slot exists; optional terms are `info`, never silently omitted or auto-promoted. |
| Sources and claims | Indexable/YMYL pages require approved official, jurisdiction-appropriate sources. No invented citations, figures, dates, costs, eligibility outcomes, or outcome promises. The citation policy and disclaimer regex are imported, not copied. |
| Links | At least the required verified estate links; descriptive anchors; live verification; malformed/placeholders/dead links block; permitted authority-host exceptions remain explicit warnings with re-verification evidence. AI never invents a path. |
| JSON-LD | Article schema for indexable content; FAQ schema only when valid FAQ content exists; valid JSON parse; `@context` and `@type` required; no body-leaked scripts; bounded script count. Schema is scaffold-generated, not authored by a model. |
| YMYL, AEO, GEO | Disclaimer, freshness and statutory-anchor rules for YMYL. Answer-first, entity clarity, FAQ, and evidence-backed quotable passages for AEO/GEO. These are quality requirements, not claims of search-engine preference or ranking outcomes. |
| Ship and deployment | All blockers, format blockers, depth blockers, and live-link blockers must be clear. Warnings remain visible but do not change the existing ship policy without an explicit product decision. |

## 5. The safe bounded audit–editor loop

Create `lib/seoFactory/auditEditorLoop.ts`. This must be a pure orchestration
module wherever possible; the route performs provider calls and persistence.

### 5.1 Inputs and persisted transcript

```ts
export type AuditEditorLoopInput = {
  content: string
  spec: ContentSpec
  playbookVersion: string
  budget: { maxAiPasses: number; maxDeterministicRepasses: number; stallRounds: number }
}

export type AuditEditorRound = {
  round: number
  before: AuditSnapshot
  deterministicRepairs: string[]
  aiRequest?: { findingCodes: string[]; permittedAnchors: string[] }
  aiResult?: 'applied' | 'rejected_preservation' | 'provider_failure'
  after: AuditSnapshot
  progress: { blockersReduced: boolean; fingerprintPreserved: boolean }
}

export type AuditEditorLoopResult = {
  content: string
  status: 'cleared' | 'held_for_review' | 'provider_failed'
  rounds: AuditEditorRound[]
  leftoverCodes: string[]
  specVersion: string
  playbookVersion: string
}
```

Persist the result under a namespaced `audit_json.contentLoop` payload with a
bounded transcript. This avoids a risky database migration in the first
release while giving UI, support, and tests durable evidence. Never store API
keys, raw provider headers, or unlimited model output in this payload.

### 5.2 Required execution order

For each round, execute in this exact order:

1. Validate `ContentSpec` and playbook compatibility; refuse an unknown
   version.
2. Save a structural fingerprint of the current accepted content.
3. Apply deterministic, idempotent repairs only:
   `normalizeEditorDocument`, frontmatter sanitation, scaffold repair,
   verified-link remediation, approved-source filtering, and safe list/schema
   cleanup.
4. Evaluate the complete gate stack once: quality gate, audit scorecard,
   depth gate, Ahrefs/schema checks, and live-link audit. Assert every finding
   has a registered code and registered severity.
5. Exit with `cleared` if all ship-blocking requirements are clear. No AI call
   is allowed after this point.
6. Route `human_only` findings directly to `held_for_review`; do not ask a
   model to fabricate missing evidence.
7. Build a targeted repair request from only the outstanding `targeted_ai`
   codes and only their permitted anchors.
8. Receive a structured patch, validate it, apply it atomically, normalize it,
   and compare the new fingerprint to the pre-AI fingerprint.
9. Re-run the entire evaluation stack. Record before/after counts and the
   exact codes resolved or newly introduced.
10. Stop and hold if the configured pass budget is exhausted, two consecutive
    rounds make no blocker progress, the provider fails, or an AI patch fails
    validation/preservation twice.

One named budget must replace hidden magic numbers. Use conservative initial
values:

```ts
export const CONTENT_LOOP_BUDGET = {
  maxAiPasses: 6,
  maxDeterministicRepasses: 2,
  stallRounds: 2,
} as const
```

Existing refine/depth-specific caps may remain as sub-budgets, but each call
must debit the shared loop budget and record why. A loop must never be
unbounded and must never relax a blocker to claim success.

### 5.3 Patch contract: eliminate full-document rewrite risk

Do not accept a reviewer’s free-form complete document as the primary repair
protocol. Introduce a structured `EditorPatch` response:

```ts
type EditorPatch = {
  version: 1
  operations: Array<
    | { kind: 'replace'; findingCode: string; anchor: string; expectedHash: string; replacement: string }
    | { kind: 'insert_after'; findingCode: string; anchor: string; expectedHash: string; insertion: string }
    | { kind: 'remove'; findingCode: string; anchor: string; expectedHash: string }
  >
}
```

The deterministic patch applier must enforce all of the following:

- Every `findingCode` is outstanding, registered, and `targeted_ai`.
- Every anchor exists exactly once in the accepted pre-patch document.
- The expected hash matches the anchored original text.
- Replacements are local to the permitted anchor; insertions use an allowed
  section boundary; removals are allowed only for the listed malformed or
  duplicate construct.
- The operation count is capped; no operation may alter frontmatter, JSON-LD,
  links, or headings unless that element is the targeted finding and its repair
  class permits it.
- Invalid JSON, duplicate anchors, unmatched hashes, or non-local edits reject
  the full patch. The accepted document is untouched.

Use complete-document output only as a temporary compatibility path behind a
flag. It must go through the same fingerprint checks below. The structured
patch path is the production target because it makes AI permission explicit.

### 5.4 Mandatory preservation fingerprint

Build `documentFingerprint.ts` from parsed Markdown, not fragile regexes
alone. It must capture normalized structure and use a stable hash per item.
Before accepting any AI edit, assert:

| Invariant | Required result |
|---|---|
| H1 | Exactly one; unchanged unless an approved title finding targets it. |
| Headings | Same levels, text, and order except explicitly targeted anchors. No skipped levels or new duplicates. |
| Skeleton | `In 60 seconds`, TOC, FAQ, Sources, Related guides, and disclaimer remain present exactly once and in canonical order. |
| Lists and tables | No unflagged item/row is removed, merged into prose, or converted to another marker type. |
| Links | Unflagged link URL and anchor text remain unchanged. New/replacement URLs must be approved; only dead/invalid targeted links may be removed. |
| Citations | Existing approved citations cannot disappear unless the linked finding identifies the source as invalid and a permitted replacement exists. |
| Frontmatter | Key set stays stable; canonical and robots are unchanged unless a deterministic target explicitly changes them. |
| Schema | Schema is generated/scaffolded; no model-supplied or body-leaked block is accepted. |
| Volume | Retain the existing 40% loss guard and add a per-section lower bound. A depth expansion may increase only within the spec max. |
| Facts | Non-targeted citations, named authorities, amounts, dates, and statutory references retain their exact text. |

A failed invariant is a rejected patch, not an auto-normalization opportunity.
Record it as `editor_preservation_rejected`, preserve the earlier document, and
continue only if budget remains.

## 6. Integration plan for GLM

### Milestone A — Registry and spec, no gate-policy change

**New files**

- `lib/seoFactory/contentQualityPlaybook.ts`
- `lib/seoFactory/contentSpec.ts`
- `tests/contentQualityPlaybook.test.ts`
- `tests/contentSpec.test.ts`

**Touches**

- `editorialContract.ts`, `contentQualityGate.ts`, `prompts.ts`, citation and
  link prompt builders: replace locally written rule prose with projections
  from the registry/spec.
- Planning/brief assembly: create and persist `ContentSpec`.

**Supervisor acceptance**

- Every existing emitted code is registered exactly once.
- Existing severity and ship behavior are byte-for-byte equivalent in fixture
  tests.
- Brief, writer, and reviewer prompt snapshots show the same version and the
  same requirements for one job.
- No route reads duplicated keyword/link/source arrays after `ContentSpec` is
  introduced.

### Milestone B — Fingerprint and patch validation, shadow mode

**New files**

- `lib/seoFactory/documentFingerprint.ts`
- `lib/seoFactory/editorPatch.ts`
- `tests/documentFingerprint.test.ts`
- `tests/editorPatch.test.ts`

**Behavior**

- Run the fingerprint and structured-patch validator in shadow mode on current
  editor responses. Do not change the live accepted draft yet.
- Log would-reject reasons to the bounded loop transcript and capture
  representative fixtures.

**Supervisor acceptance**

- It rejects code fences, metadata leakage, invalid JSON-LD, changed unflagged
  headings, collapsed lists, reordered sections, link invention, source loss,
  and broad rewrites.
- It accepts a minimal targeted correction to an invalid link, duplicate H2,
  or malformed list without changing unrelated sections.
- It is deterministic and idempotent over the same input.

### Milestone C — Bounded loop, feature-flagged

**New files**

- `lib/seoFactory/auditEditorLoop.ts`
- `tests/auditEditorLoop.test.ts`

**Touches**

- `app/api/content-studio/reaudit/route.ts`: add a new `fix_until_gates`
  action; do not alter existing `fix_all`, `fix_one`, `fix_warnings`,
  `fix_blockers`, or `fix_depth` behavior during rollout.
- Content-job state handling: persist loop evidence and add explicit
  `held_for_review` semantics if the existing state model cannot express it.

**Rollout**

- Gate with `CONTENT_LOOP_V2=1`, default off.
- Initially enable only for non-shipping test jobs; then a small, manually
  approved non-YMYL cohort; then YMYL draft review (never automatic shipping)
  after evidence is reviewed.

**Supervisor acceptance**

- All blocking gates clear → exactly one successful exit, no additional model
  call.
- Non-improving rounds stop at the stall threshold; global AI budget is never
  exceeded.
- Provider failure, patch rejection, or missing evidence produces an explicit
  hold with the final document and transcript intact.
- Ship guards remain authoritative and cannot be bypassed by the new route.

### Milestone D — Carefully tighten gaps

Make each of these a separate, tested change after Milestone C is stable:

1. Add document-wide normalized `duplicate_heading`; promote repeated
   structural sections to `format_blocker`.
2. Add the planner-recorded optional-keyword escape hatch.
3. Require valid Article schema for indexable pillar pages, retaining a safe
   deterministic scaffold repair.
4. Add evidence-backed AEO/GEO checks only where authoritative source data is
   present; otherwise produce an advisory, not invented “evidence.”
5. Generate the human playbook document from the registry and update
   architecture documentation to link to it.

## 7. Required test matrix

GLM must add or update focused tests; no implementation is accepted on a
happy-path demo alone.

1. **Registry completeness:** every code emitted by quality, audit, depth,
   link, Ahrefs, and ship evaluators exists in the registry; no duplicate code;
   all blocking codes have an evidence/repair owner.
2. **Prompt parity:** one fixed `ContentSpec` renders equivalent requirements
   to brief, writer, and reviewer snapshots, including playbook version.
3. **Spec provenance:** unverified links, invented citations, malformed source
   records, and incompatible region/type combinations are rejected before AI.
4. **Issue fixtures:** invalid JSON-LD, repeated `Related guides`, each
   unverified internal link, too-few estate links, mixed bullets, duplicate
   Sources, thin content, missing disclaimer, and keyword stuffing all create
   the expected registered code and severity.
5. **Patch safety:** intentional attempts to rename/reorder headings, collapse
   lists, delete a source, replace a good link, alter frontmatter, leak schema,
   or rewrite the article are rejected with the original content unchanged.
6. **Patch success:** a patch clears one precise finding and preserves every
   unaffected fingerprint component.
7. **Loop convergence:** deterministic repair clears deterministic problems
   with zero AI calls; targeted AI clears an eligible fixture; two stalled
   rounds, pass-budget exhaustion, and provider failure each hold correctly.
8. **No regression:** existing `fix_all` and pipeline tests retain their
   current behavior when the feature flag is off.
9. **Ship integrity:** neither score inflation nor warning suppression can
   ship content with a remaining blocker, depth failure, or live-link blocker.
10. **Auditability:** the stored transcript is bounded, redacted, versioned,
    and sufficient to reproduce the final exit decision.

## 8. GLM implementation constraints and handoff

GLM must work one milestone at a time and stop for supervisor review after
each. It must not:

- change the existing `shipContent` boundary;
- loosen YMYL, source, link, schema, depth, or format gates to make fixtures
  pass;
- add a second document write path, a new AI provider dependency, or a new
  uncontrolled prompt store;
- use generated text as source evidence;
- commit, push, deploy, apply migrations, or access secrets.

For every milestone GLM reports: files changed, gate-code mapping, test command
and exact result, feature-flag behavior, preserved existing behavior, and any
unresolved ambiguity. The supervisor approves the next milestone only after
the stated acceptance criteria and a diff review pass.

## 9. Definition of done

This programme is complete only when the following are true in code and tests:

- One rule registry and one job-specific `ContentSpec` feed all three model
  stages and the audit/ship surface.
- A reviewer has a mechanically enforced, minimal change permission set.
- Every accepted repair has a before/after audit, preservation proof, version
  evidence, and bounded loop transcript.
- Every failure is a safe hold, not a weakened gate or a silently mangled
  document.
- Existing single ship door and quality gates remain in force.
- Documentation is generated from or verifiably synchronized with the runtime
  registry.

At that point the estate has a durable quality system: not a content mill, but
an evidence-led editorial workflow that consistently protects readers,
maintains technical quality, and improves the likelihood of satisfying real
search intent.
