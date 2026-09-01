/**
 * Canonical content-quality rule registry (implementation brief §3.1).
 *
 * ONE registry for durable rule metadata: gate code, severity, owner, repair
 * class, prompt instruction, and test fixture reference. Prompts render a
 * rule; they never invent or redefine one. Existing pure evaluators
 * (contentQualityGate, audit, contentDepth, linkAudit, ahrefsIssues,
 * masterEngine risk scan, shipGate) remain the canonical implementations of
 * their predicates and MUST only return codes registered here.
 *
 * Milestone A scope: registry + spec, no gate-policy change. No evaluator,
 * prompt block, route, or ship path was modified to introduce this file —
 * severities below are the ship-relevant canonical class for each code as
 * emitted by the evaluators today (codes that escalate at a threshold are
 * registered with their base severity and shipEffect 'block').
 */

export type GateSeverity = 'format_blocker' | 'blocker' | 'warning' | 'info'
export type GateOwner = 'brief' | 'writer' | 'deterministic' | 'reviewer' | 'human'
export type RepairClass = 'deterministic' | 'targeted_ai' | 'human_only'

/** Studio content types (aliases fold into depth tiers via contentDepth). */
export type ContentType =
  | 'legal_guide'
  | 'article'
  | 'blog_summary'
  | 'blog_post'
  | 'news_summary'
  | 'regional_page'
  | 'regional_from'
  | 'regional_university'
  | 'marketplace_gig'

/** Regions the estate publishes for. */
export type Region = 'us' | 'uk' | 'ca' | 'au' | 'global'

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

/** Indexable long-form types — the gates these types skip are gig-excluded. */
const INDEXABLE_FORM: ContentType[] = [
  'legal_guide',
  'article',
  'blog_summary',
  'blog_post',
  'news_summary',
  'regional_page',
  'regional_from',
  'regional_university',
]

function def(g: GateDefinition): GateDefinition {
  return g
}

/**
 * The registry. Every code emitted by the quality, audit, depth, link,
 * Ahrefs, and master-engine risk evaluators is registered exactly once.
 */
export const CONTENT_QUALITY_PLAYBOOK: readonly GateDefinition[] = [
  // ── Document format (renderer-visible corruption — format_blocker) ──────
  def({
    code: 'embedded_frontmatter', title: 'Duplicate or embedded YAML frontmatter',
    severity: 'format_blocker', owner: 'deterministic', repairClass: 'deterministic',
    appliesTo: INDEXABLE_FORM,
    requirement: 'Exactly one YAML frontmatter block at the very top; no embedded YAML in the body.',
    promptInstruction: 'Keep exactly one frontmatter block at the very top; remove any embedded YAML from the body.',
    evidence: 'contentQualityGate.evaluateContentQuality frontmatter scan',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#format fixtures',
  }),
  def({
    code: 'renderable_metadata_leak', title: 'Frontmatter or JSON-LD leaked into visible body',
    severity: 'format_blocker', owner: 'deterministic', repairClass: 'deterministic',
    appliesTo: INDEXABLE_FORM,
    requirement: 'No frontmatter or schema JSON rendered as visible body content.',
    promptInstruction: 'Remove leaked metadata from the body. Keep frontmatter at the top and schema in complete script blocks only.',
    evidence: 'contentQualityGate.evaluateContentQuality body leak scan',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#format fixtures',
  }),
  def({
    code: 'heading_structure_invalid', title: 'H1 count is not exactly one',
    severity: 'format_blocker', owner: 'deterministic', repairClass: 'deterministic',
    appliesTo: INDEXABLE_FORM,
    requirement: 'Exactly one H1; ## for major sections; ### only beneath ##.',
    promptInstruction: 'Keep one # H1, use ## for major sections and ### only beneath ##.',
    evidence: 'contentQualityGate.evaluateContentQuality H1 count',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#format fixtures',
  }),
  def({
    code: 'tldr_format_invalid', title: 'In 60 seconds section missing or malformed',
    severity: 'format_blocker', owner: 'deterministic', repairClass: 'deterministic',
    appliesTo: INDEXABLE_FORM,
    requirement: '## In 60 seconds exists with 3–5 separate bullet lines, one `- ` item per line.',
    promptInstruction: 'Add ## In 60 seconds with 3–5 direct takeaway bullets, one `- ` item per line.',
    evidence: 'contentQualityGate.evaluateContentQuality TL;DR block scan',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#format fixtures',
  }),
  def({
    code: 'duplicate_structural_section', title: 'Duplicate structural section (Sources/FAQ/TOC/In 60 seconds)',
    severity: 'format_blocker', owner: 'deterministic', repairClass: 'deterministic',
    appliesTo: INDEXABLE_FORM,
    requirement: 'Structural sections appear exactly once each.',
    promptInstruction: 'Keep one section per structural name and merge unique content into it without duplicating entries.',
    evidence: 'contentQualityGate.evaluateContentQuality structural section counter',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#format fixtures',
  }),
  def({
    code: 'duplicate_source_entries', title: 'Sources section contains duplicate entries',
    severity: 'format_blocker', owner: 'deterministic', repairClass: 'deterministic',
    appliesTo: INDEXABLE_FORM,
    requirement: 'One entry per official source in the Sources section.',
    promptInstruction: 'Keep one entry per official source and remove repeated copies.',
    evidence: 'contentQualityGate.evaluateContentQuality Sources dedup check',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#format fixtures',
  }),

  // ── Voice, tone, compliance (quality gate) ───────────────────────────────
  def({
    code: 'outcome_promise', title: 'Outcome / guarantee language',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'No promises of visa approval, success rates, or guaranteed results. Educational tone only.',
    promptInstruction: 'Rewrite without promising visa approval, success rates, or guaranteed results. Educational only.',
    evidence: 'contentQualityGate.evaluateContentQuality OUTCOME_PROMISE_PATTERNS (immigration-outcome-coupled)',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'banned_brand_phrase', title: 'Banned brand-safety phrase',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'No banned brand-safety phrases.',
    promptInstruction: 'Remove the phrase; use accurate, non-promissory language.',
    evidence: 'contentQualityGate.evaluateContentQuality BANNED_PHRASES scan',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'ai_slop', title: 'Machine-sounding / banned AI phrasing',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'No AI-slop words or phrases.',
    promptInstruction: 'Rewrite in plain practitioner English. Cut throat-clearing, clichés, and thesaurus verbs.',
    evidence: 'contentQualityGate.evaluateContentQuality AI_SLOP_PHRASES / AI_SLOP_WORDS',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'ai_self_reference', title: 'Model self-reference in content',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'No AI / language-model self-reference.',
    promptInstruction: 'Remove any AI/self-referential language. Write as editorial staff only.',
    evidence: 'contentQualityGate.evaluateContentQuality self-reference regex',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'hype_tone', title: 'Sales / hype tone',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Calm practitioner tone; no urgency bait or hype.',
    promptInstruction: 'Use calm, precise, second-person educational tone. No urgency bait.',
    evidence: 'contentQualityGate.evaluateContentQuality HYPE_PATTERNS',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'keyword_stuffing', title: 'Primary keyword exact-match spam',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Primary keyword density stays under the stuffing threshold (≥4.5% of body).',
    promptInstruction: 'Use the primary keyword a few times naturally; then synonyms and entities.',
    evidence: 'contentQualityGate.evaluateContentQuality primary-keyword density check',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#keyword fixtures',
  }),
  def({
    code: 'inhuman_voice', title: 'Human-voice score too low',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Human-voice score ≥ 55/100 (cadence/filler patterns).',
    promptInstruction: 'Full rewrite: second person, varied sentence length, concrete procedures, no AI clichés.',
    evidence: 'contentQualityGate.evaluateContentQuality humanScore collapse',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'emdash_spam', title: 'Em/en-dash overuse',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Em/en-dash density stays low; ≥12 dashes escalates to a ship blocker.',
    promptInstruction: 'Rewrite with periods or commas. Prefer short sentences over dash chains.',
    evidence: 'contentQualityGate.evaluateContentQuality dash cadence counter',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'heres_spam', title: '"Here’s…" openers overused',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Vary paragraph openers.',
    promptInstruction: 'Vary openers; start with the fact or the step.',
    evidence: 'contentQualityGate.evaluateContentQuality opener counter',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'sentence_start_repetition', title: 'Repeated sentence openings (robotic rhythm)',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Same 12-char sentence opening repeated <5×; ≥7× escalates to a ship blocker (≥8× also refused by the rhythm guard).',
    promptInstruction: 'Vary sentence openings. Mix short and medium sentences. Lead with the reader’s situation or a concrete noun.',
    evidence: 'contentQualityGate.evaluateContentQuality sentence-start frequency',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'tone_whilst', title: 'Prefer "while" over "whilst"',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Plain international English.',
    promptInstruction: 'Replace whilst → while.',
    evidence: 'contentQualityGate.evaluateContentQuality single-token tone check',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'passive_density', title: 'High passive-voice density',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Prefer active voice in educational prose.',
    promptInstruction: 'Prefer active voice: "You submit the form" not "The form is submitted by you".',
    evidence: 'contentQualityGate.evaluateContentQuality passive heuristic',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'missing_second_person', title: 'Little or no second person',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Address the reader directly in plain English.',
    promptInstruction: 'Address the reader directly in plain English.',
    evidence: 'contentQualityGate.evaluateContentQuality you/your counter',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'stiff_formality', title: 'Uniformly stiff formality',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Allow natural contractions while keeping precision on legal terms.',
    promptInstruction: 'Allow natural contractions in body paragraphs while keeping precision on legal terms.',
    evidence: 'contentQualityGate.evaluateContentQuality formality wall check',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#voice fixtures',
  }),
  def({
    code: 'keyword_density_high', title: 'Primary keyword at the stuffing edge',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Primary keyword density stays under the warning threshold (≥3.5% of body).',
    promptInstruction: 'Reduce exact repeats; prefer semantic variants.',
    evidence: 'contentQualityGate.evaluateContentQuality primary-keyword density check',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#keyword fixtures',
  }),

  // ── Reader engagement / structure warnings (quality gate) ────────────────
  def({
    code: 'wall_of_text', title: 'Dense prose blocks',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Short paragraphs (1–3 sentences) with visual breaks where they aid scanning.',
    promptInstruction: 'Break dense paragraphs into 1–3 sentence units and add a useful list, step, table, example, or callout where it improves comprehension.',
    evidence: 'contentQualityGate.evaluateContentQuality prose-block scan',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#engagement fixtures',
  }),
  def({
    code: 'missing_visual_break', title: 'No useful list or comparison table',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Long-form page includes a genuine checklist, process, or table where it helps scanning.',
    promptInstruction: 'Add a genuine checklist, numbered process, or comparison table only where it makes the information easier to scan.',
    evidence: 'contentQualityGate.evaluateContentQuality list/table presence',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#engagement fixtures',
  }),
  def({
    code: 'missing_reader_path', title: 'No visible reading path / contents aid',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Long guides include a table of contents or "On this page" list.',
    promptInstruction: 'Add a concise table of contents or “On this page” list linked to the major sections.',
    evidence: 'contentQualityGate.evaluateContentQuality TOC presence',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#engagement fixtures',
  }),
  def({
    code: 'missing_concrete_example', title: 'No concrete example marker',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Long-form pages include at least one accurate, clearly labeled example.',
    promptInstruction: 'Add one accurate, clearly labeled example or scenario; do not invent a case outcome.',
    evidence: 'contentQualityGate.evaluateContentQuality example-marker scan',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#engagement fixtures',
  }),

  // ── Required structure blockers (indexable long-form) ─────────────────────
  def({
    code: 'missing_tldr', title: 'Missing "In 60 seconds" / TL;DR answer block',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'An answer block ("In 60 seconds" / TL;DR / quick answer / key takeaways) exists.',
    promptInstruction: 'Add ## In 60 seconds with 3–5 direct bullets.',
    evidence: 'contentQualityGate.evaluateContentQuality answer-block regex',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#structure fixtures',
  }),
  def({
    code: 'structure_h2', title: 'Fewer than 4 H2 sections',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'At least 4 H2 sections covering procedure, documents, risks, FAQ.',
    promptInstruction: 'Add procedure, documents, risks/timelines, FAQ sections.',
    evidence: 'contentQualityGate.evaluateContentQuality H2 counter',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#structure fixtures',
  }),
  def({
    code: 'missing_faq', title: 'Missing FAQ section',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'FAQ section with 4–6 self-contained Q&A pairs.',
    promptInstruction: 'Add ## FAQ with 4–6 Q&A pairs (self-contained answers, plain or collapsible <details>).',
    evidence: 'contentQualityGate.evaluateContentQuality FAQ detection',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#structure fixtures',
  }),
  def({
    code: 'missing_official_sources', title: 'Missing official source URLs',
    severity: 'blocker', owner: 'reviewer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Indexable content cites a live, on-topic official source (citation policy).',
    promptInstruction: 'Cite a live official URL from the Research-stage allowlist — the issuing body for this claim. Never invent a path.',
    evidence: 'contentQualityGate.evaluateContentQuality citation-policy check',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#structure fixtures',
  }),
  def({
    code: 'missing_disclaimer', title: 'Missing educational / not-legal-advice disclaimer',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Indexable YMYL-adjacent content carries an educational disclaimer.',
    promptInstruction: 'Add a short disclaimer: educational only, not legal advice.',
    evidence: 'contentQualityGate.evaluateContentQuality DISCLAIMER_RE',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#structure fixtures',
  }),

  // ── Keyword coverage (brief-supplied arrays) ─────────────────────────────
  def({
    code: 'insufficient_short_keywords', title: 'Brief supplied fewer than the required short keywords',
    severity: 'blocker', owner: 'brief', repairClass: 'deterministic', appliesTo: INDEXABLE_FORM,
    requirement: 'The brief supplies ≥5 distinct short keywords (≤3 words each).',
    promptInstruction: 'Re-run the planner / brief builder to synthesize the missing short keywords.',
    evidence: 'contentQualityGate.evaluateContentQuality keyword-array floor',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#keyword fixtures',
  }),
  def({
    code: 'insufficient_long_tail_keywords', title: 'Brief supplied fewer than the required long-tail keywords',
    severity: 'blocker', owner: 'brief', repairClass: 'deterministic', appliesTo: INDEXABLE_FORM,
    requirement: 'The brief supplies ≥4 distinct long-tail keywords (≥4 words each).',
    promptInstruction: 'Re-run the planner / brief builder to synthesize the missing long-tail queries.',
    evidence: 'contentQualityGate.evaluateContentQuality keyword-array floor',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#keyword fixtures',
  }),
  def({
    code: 'missing_short_keyword', title: 'Required short keyword absent',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Every required short keyword appears at least once, in context, ≤4 hits.',
    promptInstruction: 'Use each short keyword at least once in context, naturally — title, first H2, In 60 seconds, or as a checklist item.',
    evidence: 'contentQualityGate.evaluateContentQuality keyword presence',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#keyword fixtures',
  }),
  def({
    code: 'missing_long_tail_keyword', title: 'Required long-tail keyword absent',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Every required long-tail keyword appears at least once, naturally, ≤2 hits.',
    promptInstruction: 'Use each long-tail keyword at least once, naturally — in FAQ, a heading, an answer block, or a step description.',
    evidence: 'contentQualityGate.evaluateContentQuality keyword presence',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#keyword fixtures',
  }),
  def({
    code: 'missing_synthesized_short_keyword', title: 'Synthesized short keyword absent',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Backfilled short keywords are covered where a natural slot exists. No search-demand evidence backs them, so absence never refuses a ship.',
    promptInstruction: 'Use each short keyword at least once in context, naturally — title, first H2, In 60 seconds, or as a checklist item. Skip any that cannot be placed without force-fitting.',
    evidence: 'contentQualityGate.evaluateContentQuality keyword presence (provenance: synthesized)',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/keyword-coverage.test.ts#warns instead of blocking when synthesized backfill terms are uncovered',
  }),
  def({
    code: 'missing_synthesized_long_tail_keyword', title: 'Synthesized long-tail keyword absent',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Backfilled long-tail keywords are covered where a natural slot exists. No search-demand evidence backs them, so absence never refuses a ship.',
    promptInstruction: 'Use each long-tail keyword at least once, naturally — in FAQ, a heading, an answer block, or a step description. Skip any that cannot be placed without force-fitting.',
    evidence: 'contentQualityGate.evaluateContentQuality keyword presence (provenance: synthesized)',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/keyword-coverage.test.ts#warns instead of blocking when synthesized backfill terms are uncovered',
  }),
  def({
    code: 'short_keyword_density_violation', title: 'Short keyword over the 4-hit cap',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Short keywords stay at ≤4 hits (outside primary spans).',
    promptInstruction: 'Reduce exact repeats; prefer the natural term once or twice and use semantic variants.',
    evidence: 'contentQualityGate.evaluateContentQuality per-keyword caps',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#keyword fixtures',
  }),
  def({
    code: 'long_tail_density_violation', title: 'Long-tail keyword over the 2-hit cap',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Long-tail keywords stay at ≤2 hits (outside primary spans).',
    promptInstruction: 'Use the full phrase at most twice, in different contexts.',
    evidence: 'contentQualityGate.evaluateContentQuality per-keyword caps',
    shipEffect: 'block', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#keyword fixtures',
  }),

  // ── Cannibalization risk (warnings; admin decides) ────────────────────────
  def({
    code: 'cannibalization_exact_match', title: 'Primary keyword exactly matches an existing page',
    severity: 'warning', owner: 'human', repairClass: 'human_only', appliesTo: 'all',
    requirement: 'One cluster per URL; differentiate or merge competing estate pages.',
    promptInstruction: 'Differentiate: narrow the title/H1 to a sub-topic. Or merge: redirect the weaker page via the cannibal merge tool.',
    evidence: 'contentQualityGate.evaluateContentQuality competing-page overlap',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#cannibalization fixtures',
  }),
  def({
    code: 'cannibalization_high_overlap', title: 'High keyword overlap with existing pages',
    severity: 'warning', owner: 'human', repairClass: 'human_only', appliesTo: 'all',
    requirement: 'Avoid diluting ranking signals across sibling pages.',
    promptInstruction: 'Add a differentiation note, narrow the focus, or approve if intents differ.',
    evidence: 'contentQualityGate.evaluateContentQuality competing-page overlap',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#cannibalization fixtures',
  }),
  def({
    code: 'cannibalization_low_overlap', title: 'Competing pages share the keyword area',
    severity: 'warning', owner: 'human', repairClass: 'human_only', appliesTo: 'all',
    requirement: 'Verify competing pages serve different search intents.',
    promptInstruction: 'Verify the pages serve different search intents; differentiate or merge if not.',
    evidence: 'contentQualityGate.evaluateContentQuality competing-page overlap',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.evaluateContentQuality',
    testFixture: 'tests/contentQualityPlaybook.test.ts#cannibalization fixtures',
  }),

  // ── Audit scorecard (audit.ts) ────────────────────────────────────────────
  def({
    code: 'ownership', title: 'Ownership resolver blocker',
    severity: 'blocker', owner: 'brief', repairClass: 'human_only', appliesTo: 'all',
    requirement: 'The keyword resolves to a shippable estate host with no ownership blockers.',
    promptInstruction: 'Change keyword, content type, or expand the existing owner URL.',
    evidence: 'audit.auditContent ownershipBlockers',
    shipEffect: 'block', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'thin_content', title: 'Thin content (below absolute floor)',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Body words ≥ absolute thin floor for the content tier.',
    promptInstruction: 'Expand with procedures, documents, FAQs, and sources.',
    evidence: 'contentDepth.checkContentDepth / audit.auditContent',
    shipEffect: 'block', evaluator: 'contentDepth.checkContentDepth',
    testFixture: 'tests/contentQualityPlaybook.test.ts#depth fixtures',
  }),
  def({
    code: 'word_count', title: 'Below Google-depth floor',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Body words ≥ type minimum (also reported as a pass when met).',
    promptInstruction: 'Expand body prose to the type minimum: procedures, document checklists, eligibility, risks, timelines, FAQs.',
    evidence: 'contentDepth.checkContentDepth / audit.auditContent',
    shipEffect: 'block', evaluator: 'contentDepth.checkContentDepth',
    testFixture: 'tests/contentQualityPlaybook.test.ts#depth fixtures',
  }),
  def({
    code: 'word_count_target', title: 'Meets floor but under target',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Aim for the tier target, not the floor.',
    promptInstruction: 'Add another H2 section or expand FAQs toward the target word count.',
    evidence: 'audit.auditContent depth target check',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#depth fixtures',
  }),
  def({
    code: 'title', title: 'Title length outside the 30–60 band',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Title present and 30–60 characters (missing title blocks ship).',
    promptInstruction: 'Set YAML title 30–60 chars with primary keyword + year/place when relevant.',
    evidence: 'audit.auditContent title band check',
    shipEffect: 'block', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'meta_description', title: 'Meta description outside the 70–160 band',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Description present and 70–160 characters.',
    promptInstruction: 'Add description: 70–160 characters with a concrete benefit.',
    evidence: 'audit.auditContent meta band check',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'h2_structure', title: 'Fewer than 4 H2 sections (audit)',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'At least 4 clear H2 sections.',
    promptInstruction: 'Add clear H2 sections covering procedure, documents, risks, FAQ.',
    evidence: 'audit.auditContent H2 counter',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'toc_duplicates', title: 'Duplicate Table of Contents entries',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Each section appears exactly once in the TOC.',
    promptInstruction: 'Remove repeated TOC entries — each section should appear exactly once.',
    evidence: 'audit.auditContent TOC dedup check',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'keyword', title: 'Primary keyword weak/missing in title',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Primary keyword appears naturally in title and first H2.',
    promptInstruction: 'Include the primary keyword naturally in title and first H2.',
    evidence: 'audit.auditContent keyword check',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'citations', title: 'Official authority citations',
    severity: 'blocker', owner: 'reviewer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Indexable content cites an on-topic official authority (warning when non-indexable).',
    promptInstruction: 'Cite the issuing body for this claim or the same-region immigration department with a live official URL.',
    evidence: 'audit.auditContent citation-policy check',
    shipEffect: 'block', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'schema_article', title: 'Article JSON-LD',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Article JSON-LD present in an application/ld+json block (scaffold-generated).',
    promptInstruction: 'Add Article schema in application/ld+json.',
    evidence: 'audit.auditContent Article schema detection',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'schema_faq', title: 'FAQPage JSON-LD',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'FAQPage JSON-LD present when FAQ content exists (scaffold-generated).',
    promptInstruction: 'Add 4–6 FAQs with FAQPage schema for AI overviews.',
    evidence: 'audit.auditContent FAQPage schema detection',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'internal_links', title: 'Internal/estate link count',
    severity: 'warning', owner: 'reviewer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'At least 2 internal estate links from the verified set.',
    promptInstruction: 'Link to hub + 1–2 related legal/regional pages from the verified allowlist.',
    evidence: 'audit.auditContent countEstateLinks',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'ai_answer_block', title: 'Answer/TL;DR block (audit)',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'A concise answer/TL;DR block exists for AI Overviews and llms.txt.',
    promptInstruction: 'Add a concise "In 60 seconds" list for AI Overviews and llms.txt.',
    evidence: 'audit.auditContent answer-block detection',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'robots_conflict', title: 'noindex on an indexable ship',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Robots directive matches the indexable intent.',
    promptInstruction: 'Set robots: index,follow or set indexable=false.',
    evidence: 'audit.auditContent robots policy check',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'robots_missing_noindex', title: 'Non-indexable ship missing robots noindex',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Non-indexable ships declare robots: noindex,follow.',
    promptInstruction: 'Set robots: noindex,follow in front matter for non-indexable ships.',
    evidence: 'audit.auditContent robots policy check',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'robots_noindex', title: 'noindex declared (pass)',
    severity: 'info', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Noindex declared for non-indexable content (informational pass).',
    promptInstruction: '(pass — no action)',
    evidence: 'audit.auditContent robots pass record',
    shipEffect: 'advisory', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'robots_index', title: 'Indexable intent (pass)',
    severity: 'info', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Indexable intent with no noindex (informational pass).',
    promptInstruction: '(pass — no action)',
    evidence: 'audit.auditContent robots pass record',
    shipEffect: 'advisory', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'disclaimer', title: 'Educational disclaimer (audit)',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Disclaimer present (blocker when indexable; warning otherwise).',
    promptInstruction: 'Add short disclaimer: educational only, not legal advice.',
    evidence: 'audit.auditContent DISCLAIMER_RE parity check',
    shipEffect: 'block', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'human_voice', title: 'Human voice pass',
    severity: 'info', owner: 'writer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Human-voice score ≥ 75 (pass record; <55 blocks via inhuman_voice).',
    promptInstruction: '(pass — no action)',
    evidence: 'audit.auditContent humanScore pass record',
    shipEffect: 'advisory', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'duplicate_h2', title: 'Duplicate H2 section',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Each H2 heading appears exactly once.',
    promptInstruction: 'Remove duplicate H2 sections — each heading should appear exactly once.',
    evidence: 'audit.auditContent H2 dedup check',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'broken_asterisk', title: 'Broken asterisk emphasis',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Well-formed emphasis markers.',
    promptInstruction: 'Use *text* for italic or - text for bullets — not *text (no space).',
    evidence: 'audit.auditContent asterisk scan',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'bold_faq_questions', title: 'FAQ questions in bold instead of ### headings',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'FAQ questions use ### headings for FAQPage schema extraction.',
    promptInstruction: 'Convert **Question?** to ### Question? in FAQ sections.',
    evidence: 'audit.auditContent FAQ heading scan',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'duplicate_jsonld', title: 'More than 2 JSON-LD blocks',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'At most Article + FAQPage JSON-LD blocks.',
    promptInstruction: 'Remove duplicate JSON-LD blocks — keep only Article + FAQPage.',
    evidence: 'audit.auditContent JSON-LD counter',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'stray_article_heading', title: 'Stray "## Article" heading',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'No content-type label used as a section heading.',
    promptInstruction: 'Remove "## Article" — it is a content-type label, not a section heading.',
    evidence: 'audit.auditContent heading scan',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),
  def({
    code: 'mixed_bullets', title: 'Mixed bullet styles',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'One bullet marker style (dash).',
    promptInstruction: 'Normalize all bullets to - (dash) for consistency.',
    evidence: 'audit.auditContent bullet-style scan',
    shipEffect: 'allow_with_flag', evaluator: 'audit.auditContent',
    testFixture: 'tests/contentQualityPlaybook.test.ts#audit fixtures',
  }),

  // ── Link integrity (linkAudit.ts) ─────────────────────────────────────────
  def({
    code: 'placeholder_link', title: 'Placeholder / invented URL',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'No placeholder or invented URLs.',
    promptInstruction: 'Replace with a verified estate URL from the INTERNAL LINK ALLOWLIST or remove the link.',
    evidence: 'linkAudit.auditLinksSync placeholder host/path scan',
    shipEffect: 'block', evaluator: 'linkAudit.auditLinksSync',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),
  def({
    code: 'malformed_link', title: 'Malformed link URL',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Links are full https URLs or estate-relative paths.',
    promptInstruction: 'Fix the link syntax — full https URL or estate-relative path.',
    evidence: 'linkAudit.auditLinksSync malformed URL check',
    shipEffect: 'block', evaluator: 'linkAudit.auditLinksSync',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),
  def({
    code: 'insecure_internal_link', title: 'Internal link uses http://',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Internal links use https.',
    promptInstruction: 'Upgrade to https://.',
    evidence: 'linkAudit.auditLinksSync scheme check',
    shipEffect: 'allow_with_flag', evaluator: 'linkAudit.auditLinksSync',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),
  def({
    code: 'unverified_internal_link', title: 'Internal link not in the verified live set',
    severity: 'warning', owner: 'human', repairClass: 'human_only', appliesTo: 'all',
    requirement: 'Internal links resolve on the live estate (live verification evidence).',
    promptInstruction: 'Re-verify the URL against the live site before shipping.',
    evidence: 'linkAudit.auditLinksSync verified-set membership',
    shipEffect: 'allow_with_flag', evaluator: 'linkAudit.auditLinksSync',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),
  def({
    code: 'unlinked_related_guide', title: 'Related guide named without a hyperlink',
    severity: 'blocker', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Every guide named in a Related guides / Further reading section is a clickable link, so a reader can actually reach it.',
    promptInstruction: 'Turn each related-guide entry into a markdown link to the real guide: `- [Guide title](https://legal.yousafeconsultancy.com/<region>/<slug>)`. Use only verified estate URLs. If no live guide exists for an entry, delete that entry — never leave a guide title as bare text.',
    evidence: 'contentQualityGate.auditReferenceReachability related-section scan',
    shipEffect: 'block', evaluator: 'contentQualityGate.auditReferenceReachability',
    testFixture: 'tests/reference-reachability.test.ts',
  }),
  def({
    code: 'bare_url_not_hyperlinked', title: 'URL printed as plain text instead of a link',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: INDEXABLE_FORM,
    requirement: 'Every URL — including citations under ## Sources — is wrapped in a descriptive anchor, because bare URLs are not clickable in MDX or the caseworks JSX renderer.',
    promptInstruction: 'Wrap every raw URL in a descriptive markdown link, e.g. `[GOV.UK family visa guidance](https://www.gov.uk/family-visa)`. The citation label becomes the anchor text.',
    evidence: 'contentQualityGate.auditReferenceReachability bare-URL scan',
    shipEffect: 'block', evaluator: 'contentQualityGate.auditReferenceReachability',
    testFixture: 'tests/reference-reachability.test.ts',
  }),
  def({
    code: 'source_name_not_hyperlinked', title: 'Source listed as plain text with no link',
    severity: 'warning', owner: 'writer', repairClass: 'targeted_ai', appliesTo: INDEXABLE_FORM,
    requirement: 'Every entry under ## Sources / ## Official sources is a clickable link to the named agency (deterministic repair links curated official labels; unknown labels need the writer).',
    promptInstruction: 'Wrap the source label in a markdown link to the official agency URL, e.g. `- [Study in the States (DHS)](https://studyinthestates.dhs.gov/)`. If no official URL can be verified, remove the entry — never ship an unlinkable source.',
    evidence: 'contentQualityGate.auditReferenceReachability sources plain-label scan',
    shipEffect: 'allow_with_flag', evaluator: 'contentQualityGate.auditReferenceReachability',
    testFixture: 'tests/reference-reachability.test.ts',
  }),
  def({
    code: 'dead_internal_link', title: 'Internal link does not resolve',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Internal links resolve (HTTP 2xx/3xx).',
    promptInstruction: 'Remove it or replace with a verified estate URL.',
    evidence: 'linkAudit.classifyLiveStatus live verification',
    shipEffect: 'block', evaluator: 'linkAudit.classifyLiveStatus',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),
  def({
    code: 'dead_external_link', title: 'External link is dead',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'External official links resolve.',
    promptInstruction: 'Do not invent government paths. Use a live official URL.',
    evidence: 'linkAudit.classifyLiveStatus live verification',
    shipEffect: 'block', evaluator: 'linkAudit.classifyLiveStatus',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),
  def({
    code: 'untrusted_external_link', title: 'External link is not a recognised authority',
    severity: 'warning', owner: 'reviewer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'External links are citable authorities for the surrounding claim.',
    promptInstruction: 'Keep it only if live and directly supportive; otherwise swap for an on-topic authority or remove.',
    evidence: 'linkAudit.auditLinksSync citation-policy check',
    shipEffect: 'allow_with_flag', evaluator: 'linkAudit.auditLinksSync',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),
  def({
    code: 'irrelevant_external_link', title: 'Official page may be a weak fit',
    severity: 'warning', owner: 'reviewer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Citations are relevant to the article claim.',
    promptInstruction: 'Keep it if live; only swap or remove when dead or clearly unrelated.',
    evidence: 'linkAudit.auditLinksSync relevance check',
    shipEffect: 'allow_with_flag', evaluator: 'linkAudit.auditLinksSync',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),
  def({
    code: 'unreachable_internal_link', title: 'Internal link unreachable right now',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Internal links re-verified when the network recovers (can block).',
    promptInstruction: 'Re-verify before shipping.',
    evidence: 'linkAudit.classifyLiveStatus network check',
    shipEffect: 'block', evaluator: 'linkAudit.classifyLiveStatus',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),
  def({
    code: 'unreachable_external_link', title: 'External link unreachable right now',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'External links re-verified when the network recovers (can block for non-authority hosts).',
    promptInstruction: 'Re-verify before shipping.',
    evidence: 'linkAudit.classifyLiveStatus network check',
    shipEffect: 'block', evaluator: 'linkAudit.classifyLiveStatus',
    testFixture: 'tests/contentQualityPlaybook.test.ts#link fixtures',
  }),

  // ── Ahrefs draft contract (ahrefsIssues.evaluateAhrefsDraft) ───────────────
  def({
    code: 'ahrefs_title_missing', title: 'Missing title',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Title present.',
    promptInstruction: 'Set YAML title to 30–60 characters.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft title check',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_title_too_short', title: 'Title too short',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Title ≥30 characters.',
    promptInstruction: 'Lengthen the title to 30–60 characters with the primary keyword.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft title band',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_title_too_long', title: 'Title too long',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Title ≤60 characters.',
    promptInstruction: 'Shorten the title to ≤60 characters so it is not truncated in SERPs.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft title band',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_meta_missing', title: 'Missing meta description (Ahrefs)',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Meta description present.',
    promptInstruction: 'Add description: 70–160 characters.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft meta band',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_meta_too_short', title: 'Meta description too short (Ahrefs)',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Meta description ≥70 characters.',
    promptInstruction: 'Expand the description to 70–160 characters.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft meta band',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_meta_too_long', title: 'Meta description too long (Ahrefs)',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Meta description ≤160 characters.',
    promptInstruction: 'Trim the description to ≤160 characters.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft meta band',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_h1_missing', title: 'No markdown H1 (Ahrefs)',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Exactly one markdown H1.',
    promptInstruction: 'Add a single `# Heading` that matches the title.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft H1 counter',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_h1_multiple', title: 'Multiple H1s (Ahrefs)',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Exactly one H1.',
    promptInstruction: 'Keep one H1; demote the extras to H2.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft H1 counter',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_canonical_missing', title: 'Missing canonical (Ahrefs)',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Canonical URL present in front matter.',
    promptInstruction: 'Set canonicalUrl to the live estate URL. Ship repair injects it from the owner plan.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft canonical check',
    shipEffect: 'allow_with_flag', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_noindex', title: 'Draft noindex on an indexable ship (Ahrefs)',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Robots directive matches indexable intent.',
    promptInstruction: 'Set robots: index,follow before shipping an indexable page.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft robots check',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_nofollow', title: 'Draft nofollow (Ahrefs)',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Indexable ships are not nofollow.',
    promptInstruction: 'Set robots: index,follow for indexable ships.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft robots check',
    shipEffect: 'allow_with_flag', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_og_incomplete', title: 'Open Graph incomplete (Ahrefs)',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'og:image present.',
    promptInstruction: 'Set ogImage: /og-image.png. renderTarget injects it on ship if missing.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft og check',
    shipEffect: 'allow_with_flag', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_double_slash', title: 'Double slash in URL (Ahrefs)',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'No double slash in canonical or body hrefs.',
    promptInstruction: 'Collapse `//` in the pathname. Ship repair sanitizes canonical + markdown hrefs.',
    evidence: 'ahrefsIssues.evaluateAhrefsDraft urlHasDoubleSlash',
    shipEffect: 'block', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),
  def({
    code: 'ahrefs_schema_invalid', title: 'JSON-LD fails schema.org validation (Ahrefs)',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Article/FAQPage JSON-LD parse and validate.',
    promptInstruction: 'Article needs headline, image, datePublished, author; FAQPage needs mainEntity Question/Answer.',
    evidence: 'ahrefsIssues.articleJsonLdErrors',
    shipEffect: 'allow_with_flag', evaluator: 'ahrefsIssues.evaluateAhrefsDraft',
    testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs fixtures',
  }),

  // ── Ahrefs Site-Audit catalog imports (crawl-imported, not draft-emitted) ─
  ...([
    ['ahrefs_title_duplicate', 'Duplicate title', 'warning'],
    ['ahrefs_meta_duplicate', 'Duplicate meta description', 'warning'],
    ['ahrefs_orphan', 'Orphan page (no incoming internal links)', 'warning'],
    ['ahrefs_404', '404 page', 'warning'],
    ['ahrefs_4xx', '4XX page', 'warning'],
    ['ahrefs_sitemap_3xx', '3XX redirect in sitemap', 'warning'],
    ['ahrefs_sitemap_4xx', '4XX page in sitemap', 'warning'],
    ['ahrefs_3xx', '3XX redirect', 'warning'],
    ['ahrefs_not_in_sitemap', 'Indexable page not in sitemap', 'warning'],
    ['ahrefs_og_missing', 'Missing Open Graph tags', 'warning'],
    ['ahrefs_indexnow', 'Pages to submit to IndexNow', 'warning'],
    ['ahrefs_thin_inbound', 'Only one dofollow incoming internal link', 'warning'],
    ['ahrefs_links_to_redirect', 'Page has links to redirect', 'warning'],
    ['ahrefs_nofollow_out', 'Nofollow outgoing internal links', 'warning'],
    ['ahrefs_nofollow_in', 'Nofollow incoming internal links only', 'warning'],
    ['ahrefs_mixed_inbound', 'Nofollow and dofollow incoming internal links', 'warning'],
    ['ahrefs_h1_changed', 'H1 tag changed', 'warning'],
    ['ahrefs_meta_changed', 'Meta description changed', 'warning'],
    ['ahrefs_title_changed', 'Title tag changed', 'warning'],
    ['ahrefs_words_changed', 'Word count changed', 'warning'],
    ['ahrefs_http_https', 'HTTP to HTTPS redirect', 'warning'],
    ['ahrefs_redirected_js', 'Redirected JavaScript (platform)', 'warning'],
    ['ahrefs_broken_js', 'Broken JavaScript chunk (deploy)', 'warning'],
    ['ahrefs_page_slow', 'Slow page', 'warning'],
    ['ahrefs_5xx', 'Server error', 'warning'],
  ] as const).map(([code, title, severity]) =>
    def({
      code,
      title,
      severity: severity as GateSeverity,
      owner: 'deterministic',
      repairClass: 'deterministic',
      appliesTo: 'all',
      requirement: `${title} (Ahrefs Site Audit import).`,
      promptInstruction: `Ahrefs crawl import — resolve via Site Health, not model output (${title}).`,
      evidence: 'ahrefsIssues.AHREFS_ISSUE_CATALOG gateCode mapping',
      shipEffect: 'allow_with_flag',
      evaluator: 'ahrefsIssues.AHREFS_ISSUE_CATALOG',
      testFixture: 'tests/contentQualityPlaybook.test.ts#ahrefs catalog',
    }),
  ),

  // ── Master Engine risk scan (masterEngine.evaluateRisks) ─────────────────
  def({
    code: 'noindex', title: 'Page marked noindex',
    severity: 'blocker', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Live page is indexable when intended.',
    promptInstruction: 'Set robots: index,follow for pages intended to rank.',
    evidence: 'masterEngine.evaluateRisks live index check',
    shipEffect: 'block', evaluator: 'masterEngine.evaluateRisks',
    testFixture: 'tests/contentQualityPlaybook.test.ts#master risk list',
  }),
  def({
    code: 'canonical_mismatch', title: 'Live canonical does not match the target URL',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Live canonical equals the job target URL.',
    promptInstruction: 'Align the live canonical with the target URL.',
    evidence: 'masterEngine.evaluateRisks canonical check',
    shipEffect: 'allow_with_flag', evaluator: 'masterEngine.evaluateRisks',
    testFixture: 'tests/contentQualityPlaybook.test.ts#master risk list',
  }),
  def({
    code: 'orphan', title: 'Page has no internal estate links',
    severity: 'warning', owner: 'reviewer', repairClass: 'targeted_ai', appliesTo: 'all',
    requirement: 'Pages receive at least one internal estate link.',
    promptInstruction: 'Link the page from a related estate hub or guide.',
    evidence: 'masterEngine.evaluateRisks estate link check',
    shipEffect: 'allow_with_flag', evaluator: 'masterEngine.evaluateRisks',
    testFixture: 'tests/contentQualityPlaybook.test.ts#master risk list',
  }),
  def({
    code: 'missing_sitemap', title: 'Page missing from the repo sitemap',
    severity: 'warning', owner: 'deterministic', repairClass: 'deterministic', appliesTo: 'all',
    requirement: 'Indexable pages appear in the repo sitemap.',
    promptInstruction: 'Add the URL to the repo sitemap (Site Health).',
    evidence: 'masterEngine.evaluateRisks sitemap check',
    shipEffect: 'allow_with_flag', evaluator: 'masterEngine.evaluateRisks',
    testFixture: 'tests/contentQualityPlaybook.test.ts#master risk list',
  }),
  def({
    code: 'cannibalization', title: 'Multiple URLs target the same intent',
    severity: 'warning', owner: 'human', repairClass: 'human_only', appliesTo: 'all',
    requirement: 'Consolidate or differentiate competing URLs.',
    promptInstruction: 'Consolidate or differentiate the competing pages.',
    evidence: 'masterEngine.evaluateRisks competing URL check',
    shipEffect: 'allow_with_flag', evaluator: 'masterEngine.evaluateRisks',
    testFixture: 'tests/contentQualityPlaybook.test.ts#master risk list',
  }),
]

// ── Registry index ──────────────────────────────────────────────────────────

const REGISTRY = new Map<string, GateDefinition>(
  CONTENT_QUALITY_PLAYBOOK.map((g) => [g.code, g]),
)

/** Look up a gate definition; returns undefined for unknown codes. */
export function lookupGate(code: string): GateDefinition | undefined {
  return REGISTRY.get(String(code || ''))
}

/** Look up a gate definition; throws when the code is not registered. */
export function gate(code: string): GateDefinition {
  const g = REGISTRY.get(String(code || ''))
  if (!g) throw new Error(`content quality playbook: unknown gate code "${code}"`)
  return g
}

export function severityFor(code: string): GateSeverity {
  return gate(code).severity
}

export function ownerFor(code: string): GateOwner {
  return gate(code).owner
}

export function repairClassFor(code: string): RepairClass {
  return gate(code).repairClass
}

export function shipEffectFor(code: string): GateDefinition['shipEffect'] {
  return gate(code).shipEffect
}

/**
 * Can this finding legitimately be *cleared* by the remediation loop, or is it
 * an advisory note that will still be reported after a correct fix attempt?
 *
 * `allow_with_flag` / `advisory` findings must NOT keep the audit→edit loop
 * spinning: e.g. `missing_synthesized_short_keyword` names a term the keyword
 * partitioner invented to satisfy a count floor. It has no search-demand
 * evidence, so there is no honest way for an editor model to "cover" it — the
 * loop burned its whole AI budget re-requesting a fix that could never land,
 * then reported the same warning. Treat these as terminal-but-shippable.
 */
export function blocksShip(code: string): boolean {
  try {
    return shipEffectFor(code) === 'block'
  } catch {
    // Unregistered codes stay conservative — they block until registered.
    return true
  }
}

/**
 * Assert every finding carries a registered code, and that an evaluator
 * 'blocker' never maps to a registry entry that no longer blocks (no silent
 * downgrades). 'pass'/'info' findings are accepted without a severity check.
 */
export function assertRegisteredFindingCodes(
  findings: Array<{ code: string; severity?: string }>,
): void {
  for (const f of findings || []) {
    const g = gate(f.code) // throws on unregistered code
    if (f.severity === 'blocker') {
      if (g.shipEffect !== 'block') {
        throw new Error(`content quality playbook: code "${f.code}" is a live blocker but registered shipEffect is "${g.shipEffect}"`)
      }
      if (g.severity !== 'blocker' && g.severity !== 'format_blocker') {
        throw new Error(`content quality playbook: code "${f.code}" is a live blocker but registered severity is "${g.severity}"`)
      }
    } else if (f.severity === 'warning') {
      if (g.severity !== 'warning') {
        throw new Error(`content quality playbook: code "${f.code}" is a live warning but registered severity is "${g.severity}"`)
      }
    }
  }
}

/** Admin-visible version + diagnostics payload. */
export function playbookManifest(): {
  playbookVersion: string
  gateCount: number
  codes: string[]
  bySeverity: Record<GateSeverity, number>
  shipBlockingCodes: string[]
} {
  const bySeverity: Record<GateSeverity, number> = {
    format_blocker: 0,
    blocker: 0,
    warning: 0,
    info: 0,
  }
  for (const g of CONTENT_QUALITY_PLAYBOOK) bySeverity[g.severity]++
  return {
    playbookVersion: PLAYBOOK_VERSION,
    gateCount: CONTENT_QUALITY_PLAYBOOK.length,
    codes: CONTENT_QUALITY_PLAYBOOK.map((g) => g.code),
    bySeverity,
    shipBlockingCodes: CONTENT_QUALITY_PLAYBOOK.filter((g) => g.shipEffect === 'block').map((g) => g.code),
  }
}

// ── Prompt projections ──────────────────────────────────────────────────────
//
// Prompts render rules from this registry plus the job's ContentSpec; they
// never invent or redefine one. All three role renders share the same
// versioned core requirements for one job (prompt parity).

interface SpecLike {
  version: string
  jobId: string
  contentType: string
  region: string
  indexable: boolean
  primaryKeyword: string
  requiredKeywords: Array<{ phrase: string; kind: 'short' | 'long_tail'; optional?: boolean }>
  wordBudget: { min: number; target: number; max: number }
  verifiedEstateLinks: Array<{ url: string; anchor: string; role: string }>
  approvedSources: Array<{ url: string; publisher: string; purpose: string }>
  ymyl: { disclaimerRequired: boolean }
  aeoGeo: { answerFirst: boolean; faqRequired: boolean }
}

function keywordLines(spec: SpecLike): string[] {
  const short = spec.requiredKeywords.filter((k) => k.kind === 'short' && !k.optional)
  const long = spec.requiredKeywords.filter((k) => k.kind === 'long_tail' && !k.optional)
  const optional = spec.requiredKeywords.filter((k) => k.optional)
  return [
    `- Primary keyword: ${spec.primaryKeyword}`,
    `- Required short keywords (each 1–4 uses): ${short.map((k) => k.phrase).join(', ') || '(none)'}`,
    `- Required long-tail keywords (each 1–2 uses): ${long.map((k) => k.phrase).join(', ') || '(none)'}`,
    optional.length ? `- Optional keywords (info only; never force-fit): ${optional.map((k) => k.phrase).join(', ')}` : '',
  ].filter(Boolean)
}

/** The versioned core requirements every stage receives identically. */
function coreRequirements(spec: SpecLike): string[] {
  return [
    `CONTENT QUALITY PLAYBOOK ${spec.version} · job ${spec.jobId}`,
    `- Content type: ${spec.contentType} · region: ${spec.region} · indexable: ${spec.indexable ? 'yes' : 'no'}`,
    `- Word budget: min ${spec.wordBudget.min} · target ${spec.wordBudget.target} · max ${spec.wordBudget.max} body words (YAML, JSON-LD, and code fences never count).`,
    ...keywordLines(spec),
    `- Verified estate links (use ONLY these URLs for internal links): ${spec.verifiedEstateLinks.map((l) => l.url).join(', ') || '(none — do not create internal links)'}`,
    `- Approved sources: ${spec.approvedSources.map((s) => s.url).join(', ') || '(none — prefer agency names as plain text)'}`,
    spec.ymyl.disclaimerRequired ? '- YMYL: educational disclaimer required; no outcome promises; official jurisdiction-appropriate sources.' : '',
    spec.aeoGeo.answerFirst ? '- AEO/GEO: answer first in the opening block; self-contained FAQ answers when required.' : '',
  ].filter(Boolean)
}

/** Rules the briefing stage renders (facts the brief owns). */
export function renderBriefRules(spec: SpecLike): string {
  return [
    '## CONTENT QUALITY PLAYBOOK — BRIEF RULES',
    ...coreRequirements(spec),
    '- The brief must echo every required keyword and note any keyword with no clean context as optional.',
    '- The brief never invents links, sources, required keywords, content type, region, or structural obligations.',
  ].join('\n')
}

/** Rules the writer stage renders (the generation contract). */
export function renderWriterRules(spec: SpecLike): string {
  return [
    '## CONTENT QUALITY PLAYBOOK — WRITER RULES',
    ...coreRequirements(spec),
    '- Write into the canonical format skeleton; every rule above is machine-audited before shipping.',
    '- Zero outcome promises, zero AI-slop phrasing, zero invented URLs or citations.',
  ].join('\n')
}

/** Rules the reviewer stage renders from the outstanding findings. */
export function renderReviewerRules(
  findings: Array<{ code: string; severity?: string }>,
  spec: SpecLike,
): string {
  const rules = (findings || [])
    .map((f) => lookupGate(f.code))
    .filter((g): g is GateDefinition => Boolean(g))
  const unique = new Map(rules.map((g) => [g.code, g]))
  return [
    '## CONTENT QUALITY PLAYBOOK — REVIEWER RULES',
    ...coreRequirements(spec),
    '- Fix ONLY the outstanding findings below with the smallest possible targeted edit; never regenerate the document.',
    ...Array.from(unique.values()).map(
      (g) => `- [${g.code}] (${g.severity}, repair: ${g.repairClass}): ${g.promptInstruction}`,
    ),
  ].join('\n')
}
