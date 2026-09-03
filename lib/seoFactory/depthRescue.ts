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
  extractH2Titles,
  mergeAppendedSections,
} from './prompts'
import { countBodyWords, openingFrontmatterClosed, trimMarkdownProseToWordBudget } from './contentDepth'
import { smoothSentenceRhythm, stripDuplicateArticleCopy } from './editorialScaffold'
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

const SIMILARITY_THRESHOLD = 0.85
const SIMILARITY_MIN_SENTENCE_LEN = 40

function tokenize(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

function termFreq(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of tokens) map.set(t, (map.get(t) || 0) + 1)
  return map
}

function cosineSimilarity(a: string, b: string): number {
  const A = termFreq(tokenize(a))
  const B = termFreq(tokenize(b))
  if (A.size === 0 || B.size === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (const [t, c] of A) {
    normA += c * c
    const cb = B.get(t) || 0
    dot += c * cb
  }
  for (const c of B.values()) normB += c * c
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function jaccardSimilarity(a: string, b: string): number {
  const A = new Set(tokenize(a))
  const B = new Set(tokenize(b))
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  return inter / (A.size + B.size - inter)
}

function extractLongSentences(text: string, minLen = SIMILARITY_MIN_SENTENCE_LEN): string[] {
  return String(text || '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ') // drop link syntax
    .replace(/[*_`#]/g, '')
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= minLen)
}

function h2Set(text: string): Set<string> {
  const set = new Set<string>()
  const re = /^##\s+(.+?)$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    set.add(m[1].trim().toLowerCase())
  }
  return set
}

function repeatedH2Count(existing: string, candidate: string): number {
  const existingH2s = h2Set(existing)
  const candidateH2s = h2Set(candidate)
  let repeats = 0
  for (const h of candidateH2s) if (existingH2s.has(h)) repeats++
  return repeats
}

/** True when the candidate expansion is just parroting existing prose or
 *  re-uses an existing H2 heading. We reject these so depth rescue pads word
 *  count with NEW substance instead of cloning paragraphs.
 *  `checkH2s` is true for append-only chunks (new sections must not repeat
 *  existing headings) and false for full-rewrites (which legitimately keep
 *  the same outline). */
function isParrot(existing: string, candidate: string, checkH2s = true): boolean {
  if (checkH2s && repeatedH2Count(existing, candidate) > 0) return true
  const existingSentences = extractLongSentences(existing)
  const candidateSentences = extractLongSentences(candidate)
  if (existingSentences.length === 0 || candidateSentences.length === 0) return false
  for (const cand of candidateSentences) {
    for (const ex of existingSentences) {
      const cos = cosineSimilarity(cand, ex)
      const jac = jaccardSimilarity(cand, ex)
      if (cos > SIMILARITY_THRESHOLD || jac > SIMILARITY_THRESHOLD) return true
    }
  }
  return false
}

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

/** Below this word count, depth rescue skips expansion entirely — the draft
 *  is too thin for the expand/append model to bridge the gap. A 36-word
 *  draft cannot be expanded to 2200; it needs full regeneration. The
 *  pipeline yields a "critically thin" progress message and moves on. */
export const CRITICALLY_THIN_WORDS = 200

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

  const maxExpand = contentType === 'marketplace_gig' ? 1 : 4
  const maxStallPasses = 3
  let stallPasses = 0
  let lastWords = countBodyWords(content)
  const rescueStart = now()
  let expandPasses = 0
  let attempts = 0
  let appendAttempts = 0

  // ── Frontmatter-only guard: an unclosed frontmatter block is ZERO prose ──
  // A stream that truncated mid-frontmatter leaves `---\ntitle: …` with no
  // closing fence. Expanding that would graft article body onto scaffolding
  // — the screenshot bug of 2026-09-02 (46-word "draft" that was all YAML
  // keys, fed to depth rescue as if it were prose). Refuse explicitly and
  // route the pipeline to regeneration.
  if (!openingFrontmatterClosed(content) && countBodyWords(content) === 0) {
    yield {
      type: 'progress',
      stage: 'refine',
      message: `Depth rescue refused: draft is frontmatter-only (opening YAML block never closed — the stream truncated before any body prose). ${countBodyWords(content)} scaffolding words are not content. Regenerate the draft.`,
    }
    yield {
      type: 'done',
      content,
      audit,
      provider,
      model,
      expandPasses: 0,
      attempts: 0,
      stallCount: 0,
      timeMs: 0,
      budgetMs: RESCUE_MAX_MS,
    }
    return
  }

  // ── Critically-thin guard: skip rescue for drafts too small to expand ──
  // A 36-word draft cannot be expanded to a 2200-word article — the model
  // would need a ~6100% word-count increase. These drafts need full
  // regeneration, not depth rescue. Save the token budget for viable cases.
  if (countBodyWords(content) < CRITICALLY_THIN_WORDS) {
    yield {
      type: 'progress',
      stage: 'refine',
      message: `Depth rescue skipped: draft is critically thin at ${countBodyWords(content)} words (below ${CRITICALLY_THIN_WORDS}-word viable floor). Regenerate the draft instead of expanding.`,
    }
    yield {
      type: 'done',
      content,
      audit,
      provider,
      model,
      expandPasses: 0,
      attempts: 0,
      stallCount: 0,
      timeMs: 0,
      budgetMs: RESCUE_MAX_MS,
    }
    return
  }

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
      const focus = APPEND_FOCUSES[appendAttempts % APPEND_FOCUSES.length]
      appendAttempts++
      const ai = await generateText({
        system:
          'You append concrete practitioner sections to an existing immigration guide. Never reproduce its front matter, H1, introduction, existing sections, JSON-LD, or disclaimer. No AI clichés. No outcome guarantees.',
        prompt: buildDepthAppendPrompt({
          primaryKeyword,
          region,
          minWords,
          maxWords,
          currentWords,
          existingH2s: extractH2Titles(content),
          draftExcerpt: content,
          h2Outline,
          focus,
        }),
        // One-pass contract: the response must carry the FULL deficit (the
        // prompt demands it), so budget tokens for the whole gap — not a
        // token that forces a stub and a second rescue round.
        maxTokens: Math.min(12000, Math.max(1200, (minWords - currentWords + 240) * 6)),
        temperature: 0.45,
        aiProvider,
      })
      provider = ai.provider
      model = ai.model
      if (isParrot(content, ai.text)) {
        yield {
          type: 'progress',
          stage: 'refine',
          message: `Depth rescue pass ${expandPasses} rejected: appended section repeats existing prose or headings`,
        }
      } else {
        let merged = mergeAppendedSections(content, ai.text)
        // Echo guard: an append that carries its own H1/frontmatter is a
        // near-full rewrite, not new sections — dedupe before counting so
        // the growth/stall checks measure ONE copy.
        const deduped = stripDuplicateArticleCopy(merged)
        if (deduped.removed) merged = deduped.content
        const rhythm = smoothSentenceRhythm(merged)
        if (rhythm.replaced > 0) merged = rhythm.content
        if (countBodyWords(merged) > currentWords) {
          // Append can overshoot the hard ceiling when the draft is already
          // deep and the model adds generously — never let depth rescue
          // push a page over maxWords (bloat regresses the audit WHOLE).
          const over = countBodyWords(merged) - maxWords
          if (over > 0) {
            const trimmed = trimMarkdownProseToWordBudget(merged, maxWords, Math.min(minWords, maxWords))
            if (trimmed.removedWords > 0) {
              merged = trimmed.content
              yield {
                type: 'progress',
                stage: 'refine',
                message: `Depth rescue pass ${expandPasses}: trimmed ${trimmed.removedWords} appended words to stay inside the ${maxWords}-word window`,
              }
            }
          }
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

  // Terminal state — never let the queue row keep a stale "expanding…" label.
  {
    const finalWords = countBodyWords(content)
    const floorMet = finalWords >= minWords
    yield {
      type: 'progress',
      stage: 'refine',
      message:
        expandPasses === 0
          ? `Depth satisfied: ${finalWords}/${minWords} words (no expansion needed)`
          : floorMet
            ? `Depth expanded to ${finalWords}/${minWords} words (${expandPasses} pass${expandPasses === 1 ? '' : 'es'})`
            : `Depth rescue stopped at ${finalWords}/${minWords} words (${expandPasses} pass${expandPasses === 1 ? '' : 'es'}) — keeping best draft`,
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
