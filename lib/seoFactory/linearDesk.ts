/**
 * Linear desk — explore, briefing, drafting, self-reflection, and rewrite
 * as ONE conversation.
 *
 * Discover intelligence is the first user turn. The same system prompt
 * (ship gates + layout + voice) is visible from turn 0. The model:
 *   1. explores Discover (visible chain of thought — JSON, never the article)
 *   2. seals a no-guesswork brief from that exploration
 *   3. executes that brief as one article
 *   4. self-reflects against the same gates (JSON)
 *   5. rewrites only when reflection says revise or the evaluator still blocks
 *
 * Isolated hops (outline splice, Harper, throughline) stay as rescue only.
 */

import { countBodyWords } from './contentDepth'
import type { QualityGateResult } from './contentQualityGate'
import {
  briefFromExploreAddendum,
  explorePrompt,
  mergeExploreIntoBrief,
  needsRewrite,
  parseExplore,
  parseReflection,
  reflectPrompt,
  rewriteFromReflectionPrompt,
  stripDeskThinking,
  type DeskExplore,
  type DeskReflection,
} from './deskCognition'
import {
  executeBriefPrompt,
  parseSealedBrief,
  sealBriefFromAssembly,
  sealedBriefPromptBlock,
  type SealedBrief,
} from './sealedBrief'
import { refineNotesForBlockers, refineNotesForWarnings } from './shipBlockers'
import { writingFamilyFor } from './writingShape'

export const LINEAR_CONVERSATION_ADDENDUM = [
  'ONE CONVERSATION. Explore, briefing, drafting, self-reflection, and rewrite are turns in this same thread — not separate jobs, not separate personalities.',
  'The ship gates in this system prompt are the only gates. They are visible now and they do not change later.',
  'Turn 1 EXPLORES Discover as JSON chain of thought (what we know, what we would invent, the argument spine). Thinking is never the article.',
  'Turn 2 seals a brief from that exploration with zero guesswork.',
  'Turn 3 executes that brief as one article.',
  'Turn 4 SELF-REFLECTS against the same gates (JSON). If revise, Turn 5 rewrites the same article.',
  'Do not restart the argument. Do not stuff keywords. Do not splice kit pieces. Do not leak chain-of-thought into the published markdown.',
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
  return { reasoningEffort: 'medium', skipQualityContract: true }
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
    interlinks: (input.interlinks || [])
      .map((l) => ({ label: l.label, url: l.url }))
      .filter((l): l is { label?: string; url: string } => Boolean(l.url)),
    requiredShortKeywords: input.requiredShortKeywords,
    requiredLongTailKeywords: input.requiredLongTailKeywords,
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
  return generate({
    phase: opts.phase,
    system: opts.system,
    prompt: renderDeskConversation(opts.turns, opts.name, opts.instruction),
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    reasoningEffort: aiOpts.reasoningEffort,
    skipQualityContract: aiOpts.skipQualityContract,
  })
}

function acceptRewrite(prev: string, next: string): boolean {
  const prevWords = countBodyWords(prev)
  const nextWords = countBodyWords(next)
  return nextWords >= Math.min(40, prevWords) && !(prevWords >= 800 && nextWords < prevWords * 0.4)
}

export async function runLinearDesk(opts: {
  system: string
  assembly: LinearDeskAssembly
  minWords: number
  maxWords: number
  generate: LinearDeskGenerate
  evaluate: LinearDeskEvaluate
  streamDraft?: LinearDeskGenerate
}): Promise<LinearDeskResult> {
  const system = linearDeskSystem(opts.system)
  const turns: DeskTurn[] = [
    { role: 'user', name: 'discover', text: buildDiscoverBlock(opts.assembly) },
  ]
  let provider = 'unknown'
  let model = 'unknown'

  const exploreInstruction = explorePrompt()
  turns.push({ role: 'user', name: 'explore', text: exploreInstruction })
  const exploreAi = await deskCall(opts.generate, {
    phase: 'explore',
    system,
    turns: turns.slice(0, -1),
    name: 'explore',
    instruction: exploreInstruction,
    maxTokens: 2000,
    temperature: 0.2,
  })
  provider = exploreAi.provider
  model = exploreAi.model
  turns.push({ role: 'assistant', name: 'explore', text: exploreAi.text })
  const explore = parseExplore(exploreAi.text)

  const briefInstruction = [
    sealedBriefPromptBlock({
      contentType: opts.assembly.contentType,
      minWords: opts.minWords,
      maxWords: opts.maxWords,
    }),
    explore ? briefFromExploreAddendum(explore) : '',
  ].filter(Boolean).join('\n\n')
  turns.push({ role: 'user', name: 'brief', text: briefInstruction })
  const briefAi = await deskCall(opts.generate, {
    phase: 'brief',
    system,
    turns: turns.slice(0, -1),
    name: 'brief',
    instruction: briefInstruction,
    maxTokens: 2500,
    temperature: 0.2,
  })
  provider = briefAi.provider
  model = briefAi.model
  turns.push({ role: 'assistant', name: 'brief', text: briefAi.text })

  let parsed = parseSealedBrief(briefAi.text, {
    contentType: opts.assembly.contentType,
    primaryKeyword: opts.assembly.primaryKeyword,
  })
  if (!parsed.ok) {
    const repairInstruction = `The sealed brief is incomplete:\n${parsed.issues.map((i) => `- ${i}`).join('\n')}\nReturn ONLY corrected JSON. Put anything you would invent in unresolved. Do not write the article.`
    turns.push({ role: 'user', name: 'brief-repair', text: repairInstruction })
    const repairAi = await deskCall(opts.generate, {
      phase: 'brief',
      system,
      turns: turns.slice(0, -1),
      name: 'brief-repair',
      instruction: repairInstruction,
      maxTokens: 2500,
      temperature: 0.15,
    })
    provider = repairAi.provider
    model = repairAi.model
    turns.push({ role: 'assistant', name: 'brief-repair', text: repairAi.text })
    parsed = parseSealedBrief(repairAi.text, {
      contentType: opts.assembly.contentType,
      primaryKeyword: opts.assembly.primaryKeyword,
    })
  }

  const fallback = sealBriefFromAssembly(opts.assembly)
  const merged = parsed.brief
    ? {
        ...parsed.brief,
        outline: parsed.brief.outline.length ? parsed.brief.outline : fallback.outline,
        takeaways: parsed.brief.takeaways.length ? parsed.brief.takeaways : fallback.takeaways,
        faqQuestions: parsed.brief.faqQuestions.length ? parsed.brief.faqQuestions : fallback.faqQuestions,
        thesis: parsed.brief.thesis || fallback.thesis,
        lede: parsed.brief.lede || fallback.lede,
      }
    : fallback
  const brief = mergeExploreIntoBrief(merged, explore)

  const draftInstruction = executeBriefPrompt(brief)
  turns.push({ role: 'user', name: 'draft', text: draftInstruction })
  const drafter = opts.streamDraft || opts.generate
  const draftAi = await deskCall(drafter, {
    phase: 'draft',
    system,
    turns: turns.slice(0, -1),
    name: 'draft',
    instruction: draftInstruction,
    maxTokens: Math.min(8000, Math.round(opts.maxWords * 1.5 + 1200)),
    temperature: 0.5,
  })
  provider = draftAi.provider
  model = draftAi.model
  let content = stripDeskThinking(draftAi.text)
  turns.push({ role: 'assistant', name: 'draft', text: content })

  const reflectInstruction = reflectPrompt()
  turns.push({ role: 'user', name: 'reflect', text: reflectInstruction })
  const reflectAi = await deskCall(opts.generate, {
    phase: 'reflect',
    system,
    turns: turns.slice(0, -1),
    name: 'reflect',
    instruction: reflectInstruction,
    maxTokens: 1600,
    temperature: 0.15,
  })
  provider = reflectAi.provider
  model = reflectAi.model
  turns.push({ role: 'assistant', name: 'reflect', text: reflectAi.text })
  const reflection = parseReflection(reflectAi.text)

  const quality = opts.evaluate(content)
  const hasBlockers = Boolean(!quality.ok && quality.blockers.length)
  let reviewed = false
  if (needsRewrite(reflection, hasBlockers)) {
    const reviewNotes = rewriteFromReflectionPrompt({
      reflection,
      blockerNotes: hasBlockers ? refineNotesForBlockers(quality.blockers).join('\n') : '',
      warningNotes: quality.warnings?.length ? refineNotesForWarnings(quality.warnings).join('\n') : '',
    })
    turns.push({ role: 'user', name: 'review', text: reviewNotes })
    const reviewAi = await deskCall(opts.generate, {
      phase: 'review',
      system,
      turns: turns.slice(0, -1),
      name: 'review',
      instruction: reviewNotes,
      maxTokens: Math.min(8000, Math.round(opts.maxWords * 1.5 + 1200)),
      temperature: 0.3,
    })
    provider = reviewAi.provider
    model = reviewAi.model
    const next = stripDeskThinking(reviewAi.text)
    if (acceptRewrite(content, next)) {
      content = next
      reviewed = true
      turns.push({ role: 'assistant', name: 'review', text: next })
    }
  }

  return {
    content,
    brief,
    turns,
    provider,
    model,
    briefIssues: parsed.issues,
    reviewed,
    explored: Boolean(explore),
    reflected: Boolean(reflection),
    explore,
    reflection,
  }
}
