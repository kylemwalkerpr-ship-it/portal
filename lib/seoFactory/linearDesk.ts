/**
 * Linear desk — explore, briefing, drafting, self-reflection, and rewrite
 * as ONE conversation.
 *
 * The coherent desk owns article authorship. If its sealed brief cannot be
 * validated, drafting stops. Candidate rewrites are never accepted on length
 * alone; the strongest accepted revision remains current until the shared
 * revision validator approves a replacement.
 */

import type { QualityGateResult } from './contentQualityGate'
import type { SeoFactoryAudit } from './audit'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'
import {
  markCoherentDeskCompleted,
  markCoherentDeskFailed,
  markCoherentDeskRunning,
} from './contentStudioExecutionContext'
import {
  briefFromExploreAddendum,
  deskGateCatalogPrompt,
  explorePrompt,
  mergeExploreIntoBrief,
  needsRewrite,
  parseExplore,
  parseReflection,
  reflectPrompt,
  rewriteFromReflectionPrompt,
  scoreExplore,
  scoreReflection,
  stripDeskThinking,
  type DeskExplore,
  type DeskReflection,
  type ExploreScore,
  type ReflectionScore,
} from './deskCognition'
import {
  BriefInvalidError,
  executeBriefPrompt,
  parseSealedBrief,
  sealedBriefPromptBlock,
  validateSealedBrief,
  type SealedBrief,
} from './sealedBrief'
import { acceptRewriteCandidate } from './rewriteAcceptance'
import { refineNotesForBlockers, refineNotesForWarnings } from './shipBlockers'
import { writingFamilyFor } from './writingShape'

export const LINEAR_CONVERSATION_ADDENDUM = [
  'ONE CONVERSATION. Explore, briefing, drafting, self-reflection, and rewrite are turns in this same thread — not separate jobs, not separate personalities.',
  'The ship gates AND the Review warning codes in GATE_WATCH are visible now. They do not change later. Plan them in explore so Review is a confirmation, not a fight.',
  'Spend Turns 1–2 planning the whole article (argument, bridges, formats, omit-list, evaluator codes). Do not rush to prose.',
  'Turn 1 EXPLORES Discover into structured editorial planning. Never expose private chain-of-thought; return only the requested planning fields.',
  'Turn 2 seals a brief from that exploration with zero guesswork.',
  'Turn 3 executes that brief as one article.',
  'Turn 4 SELF-REFLECTS against the same gates (JSON). An automated score — not just your verdict — decides whether Turn 5 proposes a rewrite of the same article.',
  'Do not restart the argument. Do not stuff keywords. Do not splice kit pieces. Do not leak planning JSON into the published markdown.',
].join(' ')

export type DeskTurn = { role: 'user' | 'assistant'; name: string; text: string }
export type DeskPhase = 'explore' | 'brief' | 'draft' | 'reflect' | 'review'
export type DeskReasoningEffort = 'low' | 'medium' | 'high'

export function deskPhaseAiOpts(phase: DeskPhase): {
  reasoningEffort: DeskReasoningEffort
  skipQualityContract: boolean
} {
  if (phase === 'draft' || phase === 'review') {
    return { reasoningEffort: 'low', skipQualityContract: false }
  }
  return { reasoningEffort: 'high', skipQualityContract: true }
}

export type LinearDeskAssembly = {
  title?: string
  primaryKeyword: string
  audience?: string
  contentType: string
  h2Outline?: string[]
  kwH2Map?: Record<string, string>
  sectionPlan?: Array<{ heading: string; intent?: string; format?: string; keywords?: string[] }>
  thesis?: string
  takeaways?: string[]
  faqQuestions?: string[]
  lede?: string
  sources?: string[]
  interlinks?: Array<{ label?: string; url?: string }>
  keywords?: string[]
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  shortKeywordTerms?: KeywordTerm[]
  longTailKeywordTerms?: KeywordTerm[]
  opportunity?: string
  gscBlock?: string
  writeHint?: string
  masterEngineBlock?: string
}

export type LinearDeskGenerate = (opts: {
  phase: DeskPhase
  system: string
  prompt: string
  maxTokens: number
  temperature: number
  reasoningEffort?: DeskReasoningEffort
  skipQualityContract?: boolean
}) => Promise<{ text: string; provider: string; model: string }>

export type LinearDeskEvaluate = (content: string) => QualityGateResult
export type LinearDeskAudit = (content: string) => SeoFactoryAudit

export function shouldRunLinearDesk(opts: {
  contentType?: string | null
  resumeContent?: string | null
  indexable?: boolean
}): boolean {
  if (opts.resumeContent && String(opts.resumeContent).trim()) return false
  if (opts.indexable === false) return false
  const family = writingFamilyFor(opts.contentType)
  return family === 'blog' || family === 'guide' || family === 'regional' || family === 'short'
}

export function renderDeskConversation(turns: DeskTurn[], nextName: string, nextInstruction: string): string {
  const prior = turns
    .map((t) => `### ${t.role === 'user' ? 'USER' : 'ASSISTANT'} · ${t.name}\n${t.text}`)
    .join('\n\n')
  return [
    'This is one conversation. Continue it. Do not start over.',
    prior,
    `### USER · ${nextName}`,
    nextInstruction,
  ].filter(Boolean).join('\n\n')
}

export function buildDiscoverBlock(assembly: LinearDeskAssembly): string {
  const lines = [
    'DISCOVER INTELLIGENCE — this is the only evidence you may use. If it is not here, omit it.',
    `Primary keyword: ${assembly.primaryKeyword}`,
    assembly.title ? `Working title: ${assembly.title}` : '',
    `Content type: ${assembly.contentType}`,
    assembly.audience ? `Reader: ${assembly.audience}` : '',
    assembly.requiredShortKeywords?.length
      ? `Demand short topics (cover as meaning, never paste): ${assembly.requiredShortKeywords.join(', ')}`
      : '',
    assembly.requiredLongTailKeywords?.length
      ? `Demand long-tail questions (answer in prose, never as an H2): ${assembly.requiredLongTailKeywords.join(', ')}`
      : '',
    assembly.h2Outline?.length ? `Operator outline (refine, do not discard): ${assembly.h2Outline.join(' · ')}` : '',
    assembly.sources?.length ? `Approved sources (verbatim URLs only):\n${assembly.sources.map((s) => `- ${s}`).join('\n')}` : '',
    assembly.interlinks?.length
      ? `Internal link allowlist (verbatim only):\n${assembly.interlinks.map((l) => `- ${l.label || l.url}: ${l.url}`).join('\n')}`
      : '',
    assembly.opportunity ? `Opportunity: ${assembly.opportunity}` : '',
    assembly.writeHint ? `Write hint: ${assembly.writeHint}` : '',
    assembly.gscBlock ? `GSC / demand:\n${assembly.gscBlock}` : '',
    assembly.masterEngineBlock ? `Master engine:\n${assembly.masterEngineBlock}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

export function linearDeskSystem(baseSystem: string): string {
  return [baseSystem, '', LINEAR_CONVERSATION_ADDENDUM].join('\n')
}

export function assemblyFromPipelineInput(input: {
  title?: string
  primaryKeyword: string
  audience?: string
  contentType: string
  h2Outline?: string[]
  kwH2Map?: Record<string, string>
  sectionPlan?: Array<{ heading: string; intent?: string; format?: string; keywords?: string[] }>
  thesis?: string
  takeaways?: string[]
  faqQuestions?: string[]
  lede?: string
  sources?: string[]
  interlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }> | null
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
  shortKeywordTerms?: KeywordTerm[]
  longTailKeywordTerms?: KeywordTerm[]
  opportunityAction?: string
  writeHint?: string
  masterEngineBlock?: string | null
  gscBlock?: string
}): LinearDeskAssembly {
  return {
    title: input.title,
    primaryKeyword: input.primaryKeyword,
    audience: input.audience,
    contentType: input.contentType,
    h2Outline: input.h2Outline,
    kwH2Map: input.kwH2Map,
    sectionPlan: input.sectionPlan,
    thesis: input.thesis,
    takeaways: input.takeaways,
    faqQuestions: input.faqQuestions,
    lede: input.lede,
    sources: input.sources,
    interlinks: (input.interlinks || []).flatMap((l) => {
      const url = typeof l.url === 'string' ? l.url.trim() : ''
      if (!url) return []
      return [{ label: l.label, url }]
    }),
    requiredShortKeywords: input.requiredShortKeywords,
    requiredLongTailKeywords: input.requiredLongTailKeywords,
    shortKeywordTerms: input.shortKeywordTerms,
    longTailKeywordTerms: input.longTailKeywordTerms,
    opportunity: input.opportunityAction,
    gscBlock: input.gscBlock,
    writeHint: input.writeHint,
    masterEngineBlock: input.masterEngineBlock || undefined,
  }
}

export type LinearDeskResult = {
  content: string
  brief: SealedBrief
  turns: DeskTurn[]
  provider: string
  model: string
  briefIssues: string[]
  reviewed: boolean
  explored: boolean
  reflected: boolean
  explore: DeskExplore | null
  reflection: DeskReflection | null
  exploreScore: ExploreScore | null
  reflectionScore: ReflectionScore | null
  rejectedRewrites: Array<{ reason: string; content: string }>
  /** True when the desk article should not be restitched by outline splice / throughline / denoise. */
  held: boolean
}

async function deskCall(
  generate: LinearDeskGenerate,
  opts: {
    phase: DeskPhase
    system: string
    turns: DeskTurn[]
    name: string
    instruction: string
    maxTokens: number
    temperature: number
  },
): Promise<{ text: string; provider: string; model: string }> {
  const aiOpts = deskPhaseAiOpts(opts.phase)
  try {
    return await generate({
      phase: opts.phase,
      system: opts.system,
      prompt: renderDeskConversation(opts.turns, opts.name, opts.instruction),
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      reasoningEffort: aiOpts.reasoningEffort,
      skipQualityContract: aiOpts.skipQualityContract,
    })
  } catch (error) {
    markCoherentDeskFailed(error)
    throw error
  }
}

export async function runLinearDesk(opts: {
  system: string
  assembly: LinearDeskAssembly
  minWords: number
  maxWords: number
  generate: LinearDeskGenerate
  evaluate: LinearDeskEvaluate
  /** Required for accepting rewrites. Without it candidates fail closed. */
  audit?: LinearDeskAudit
  streamDraft?: LinearDeskGenerate
  onProgress?: (ev: { phase: DeskPhase | 'discover'; message: string }) => void
}): Promise<LinearDeskResult> {
  markCoherentDeskRunning()
  const system = linearDeskSystem(opts.system)
  const progress = opts.onProgress
  const turns: DeskTurn[] = [
    { role: 'user', name: 'discover', text: buildDiscoverBlock(opts.assembly) },
  ]
  let provider = 'unknown'
  let model = 'unknown'

  progress?.({ phase: 'explore', message: 'Exploring Discover — planning the article before any prose' })
  const exploreInstruction = explorePrompt({ contentType: opts.assembly.contentType })
  turns.push({ role: 'user', name: 'explore', text: exploreInstruction })
  const exploreAi = await deskCall(opts.generate, {
    phase: 'explore', system, turns: turns.slice(0, -1), name: 'explore',
    instruction: exploreInstruction, maxTokens: 4000, temperature: 0.2,
  })
  provider = exploreAi.provider
  model = exploreAi.model
  turns.push({ role: 'assistant', name: 'explore', text: exploreAi.text })
  let explore = parseExplore(exploreAi.text)
  let exploreScore = scoreExplore(explore, {
    primaryKeyword: opts.assembly.primaryKeyword,
    contentType: opts.assembly.contentType,
  })
  if (!explore || exploreScore.score < 70 || exploreScore.missing.length) {
    const repairInstruction = [
      'EXPLORE REPAIR. Return ONLY complete JSON. Do not write the article.',
      exploreScore.missing.length ? `Missing or weak patterns: ${exploreScore.missing.join(', ')}.` : 'Explore JSON did not parse or scored below 70.',
      deskGateCatalogPrompt(opts.assembly.contentType),
      'GATE_WATCH must list those evaluator codes. Later chapters must set continues. Takeaways must be complete claims.',
    ].join('\n')
    turns.push({ role: 'user', name: 'explore-repair', text: repairInstruction })
    const repairAi = await deskCall(opts.generate, {
      phase: 'explore', system, turns: turns.slice(0, -1), name: 'explore-repair',
      instruction: repairInstruction, maxTokens: 4000, temperature: 0.15,
    })
    provider = repairAi.provider
    model = repairAi.model
    turns.push({ role: 'assistant', name: 'explore-repair', text: repairAi.text })
    explore = parseExplore(repairAi.text) || explore
    exploreScore = scoreExplore(explore, {
      primaryKeyword: opts.assembly.primaryKeyword,
      contentType: opts.assembly.contentType,
    })
  }

  progress?.({ phase: 'brief', message: 'Sealing the brief from that plan — no guesswork' })
  const briefInstruction = [
    sealedBriefPromptBlock({
      contentType: opts.assembly.contentType,
      minWords: opts.minWords,
      maxWords: opts.maxWords,
    }),
    explore ? briefFromExploreAddendum(explore, exploreScore) : deskGateCatalogPrompt(opts.assembly.contentType),
  ].filter(Boolean).join('\n\n')
  turns.push({ role: 'user', name: 'brief', text: briefInstruction })
  const briefAi = await deskCall(opts.generate, {
    phase: 'brief', system, turns: turns.slice(0, -1), name: 'brief',
    instruction: briefInstruction, maxTokens: 3500, temperature: 0.2,
  })
  provider = briefAi.provider
  model = briefAi.model
  turns.push({ role: 'assistant', name: 'brief', text: briefAi.text })

  let parsed = parseSealedBrief(briefAi.text, {
    contentType: opts.assembly.contentType,
    primaryKeyword: opts.assembly.primaryKeyword,
  })
  for (let repairPass = 0; repairPass < 2 && !parsed.ok; repairPass++) {
    const repairInstruction = `The sealed brief is ${repairPass ? 'still ' : ''}incomplete:\n${parsed.issues.map((i) => `- ${i}`).join('\n')}\nReturn ONLY corrected JSON. Put anything you would invent in unresolved. Do not write the article.`
    turns.push({ role: 'user', name: 'brief-repair', text: repairInstruction })
    const repairAi = await deskCall(opts.generate, {
      phase: 'brief', system, turns: turns.slice(0, -1), name: 'brief-repair',
      instruction: repairInstruction, maxTokens: 3500, temperature: repairPass ? 0.1 : 0.15,
    })
    provider = repairAi.provider
    model = repairAi.model
    turns.push({ role: 'assistant', name: 'brief-repair', text: repairAi.text })
    parsed = parseSealedBrief(repairAi.text, {
      contentType: opts.assembly.contentType,
      primaryKeyword: opts.assembly.primaryKeyword,
    })
  }
  if (!parsed.ok || !parsed.brief) {
    const error = new BriefInvalidError(parsed.issues.length ? parsed.issues : ['sealed brief missing after repair'])
    markCoherentDeskFailed(error)
    throw error
  }

  const brief = mergeExploreIntoBrief(parsed.brief, explore)
  const finalBriefIssues = validateSealedBrief(brief, {
    contentType: opts.assembly.contentType,
    primaryKeyword: opts.assembly.primaryKeyword,
  })
  if (finalBriefIssues.length) {
    const error = new BriefInvalidError(finalBriefIssues)
    markCoherentDeskFailed(error)
    throw error
  }

  progress?.({ phase: 'draft', message: 'Drafting the article from the validated sealed brief' })
  const draftInstruction = [
    executeBriefPrompt(brief),
    deskGateCatalogPrompt(opts.assembly.contentType),
    explore?.kitRisks.length
      ? `KIT RISKS — do not splice these as mini-guides:\n${explore.kitRisks.map((k) => `- ${k}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')
  turns.push({ role: 'user', name: 'draft', text: draftInstruction })
  const drafter = opts.streamDraft || opts.generate
  const draftAi = await deskCall(drafter, {
    phase: 'draft', system, turns: turns.slice(0, -1), name: 'draft',
    instruction: draftInstruction, maxTokens: Math.min(8000, Math.round(opts.maxWords * 1.5 + 1200)), temperature: 0.5,
  })
  provider = draftAi.provider
  model = draftAi.model
  let content = stripDeskThinking(draftAi.text)
  turns.push({ role: 'assistant', name: 'draft', text: content })

  progress?.({ phase: 'reflect', message: 'Self-reflecting against the same gates' })
  const reflectInstruction = reflectPrompt()
  turns.push({ role: 'user', name: 'reflect', text: reflectInstruction })
  const reflectAi = await deskCall(opts.generate, {
    phase: 'reflect', system, turns: turns.slice(0, -1), name: 'reflect',
    instruction: reflectInstruction, maxTokens: 1600, temperature: 0.15,
  })
  provider = reflectAi.provider
  model = reflectAi.model
  turns.push({ role: 'assistant', name: 'reflect', text: reflectAi.text })
  const reflection = parseReflection(reflectAi.text)

  let quality = opts.evaluate(content)
  let hasBlockers = Boolean(!quality.ok && quality.blockers.length)
  let reflectionScore = scoreReflection({
    content, quality, reflection, explore, unresolved: brief.unresolved,
    primaryKeyword: opts.assembly.primaryKeyword,
  })
  let reviewed = false
  let reviewPasses = 0
  const rejectedRewrites: Array<{ reason: string; content: string }> = []
  const requiredKeywords = [
    ...(opts.assembly.requiredShortKeywords || []),
    ...(opts.assembly.requiredLongTailKeywords || []),
  ]
  const keywordTerms = [
    ...(opts.assembly.shortKeywordTerms || []),
    ...(opts.assembly.longTailKeywordTerms || []),
  ]

  while (reviewPasses < 2 && needsRewrite(reflection, hasBlockers, reflectionScore, quality)) {
    reviewPasses++
    progress?.({
      phase: 'review',
      message: reviewPasses === 1
        ? 'Rewriting identified reader-facing problems — same article'
        : 'Second bounded self-correction — same accepted article lineage',
    })
    const reviewNotes = rewriteFromReflectionPrompt({
      reflection,
      score: reflectionScore,
      blockerNotes: hasBlockers ? refineNotesForBlockers(quality.blockers).join('\n') : '',
      warningNotes: quality.warnings?.length ? refineNotesForWarnings(quality.warnings).join('\n') : '',
    })
    turns.push({ role: 'user', name: 'review', text: reviewNotes })
    const reviewAi = await deskCall(opts.generate, {
      phase: 'review', system, turns: turns.slice(0, -1), name: 'review',
      instruction: reviewNotes, maxTokens: Math.min(8000, Math.round(opts.maxWords * 1.5 + 1200)), temperature: 0.3,
    })
    provider = reviewAi.provider
    model = reviewAi.model
    const next = stripDeskThinking(reviewAi.text)
    const acceptance = acceptRewriteCandidate({
      previous: content,
      next,
      previousAudit: opts.audit?.(content),
      nextAudit: opts.audit?.(next),
      requiredKeywords,
      keywordTerms,
      minWords: opts.minWords,
      maxWords: opts.maxWords,
    })
    if (!acceptance.ok) {
      rejectedRewrites.push({ reason: acceptance.reason || 'rewrite rejected', content: next })
      break
    }

    content = next
    reviewed = true
    turns.push({ role: 'assistant', name: 'review', text: next })
    quality = opts.evaluate(content)
    hasBlockers = Boolean(!quality.ok && quality.blockers.length)
    reflectionScore = scoreReflection({
      content, quality, reflection, explore, unresolved: brief.unresolved,
      primaryKeyword: opts.assembly.primaryKeyword,
    })
  }

  const held = reflectionScore.pass && !hasBlockers
  markCoherentDeskCompleted(content)

  return {
    content,
    brief,
    turns,
    provider,
    model,
    briefIssues: finalBriefIssues,
    reviewed,
    explored: Boolean(explore),
    reflected: Boolean(reflection),
    explore,
    reflection,
    exploreScore,
    reflectionScore,
    rejectedRewrites,
    held,
  }
}
