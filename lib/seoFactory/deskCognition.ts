/**
 * Conversation-visible chain of thought for the linear desk.
 *
 * Explore (before the brief) and self-reflection (after every draft) are
 * JSON turns in the same thread. They steer the article; they are never
 * the article. Hidden provider thinking is a separate knob (reasoningEffort).
 *
 * Automated scores sit on top of the model's verdict: named explore patterns
 * are scored for completeness, and reflection is scored against the draft so
 * an optimistic "ship" cannot skip a rewrite.
 */

import { detectKitSectionOpeners } from './cohesionCritique'
import { unwrapWholeDocumentFence } from './contentDepth'
import type { QualityGateResult } from './contentQualityGate'

export type DeskExplore = {
  readerQuestion: string
  evidenceWeHave: string[]
  wouldHaveToInvent: string[]
  argumentSpine: string
  chapterPlan: Array<{ heading: string; because: string; covers: string[]; continues?: string }>
  kitRisks: string[]
  gateWatch: string[]
  takeawayClaims: string[]
  faqThatDoesNotEchoH2s: string[]
}

export type DeskReflection = {
  throughline: string
  guesswork: string[]
  stuffing: string[]
  kitSplices: string[]
  layout: string[]
  gateRisks: string[]
  verdict: 'ship' | 'revise'
  revisePlan: string[]
}

export type ExplorePatternId =
  | 'reader_question'
  | 'evidence_map'
  | 'omit_list'
  | 'argument_spine'
  | 'chapter_continuity'
  | 'kit_risk'
  | 'gate_watch'
  | 'takeaway_claims'
  | 'faq_gap'

export type PatternScore = {
  id: ExplorePatternId
  title: string
  ok: boolean
  score: number
  note: string
}

export type ExploreScore = {
  score: number
  patterns: PatternScore[]
  missing: string[]
}

export type ReflectionDimensionId =
  | 'gates'
  | 'honesty'
  | 'throughline'
  | 'guesswork'
  | 'layout'
  | 'critique'

export type ReflectionDimension = {
  id: ReflectionDimensionId
  score: number
  weight: number
  note: string
}

export type ReflectionScore = {
  score: number
  floor: number
  pass: boolean
  dimensions: ReflectionDimension[]
  reasons: string[]
}

export const REFLECTION_SHIP_FLOOR = 70

export const EXPLORE_PATTERN_SPECS: Array<{
  id: ExplorePatternId
  title: string
  jsonKey: string
  instruction: string
}> = [
  { id: 'reader_question', title: 'READER_QUESTION', jsonKey: 'readerQuestion', instruction: 'the actual question this page must answer — not the raw keyword' },
  { id: 'evidence_map', title: 'EVIDENCE_MAP', jsonKey: 'evidenceWeHave', instruction: 'facts, URLs, and constraints that are actually in Discover' },
  { id: 'omit_list', title: 'OMIT_LIST', jsonKey: 'wouldHaveToInvent', instruction: 'fees, dates, stats, forms not in Discover — these will be omitted' },
  { id: 'argument_spine', title: 'ARGUMENT_SPINE', jsonKey: 'argumentSpine', instruction: 'one sentence the whole article will argue' },
  { id: 'chapter_continuity', title: 'CHAPTER_CONTINUITY', jsonKey: 'chapterPlan', instruction: 'each later H2 continues the previous; name the bridge in continues' },
  { id: 'kit_risk', title: 'KIT_RISK', jsonKey: 'kitRisks', instruction: 'where a mill writer would splice a kit piece or restate the thesis' },
  { id: 'gate_watch', title: 'GATE_WATCH', jsonKey: 'gateWatch', instruction: 'ship gates that fail if we are careless' },
  { id: 'takeaway_claims', title: 'TAKEAWAY_CLAIMS', jsonKey: 'takeawayClaims', instruction: '3–5 complete claims (subject + verb + consequence)' },
  { id: 'faq_gap', title: 'FAQ_GAP', jsonKey: 'faqThatDoesNotEchoH2s', instruction: 'reader worries the H2s will not already settle' },
]

const MILL_OPENER =
  /(?:this section covers|in this (?:section|guide|article)|in today's fast-paced|everything you need to know|when it comes to)/i

const COGNITION_KEYS =
  /"(argumentSpine|verdict|readerQuestion|wouldHaveToInvent|gateWatch|revisePlan|takeawayClaims|kitRisks|gateRisks|scores|patterns)"\s*:/

export function explorePrompt(): string {
  const patternLines = EXPLORE_PATTERN_SPECS.map(
    (p, i) => `${i + 1}. ${p.title} → ${p.jsonKey} — ${p.instruction}`,
  )
  return [
    'EXPLORE — chain of thought before the brief. Return ONLY a JSON object.',
    'Do not write the article. Do not invent facts. This JSON is thinking and will never be published.',
    'Use these chain-of-thought PATTERNS, in this order. Every pattern is required:',
    ...patternLines,
    '{',
    '  "readerQuestion": "the actual question this page must answer",',
    '  "evidenceWeHave": ["facts, URLs, constraints present in Discover"],',
    '  "wouldHaveToInvent": ["fees, dates, stats, forms not in Discover — these will be omitted"],',
    '  "argumentSpine": "one sentence the whole article will argue",',
    '  "chapterPlan": [{ "heading": "reader-question or decision-frame H2", "because": "why this chapter exists", "covers": ["topic from Discover"], "continues": "previous claim this chapter continues" }],',
    '  "kitRisks": ["places a mill writer would splice a kit piece or restate the thesis"],',
    '  "gateWatch": ["ship gates most likely to fail if we are careless"],',
    '  "takeawayClaims": ["complete claim: subject + verb + consequence"],',
    '  "faqThatDoesNotEchoH2s": ["reader worry the H2s will not already settle"]',
    '}',
    'RULES:',
    '- Use ONLY Discover intelligence. If it is not in Discover, it goes in wouldHaveToInvent.',
    '- argumentSpine is a claim, never the raw primary keyword.',
    '- takeawayClaims are complete sentences, never keyword fragments.',
    '- Chapter headings are reader questions or decision frames, never a keyword dump.',
    '- Later chapters MUST set continues so the drafter does not restart the thesis.',
    '- wouldHaveToInvent items become unresolved on the brief and are omitted from the article.',
  ].join('\n')
}

export function briefFromExploreAddendum(explore: DeskExplore, score?: ExploreScore | null): string {
  const missing = score?.missing?.length
    ? `Your explore missed these patterns — fill them in the brief so the drafter is not guessing: ${score.missing.join(', ')}.`
    : ''
  return [
    'You already explored in the previous turn. Seal the brief FROM that exploration — do not start over, do not invent.',
    `- thesis ← argumentSpine: ${explore.argumentSpine || '(fill from Discover, not the raw keyword)'}`,
    explore.takeawayClaims.length
      ? `- takeaways ← takeawayClaims:\n${explore.takeawayClaims.map((t) => `  - ${t}`).join('\n')}`
      : '- takeaways ← complete claims, not keyword fragments',
    explore.wouldHaveToInvent.length
      ? `- unresolved MUST include every wouldHaveToInvent item (omitted from the article): ${explore.wouldHaveToInvent.join(' · ')}`
      : '- unresolved lists anything you would still have to invent',
    explore.faqThatDoesNotEchoH2s.length
      ? `- faqQuestions ← faqThatDoesNotEchoH2s:\n${explore.faqThatDoesNotEchoH2s.map((q) => `  - ${q}`).join('\n')}`
      : '- faqQuestions are reader worries the H2s do not already settle',
    '- Later content H2s have bridgeFrom naming the previous claim.',
    missing,
  ].filter(Boolean).join('\n')
}

export function reflectPrompt(): string {
  return [
    'SELF-REFLECT. Critique the article you just wrote against the sealed brief and the ship gates — they have not changed since turn 0.',
    'Return ONLY a JSON object. Do not rewrite the article in this turn. This JSON is thinking and will never be published.',
    'An automated score will also grade this draft. Your verdict cannot hide kit splices, stuffing, or leftover blockers.',
    '{',
    '  "throughline": "does one argument hold, or did a chapter restart?",',
    '  "guesswork": ["claims not in Discover or the brief"],',
    '  "stuffing": ["keyword pasted as heading, opener, or checkbox"],',
    '  "kitSplices": ["H2 that reads like a standalone mini-guide"],',
    '  "layout": ["incomplete takeaways, mill opener, FAQ echoing an H2, missing bridge"],',
    '  "gateRisks": ["which ship gates would still fail, with evidence"],',
    '  "verdict": "ship" | "revise",',
    '  "revisePlan": ["if revise: the exact repair, keeping one article"]',
    '}',
    'Verdict is "ship" only if the article would pass as written. If stuffing, kit splices, guesswork, a restarted chapter, or a mill opener is present, verdict is "revise".',
  ].join('\n')
}

export function rewriteFromReflectionPrompt(opts: {
  reflection: DeskReflection | null
  blockerNotes: string
  warningNotes: string
  score?: ReflectionScore | null
}): string {
  const plan = opts.reflection?.revisePlan?.filter(Boolean) || []
  const scoreBlock = formatReflectionScore(opts.score)
  return [
    'REWRITE from your self-reflection. SELF-REVIEW against the same ship gates — they have not changed.',
    'Keep one argument. Do not stuff keywords. Do not splice kit pieces. Do not invent. Do not leak chain-of-thought.',
    scoreBlock,
    plan.length ? `Revise plan:\n${plan.map((s) => `- ${s}`).join('\n')}` : '',
    opts.blockerNotes,
    opts.warningNotes,
    'Return the complete corrected markdown article only. No JSON. No preamble. No <think> block.',
  ].filter(Boolean).join('\n\n')
}

export function formatReflectionScore(score?: ReflectionScore | null): string {
  if (!score) return ''
  const lines = [
    `AUTOMATED SCORE: ${score.score}/100 (ship floor ${score.floor})${score.pass ? ' — pass' : ' — must revise'}.`,
    ...score.reasons.map((r) => `- ${r}`),
  ]
  return lines.join('\n')
}

export function parseExplore(raw: string): DeskExplore | null {
  const o = extractJsonObject(raw)
  if (!o) return null
  const argumentSpine = str(o.argumentSpine)
  const readerQuestion = str(o.readerQuestion)
  if (!argumentSpine && !readerQuestion) return null
  return {
    readerQuestion,
    evidenceWeHave: strs(o.evidenceWeHave),
    wouldHaveToInvent: strs(o.wouldHaveToInvent),
    argumentSpine,
    chapterPlan: Array.isArray(o.chapterPlan)
      ? o.chapterPlan.map((row) => {
          const c = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
          return {
            heading: str(c.heading),
            because: str(c.because),
            covers: strs(c.covers),
            continues: str(c.continues) || undefined,
          }
        }).filter((c) => c.heading)
      : [],
    kitRisks: strs(o.kitRisks),
    gateWatch: strs(o.gateWatch),
    takeawayClaims: strs(o.takeawayClaims),
    faqThatDoesNotEchoH2s: strs(o.faqThatDoesNotEchoH2s),
  }
}

export function parseReflection(raw: string): DeskReflection | null {
  const o = extractJsonObject(raw)
  if (!o) return null
  const stuffing = strs(o.stuffing)
  const kitSplices = strs(o.kitSplices)
  const guesswork = strs(o.guesswork)
  const layout = strs(o.layout)
  const gateRisks = strs(o.gateRisks)
  const revisePlan = strs(o.revisePlan)
  const explicit = String(o.verdict || '').trim().toLowerCase()
  const inferred: 'ship' | 'revise' =
    stuffing.length || kitSplices.length || guesswork.length || gateRisks.length || layout.length
      ? 'revise'
      : 'ship'
  const verdict: 'ship' | 'revise' = explicit === 'ship' || explicit === 'revise' ? explicit : inferred
  return {
    throughline: str(o.throughline),
    guesswork,
    stuffing,
    kitSplices,
    layout,
    gateRisks,
    verdict,
    revisePlan,
  }
}

export function scoreExplore(
  explore: DeskExplore | null,
  opts?: { primaryKeyword?: string },
): ExploreScore {
  const primary = String(opts?.primaryKeyword || '').trim().toLowerCase()
  if (!explore) {
    return {
      score: 0,
      patterns: EXPLORE_PATTERN_SPECS.map((p) => ({
        id: p.id,
        title: p.title,
        ok: false,
        score: 0,
        note: 'explore JSON missing',
      })),
      missing: EXPLORE_PATTERN_SPECS.map((p) => p.title),
    }
  }
  const patterns: PatternScore[] = EXPLORE_PATTERN_SPECS.map((spec) => scoreExplorePattern(spec.id, explore, primary))
  const score = Math.round(patterns.reduce((sum, p) => sum + p.score, 0) / patterns.length)
  return {
    score,
    patterns,
    missing: patterns.filter((p) => !p.ok).map((p) => p.title),
  }
}

export function scoreReflection(opts: {
  content: string
  quality: Pick<QualityGateResult, 'ok' | 'blockers' | 'warnings'>
  reflection: DeskReflection | null
  explore?: DeskExplore | null
  unresolved?: string[]
  primaryKeyword?: string
}): ReflectionScore {
  const blockers = opts.quality.blockers || []
  const hasBlockers = Boolean(!opts.quality.ok && blockers.length)
  const kit = detectKitSectionOpeners(opts.content || '')
  const mill = MILL_OPENER.test(opts.content || '')
  const omit = uniqueStrings([
    ...(opts.explore?.wouldHaveToInvent || []),
    ...(opts.unresolved || []),
  ])
  const inventedHeadings = omit.filter((term) => headingContains(opts.content, term))
  const verdict = opts.reflection?.verdict || 'ship'
  const critiqueIssues = Boolean(
    opts.reflection?.stuffing.length ||
    opts.reflection?.kitSplices.length ||
    opts.reflection?.guesswork.length ||
    opts.reflection?.layout.length ||
    opts.reflection?.gateRisks.length,
  )

  const dimensions: ReflectionDimension[] = [
    dim('gates', 30, hasBlockers ? Math.max(0, 100 - blockers.length * 20) : 100,
      hasBlockers ? `${blockers.length} ship blocker(s): ${blockers.map((b) => b.code).join(', ')}` : 'no ship blockers'),
    dim('honesty', 20, honestyScore(hasBlockers, verdict, opts.reflection, blockers),
      honestyNote(hasBlockers, verdict, opts.reflection)),
    dim('throughline', 20, kit.length === 0 ? 100 : kit.length === 1 ? 50 : 0,
      kit.length ? `${kit.length} kit-piece opening(s)` : 'chapters continue the article'),
    dim('guesswork', 10, inventedHeadings.length ? 0 : 100,
      inventedHeadings.length ? `omit-list terms used as headings: ${inventedHeadings.join(', ')}` : 'omit-list not pasted as headings'),
    dim('layout', 10, mill ? 0 : 100,
      mill ? 'mill opener ("this section covers" / "in today\'s fast-paced")' : 'no mill openers'),
    dim('critique', 10, critiqueScore(opts.reflection, hasBlockers || critiqueIssues || kit.length > 0),
      critiqueNote(opts.reflection)),
  ]

  const score = Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / 100)
  const reasons = dimensions.filter((d) => d.score < 80).map((d) => `${d.id}: ${d.score}/100 — ${d.note}`)
  const pass =
    score >= REFLECTION_SHIP_FLOOR &&
    !hasBlockers &&
    kit.length === 0 &&
    !mill &&
    inventedHeadings.length === 0
  return {
    score,
    floor: REFLECTION_SHIP_FLOOR,
    pass,
    dimensions,
    reasons: reasons.length ? reasons : [`all dimensions ≥ 80 (score ${score})`],
  }
}

export function needsRewrite(
  reflection: DeskReflection | null,
  hasBlockers: boolean,
  score?: ReflectionScore | null,
): boolean {
  if (hasBlockers) return true
  if (reflection?.verdict === 'revise') return true
  if (score && !score.pass) return true
  if (
    reflection &&
    (reflection.stuffing.length ||
      reflection.kitSplices.length ||
      reflection.guesswork.length ||
      reflection.layout.length ||
      reflection.gateRisks.length)
  ) {
    return true
  }
  return false
}

export function mergeExploreIntoBrief<T extends {
  thesis: string
  takeaways: string[]
  faqQuestions: string[]
  unresolved: string[]
}>(brief: T, explore: DeskExplore | null): T {
  if (!explore) return brief
  const unresolved = uniqueStrings([...brief.unresolved, ...explore.wouldHaveToInvent])
  return {
    ...brief,
    thesis: brief.thesis || explore.argumentSpine,
    takeaways: brief.takeaways.length ? brief.takeaways : explore.takeawayClaims.slice(0, 5),
    faqQuestions: brief.faqQuestions.length ? brief.faqQuestions : explore.faqThatDoesNotEchoH2s.slice(0, 6),
    unresolved,
  }
}

/**
 * Drop provider CoT wrappers and leaked explore/reflect JSON so the published
 * body is the article, not the thinking that produced it.
 */
export function stripDeskThinking(raw: string): string {
  let text = String(raw || '')
  text = text.replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '\n')
  text = text.replace(/<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi, '\n')
  text = text.replace(/<think(?:ing)?\b[^>]*>[\s\S]*$/gi, '\n')
  text = unwrapWholeDocumentFence(text)
  text = stripLeadingCognitionJson(text)
  text = text.replace(
    /^\s*(?:chain of thought|let'?s think step by step|reasoning|self-reflect(?:ion)?|explore)\s*:\s*[\s\S]*?(?=\n---|\n# )/i,
    '',
  )
  return text.trim()
}

export function looksLikeCognitionJson(raw: string): boolean {
  const o = extractJsonObject(raw)
  if (o) {
    return Boolean(
      o.argumentSpine ||
      o.verdict ||
      o.readerQuestion ||
      o.wouldHaveToInvent ||
      o.gateWatch ||
      o.revisePlan ||
      o.takeawayClaims ||
      o.kitRisks ||
      o.gateRisks ||
      o.scores ||
      o.patterns,
    )
  }
  return COGNITION_KEYS.test(String(raw || ''))
}

function scoreExplorePattern(id: ExplorePatternId, explore: DeskExplore, primary: string): PatternScore {
  const title = EXPLORE_PATTERN_SPECS.find((p) => p.id === id)!.title
  const mark = (score: number, note: string, ok = score >= 70): PatternScore => ({ id, title, ok, score, note })
  switch (id) {
    case 'reader_question': {
      const q = explore.readerQuestion
      if (!q) return mark(0, 'missing')
      if (primary && q.toLowerCase() === primary) return mark(0, 'raw primary keyword')
      const looksQ = /\?$/.test(q) || /^(what|who|how|when|which|where|why|can|should|do)\b/i.test(q)
      return looksQ ? mark(100, q) : mark(40, 'not framed as a question')
    }
    case 'evidence_map':
      if (explore.evidenceWeHave.length >= 2) return mark(100, `${explore.evidenceWeHave.length} evidence items`)
      if (explore.evidenceWeHave.length === 1) return mark(70, 'only one evidence item')
      return mark(0, 'empty')
    case 'omit_list':
      if (explore.wouldHaveToInvent.length) return mark(100, `${explore.wouldHaveToInvent.length} omit item(s)`)
      return explore.evidenceWeHave.length ? mark(80, 'empty omit list — Discover treated as complete') : mark(40, 'no evidence and no omit list')
    case 'argument_spine': {
      const spine = explore.argumentSpine
      if (!spine) return mark(0, 'missing')
      if (primary && spine.toLowerCase() === primary) return mark(0, 'raw primary keyword')
      return isCompleteClaim(spine) ? mark(100, spine) : mark(40, 'not a complete claim')
    }
    case 'chapter_continuity': {
      const plan = explore.chapterPlan
      if (plan.length < 2) return mark(0, 'need 2+ chapters')
      const withBecause = plan.filter((c) => c.because).length
      const later = plan.slice(1)
      const withContinues = later.filter((c) => c.continues).length
      if (withBecause === plan.length && later.length && withContinues === later.length) {
        return mark(100, `${plan.length} chapters with bridges`)
      }
      if (withBecause >= 2) return mark(70, 'chapters named but continues missing')
      return mark(40, 'chapters lack because/continues')
    }
    case 'kit_risk':
      return explore.kitRisks.length ? mark(100, `${explore.kitRisks.length} kit risk(s)`) : mark(0, 'empty')
    case 'gate_watch':
      return explore.gateWatch.length ? mark(100, `${explore.gateWatch.length} gate(s)`) : mark(0, 'empty')
    case 'takeaway_claims': {
      const complete = explore.takeawayClaims.filter(isCompleteClaim)
      if (complete.length >= 3) return mark(100, `${complete.length} complete claims`)
      if (explore.takeawayClaims.length) return mark(40, 'claims are fragments or fewer than 3')
      return mark(0, 'empty')
    }
    case 'faq_gap': {
      const faqs = explore.faqThatDoesNotEchoH2s
      if (!faqs.length) return mark(0, 'empty')
      const headings = explore.chapterPlan.map((c) => c.heading)
      const echo = faqs.filter((q) => headings.some((h) => faqEchoes(q, h)))
      return echo.length ? mark(40, `FAQ restates an H2: ${echo[0]}`) : mark(100, `${faqs.length} distinct FAQ(s)`)
    }
  }
}

function honestyScore(
  hasBlockers: boolean,
  verdict: 'ship' | 'revise',
  reflection: DeskReflection | null,
  blockers: Array<{ code: string }>,
): number {
  const namedIssues = Boolean(
    reflection?.stuffing.length ||
    reflection?.kitSplices.length ||
    reflection?.guesswork.length ||
    reflection?.layout.length ||
    reflection?.gateRisks.length,
  )
  if (hasBlockers && verdict === 'ship') return 0
  if (namedIssues && verdict === 'ship') return 0
  if (hasBlockers && verdict === 'revise') {
    const named = new Set((reflection?.gateRisks || []).map((g) => g.toLowerCase()))
    const hit = blockers.some((b) => named.has(b.code.toLowerCase()) || (reflection?.gateRisks || []).some((g) => g.toLowerCase().includes(b.code.toLowerCase())))
    if (hit && reflection?.revisePlan.length) return 100
    if (reflection?.revisePlan.length) return 70
    return 40
  }
  if (!hasBlockers && verdict === 'revise') return 80
  return 100
}

function honestyNote(hasBlockers: boolean, verdict: 'ship' | 'revise', reflection: DeskReflection | null): string {
  const namedIssues = Boolean(
    reflection?.stuffing.length ||
    reflection?.kitSplices.length ||
    reflection?.guesswork.length ||
    reflection?.layout.length ||
    reflection?.gateRisks.length,
  )
  if (hasBlockers && verdict === 'ship') return 'verdict was ship while ship blockers are open'
  if (namedIssues && verdict === 'ship') return 'verdict was ship while the critique named stuffing, splices, guesswork, or layout issues'
  if (hasBlockers && verdict === 'revise' && !reflection?.revisePlan.length) return 'revise without a plan'
  if (hasBlockers) return 'revise names leftover blockers'
  if (verdict === 'revise') return 'cautious revise on a clean evaluator'
  return 'verdict matches evaluator'
}

function critiqueScore(reflection: DeskReflection | null, hasIssues: boolean): number {
  if (!reflection) return 0
  const throughlineOk = reflection.throughline.split(/\s+/).filter(Boolean).length >= 4
  if (hasIssues && !reflection.revisePlan.length) return throughlineOk ? 40 : 20
  if (!throughlineOk) return 50
  return 100
}

function critiqueNote(reflection: DeskReflection | null): string {
  if (!reflection) return 'reflection JSON missing'
  if (reflection.throughline.split(/\s+/).filter(Boolean).length < 4) return 'throughline too thin'
  if ((reflection.verdict === 'revise' || reflection.gateRisks.length) && !reflection.revisePlan.length) {
    return 'revise without a plan'
  }
  return 'critique is usable'
}

function dim(id: ReflectionDimensionId, weight: number, score: number, note: string): ReflectionDimension {
  return { id, weight, score, note }
}

function isCompleteClaim(text: string): boolean {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (t.length > 240) return false
  return t.split(/\s+/).filter(Boolean).length >= 8
}

function faqEchoes(question: string, heading: string): boolean {
  const q = new Set(question.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2))
  const h = heading.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2)
  if (!q.size || !h.length) return false
  const overlap = h.filter((t) => q.has(t)).length
  return overlap >= Math.max(3, Math.ceil(h.length * 0.7))
}

function headingContains(content: string, term: string): boolean {
  const needle = String(term || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (needle.length < 6) return false
  return String(content || '')
    .split('\n')
    .some((line) => {
      const heading = line.replace(/^#{1,3}\s+/, '')
      if (heading === line) return false
      return heading.toLowerCase().includes(needle)
    })
}

function stripLeadingCognitionJson(text: string): string {
  const t = text.trim()
  const fence = t.match(/^```json\s*([\s\S]*?)```(?:\s*|$)/i)
  if (fence && looksLikeCognitionJson(fence[1])) {
    return t.slice(fence[0].length).trim()
  }
  if (t.startsWith('{')) {
    const end = matchingBrace(t, 0)
    if (end > 0 && looksLikeCognitionJson(t.slice(0, end + 1))) {
      return t.slice(end + 1).trim()
    }
  }
  return text
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(unfenced.slice(start, end + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function matchingBrace(text: string, openAt: number): number {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = openAt; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function str(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function strs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(value.map((v) => str(v)))
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const t = v.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
  }
  return out
}
