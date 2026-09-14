/**
 * Linear desk — briefing, drafting, and self-review as ONE conversation.
 *
 * Discover intelligence is the first user turn. The same system prompt
 * (ship gates + layout + voice) is visible from turn 0. The model:
 *   1. seals a no-guesswork brief
 *   2. executes that brief as one article
 *   3. self-corrects against the same gates
 *
 * Isolated hops (outline splice, Harper, throughline) stay as rescue only.
 */

import { countBodyWords, unwrapWholeDocumentFence } from './contentDepth'
import type { QualityGateResult } from './contentQualityGate'
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
  'ONE CONVERSATION. Briefing, drafting, and review are turns in this same thread — not separate jobs, not separate personalities.',
  'The ship gates in this system prompt are the only gates. They are visible now and they do not change later.',
  'Turn 1 seals a brief with zero guesswork. Turn 2 executes that brief. Turn 3 fixes leftover blockers as the same article.',
  'Do not restart the argument at review. Do not stuff keywords. Do not splice kit pieces.',
].join(' ')

export type DeskTurn = { role: 'user' | 'assistant'; name: string; text: string }

export type DeskPhase = 'brief' | 'draft' | 'review'

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

  const briefInstruction = sealedBriefPromptBlock({
    contentType: opts.assembly.contentType,
    minWords: opts.minWords,
    maxWords: opts.maxWords,
  })
  turns.push({ role: 'user', name: 'brief', text: briefInstruction })
  const briefAi = await opts.generate({
    phase: 'brief',
    system,
    prompt: renderDeskConversation(turns.slice(0, -1), 'brief', briefInstruction),
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
    const repairAi = await opts.generate({
      phase: 'brief',
      system,
      prompt: renderDeskConversation(turns.slice(0, -1), 'brief-repair', repairInstruction),
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
  const brief = parsed.brief
    ? {
        ...parsed.brief,
        outline: parsed.brief.outline.length ? parsed.brief.outline : fallback.outline,
        takeaways: parsed.brief.takeaways.length ? parsed.brief.takeaways : fallback.takeaways,
        faqQuestions: parsed.brief.faqQuestions.length ? parsed.brief.faqQuestions : fallback.faqQuestions,
        thesis: parsed.brief.thesis || fallback.thesis,
        lede: parsed.brief.lede || fallback.lede,
      }
    : fallback

  const draftInstruction = executeBriefPrompt(brief)
  turns.push({ role: 'user', name: 'draft', text: draftInstruction })
  const drafter = opts.streamDraft || opts.generate
  const draftAi = await drafter({
    phase: 'draft',
    system,
    prompt: renderDeskConversation(turns.slice(0, -1), 'draft', draftInstruction),
    maxTokens: Math.min(8000, Math.round(opts.maxWords * 1.5 + 1200)),
    temperature: 0.5,
  })
  provider = draftAi.provider
  model = draftAi.model
  let content = unwrapWholeDocumentFence(draftAi.text).trim()
  turns.push({ role: 'assistant', name: 'draft', text: content })

  const quality = opts.evaluate(content)
  let reviewed = false
  if (!quality.ok && quality.blockers.length) {
    const reviewNotes = [
      'SELF-REVIEW. You wrote the article in the previous turn from the brief you sealed. The ship gates have not changed.',
      refineNotesForBlockers(quality.blockers).join('\n'),
      refineNotesForWarnings(quality.warnings).join('\n'),
      'Return the complete corrected article. Keep one argument. Do not stuff keywords. Do not splice kit pieces.',
    ].filter(Boolean).join('\n')
    turns.push({ role: 'user', name: 'review', text: reviewNotes })
    const reviewAi = await opts.generate({
      phase: 'review',
      system,
      prompt: renderDeskConversation(turns.slice(0, -1), 'review', reviewNotes),
      maxTokens: Math.min(8000, Math.round(opts.maxWords * 1.5 + 1200)),
      temperature: 0.3,
    })
    provider = reviewAi.provider
    model = reviewAi.model
    const next = unwrapWholeDocumentFence(reviewAi.text).trim()
    const prevWords = countBodyWords(content)
    const nextWords = countBodyWords(next)
    if (nextWords >= Math.min(40, prevWords) && !(prevWords >= 800 && nextWords < prevWords * 0.4)) {
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
  }
}
