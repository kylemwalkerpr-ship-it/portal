/**
 * Depth-rescue loop (PASS 2) extracted from the streaming pipeline so the
 * expand → append → focus-rotation → stall behavior can be regression-tested
 * with mocked providers.
 *
 * The floor is a HARD ship gate, so the rescue keeps working until it is met
 * or the budget is genuinely exhausted. Never `break` on a single provider
 * failure (the provider cascade retries internally) and never `break` on one
 * no-growth append — rotate the append focus so each pass adds NEW substance.
 * Only stall out after several consecutive no-growth passes (a model that
 * keeps returning thin output won't be brute-forced forever).
 */

import { auditContent, meetsDepthFloor, meetsShipQuality, type SeoFactoryAudit } from './audit'
import {
  buildDepthAppendPrompt,
  buildDepthExpandPrompt,
  extractH2Titles,
  mergeAppendedSections,
} from './prompts'
import { countBodyWords } from './contentDepth'
import type { ContentAiResult } from '@/lib/contentAiProvider'

/** Depth-rescue attempt stats — how many expansion rounds a draft needed, how
 *  many consecutive no-growth passes stalled it, and the wall-clock time it
 *  consumed against the budget. Emitted on the `done` event, re-broadcast as a
 *  structured pipeline `rescue` event, and persisted on the job's audit_json. */
export interface DepthRescueStats {
  expandPasses: number
  attempts: number
  /** Consecutive no-growth passes before the loop terminated (stall or finish). */
  stallCount: number
  /** Wall-clock time the rescue actually ran (ms). */
  timeMs: number
  /** The wall-clock budget the rescue is allowed (ms) — for UI budget bars. */
  budgetMs: number
}

export type DepthRescueEvent =
  | { type: 'progress'; stage: string; message: string }
  | { type: 'delta'; text: string; attempt: number }
  | {
      type: 'attempt'
      attempt: number
      score: number
      wordCount: number
      goodEnough: boolean
      draft: string
    }
  | ({ type: 'done'; content: string; audit: SeoFactoryAudit; provider: string; model: string } & DepthRescueStats)

/** Rotating append focus — each rescue pass targets a different gap so repeated
 *  appends add NEW substance instead of repeating the same sections. */
export const APPEND_FOCUSES = [
  'Step-by-step process and timelines',
  'Document checklist deep dive',
  'Common refusals / mistakes and avoidance',
  'Regional or dependent-family nuances',
  'Practical preparation checklist before you apply',
  'Costs, fees, or logistics (official schedules only)',
]

export interface DepthRescueOptions {
  content: string
  audit: SeoFactoryAudit
  title: string
  topic: string
  primaryKeyword: string
  region: string
  contentType: string
  minWords: number
  targetWords: number
  maxWords: number
  minAudit: number
  indexable: boolean
  ownershipBlockers: string[]
  h2Outline?: string[]
  aiProvider?: string
  /** Text generator to drive expansion/append passes. Injected so tests can
   *  mock provider behavior (grow, stall, throw) deterministically. */
  generateText: (opts: {
    system: string
    prompt: string
    maxTokens: number
    temperature: number
    aiProvider?: string
  }) => Promise<ContentAiResult>
  /** Factory system prompt (tone/voice/format guardrails). Passed through to
   *  the full-rewrite expand pass so expansions keep the same guardrails the
   *  pipeline's own generation uses. Defaults to '' in unit tests. */
  system?: string
  /** Wall clock for the rescue time budget. Injected so tests can advance time. */
  now?: () => number
}

/** Wall-clock guard: each AI pass can take 30–120s (provider cascade), and the
 *  route caps the stream at ~300s. If the rescue has run too long, save the
 *  best draft so far instead of letting the whole stream time out. */
export const RESCUE_MAX_MS = 220000

export async function* runDepthRescue(
  opts: DepthRescueOptions,
): AsyncGenerator<DepthRescueEvent> {
  const {
    content: initialContent,
    audit: initialAudit,
    title,
    topic,
    primaryKeyword,
    region,
    contentType,
    minWords,
    targetWords,
    maxWords,
    minAudit,
    h2Outline,
    aiProvider,
    generateText,
    system = '',
    now = Date.now,
  } = opts

  let content = initialContent
  let audit = initialAudit
  // provider/model reflect the last successful generate (matching the
  // pipeline's default state before PASS 2 when nothing has been generated).
  let provider = 'unknown'
  let model = 'unknown'

  const maxExpand = contentType === 'marketplace_gig' ? 1 : 10
  const maxStallPasses = 3
  let stallPasses = 0
  let lastWords = countBodyWords(content)
  const rescueStart = now()
  let expandPasses = 0
  let attempts = 0

  while (countBodyWords(content) < minWords && expandPasses < maxExpand) {
    if (now() - rescueStart > RESCUE_MAX_MS) {
      yield {
        type: 'progress',
        stage: 'refine',
        message: `Depth rescue time budget reached at ${countBodyWords(content)}/${minWords} words — keeping best draft`,
      }
      break
    }
    expandPasses++
    attempts++
    const currentWords = countBodyWords(content)
    yield {
      type: 'progress',
      stage: 'refine',
      message: `Depth rescue ${expandPasses}/${maxExpand} · ${currentWords}/${minWords} words (${Math.max(0, minWords - currentWords)} to add)…`,
    }
    try {
      if (expandPasses === 1) {
        const ai = await generateText({
          system,
          prompt: buildDepthExpandPrompt({
            title,
            topic,
            primaryKeyword,
            region,
            contentType,
            minWords,
            targetWords,
            maxWords,
            currentWords,
            draft: content,
            h2Outline,
          }),
          // Full rewrite: the model must reproduce the existing article (~5
          // tokens per word) AND add new substance. Never cap below 8000
          // tokens — a 2000-word draft needs ~10k tokens just to reproduce.
          // Cap at 24576 to keep the stream within Cloudflare Worker limits.
          // Marketplace gigs stay concise — cap at 4000 tokens (their
          // maxExpand is also 1, so they get one tight rewrite).
          maxTokens: contentType === 'marketplace_gig'
            ? 4000
            : Math.min(24576, Math.max(8000, currentWords * 5 + (minWords - currentWords) * 6)),
          temperature: 0.42,
          aiProvider,
        })
        provider = ai.provider
        model = ai.model
        if (countBodyWords(ai.text) > currentWords) {
          content = ai.text
          yield { type: 'delta', text: '\n\n<!-- depth expand applied -->\n\n', attempt: attempts }
          yield { type: 'delta', text: content.slice(0, 500), attempt: attempts }
        }
      } else {
        const focus = APPEND_FOCUSES[(expandPasses - 2) % APPEND_FOCUSES.length]
        const ai = await generateText({
          system:
            'You expand immigration educational guides with concrete practitioner sections. No front matter. No JSON-LD. No AI clichés. No outcome guarantees.',
          prompt: buildDepthAppendPrompt({
            primaryKeyword,
            region,
            minWords,
            currentWords,
            existingH2s: extractH2Titles(content),
            draftExcerpt: content,
            h2Outline,
            focus,
          }),
          // Append-only: the model writes NEW sections, not a full rewrite.
          // The prompt asks for 700+ words (≈2,800 tokens). Floor at 3,000
          // tokens so a 72-word deficit still gets a full section written.
          // Scale up to 8,192 for larger gaps.
          maxTokens: Math.min(8192, Math.max(3000, (minWords - currentWords) * 8 + 2000)),
          temperature: 0.45,
          aiProvider,
        })
        provider = ai.provider
        model = ai.model
        const merged = mergeAppendedSections(content, ai.text)
        if (countBodyWords(merged) > currentWords) {
          content = merged
        }
      }
    } catch (e) {
      // Provider cascade already retried internally; keep the rescue alive.
      yield {
        type: 'progress',
        stage: 'refine',
        message: `Depth rescue pass ${expandPasses} failed (${e instanceof Error ? e.message.slice(0, 140) : 'error'}) — continuing with a different section focus`,
      }
    }
    audit = auditContent({
      content,
      contentType,
      primaryKeyword,
      indexable: opts.indexable,
      ownershipBlockers: opts.ownershipBlockers,
    })
    yield {
      type: 'attempt',
      attempt: attempts,
      score: audit.score,
      wordCount: audit.wordCount,
      goodEnough: meetsShipQuality(audit) && audit.score >= minAudit,
      draft: content,
    }
    if (meetsDepthFloor(audit) && meetsShipQuality(audit) && audit.score >= minAudit) break
    const grew = countBodyWords(content) > lastWords
    lastWords = countBodyWords(content)
    if (!grew) stallPasses++
    else stallPasses = 0
    if (stallPasses >= maxStallPasses) {
      yield {
        type: 'progress',
        stage: 'refine',
        message: `Depth rescue stalled at ${lastWords}/${minWords} after ${expandPasses} passes — moving on`,
      }
      break
    }
  }

  yield {
    type: 'done',
    content,
    audit,
    provider,
    model,
    expandPasses,
    attempts,
    stallCount: stallPasses,
    timeMs: now() - rescueStart,
    budgetMs: RESCUE_MAX_MS,
  }
}
