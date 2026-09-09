import { countBodyWords, unwrapWholeDocumentFence } from './contentDepth'
import { normalizeEditorDocument } from './formatContract'

/**
 * The rich document editor becomes unstable on very large strings. More
 * importantly, a huge raw payload with almost no countable prose is almost
 * always model/editor chrome (a fenced whole response, duplicated metadata,
 * schema, or a failed-provider payload), not a legitimate long article.
 */
export const DRAFT_RENDERER_SAFE_CHARS = 50_000
export const DRAFT_HARD_MAX_CHARS = 80_000
export const DRAFT_MIN_REVIEW_WORDS = 40

export type DraftIntegrity = {
  original: string
  content: string
  rawChars: number
  chars: number
  rawBodyWords: number
  bodyWords: number
  changed: boolean
  repairs: string[]
  recovered: boolean
  rendererSafe: boolean
  pathological: boolean
  hardOversize: boolean
}

/**
 * Normalize ONLY mechanical/editor leakage. This never asks an LLM to invent
 * prose and never converts a thin draft into a pass. It is safe to use before
 * an audit/fix because the real quality gates still run on the returned body.
 */
export function inspectDraftIntegrity(raw: string): DraftIntegrity {
  const original = String(raw || '')
  const rawBodyWords = countBodyWords(original)

  const unwrapped = unwrapWholeDocumentFence(original)
  const normalized = normalizeEditorDocument(unwrapped)
  const content = normalized.content
  const bodyWords = countBodyWords(content)
  const changed = content !== original
  const rawChars = original.length
  const chars = content.length

  // Recovery is intentionally narrow: a suspicious/uncountable input became
  // real prose after deterministic normalization and now fits the browser.
  const recovered = changed
    && (rawChars > DRAFT_RENDERER_SAFE_CHARS || rawBodyWords < DRAFT_MIN_REVIEW_WORDS)
    && bodyWords >= DRAFT_MIN_REVIEW_WORDS
    && chars <= DRAFT_RENDERER_SAFE_CHARS

  const pathological = rawChars > DRAFT_RENDERER_SAFE_CHARS
    && bodyWords < DRAFT_MIN_REVIEW_WORDS
  const hardOversize = chars > DRAFT_HARD_MAX_CHARS

  return {
    original,
    content,
    rawChars,
    chars,
    rawBodyWords,
    bodyWords,
    changed,
    repairs: [
      ...(unwrapped !== original ? ['whole_document_fence_unwrapped'] : []),
      ...normalized.fixed,
    ],
    recovered,
    rendererSafe: chars <= DRAFT_RENDERER_SAFE_CHARS,
    pathological,
    hardOversize,
  }
}

/** Use a recovered body only when normalization proves it contains real prose. */
export function recoverDraftContent(raw: string): string {
  const integrity = inspectDraftIntegrity(raw)
  return integrity.recovered ? integrity.content : String(raw || '')
}

/**
 * Persistence guard. A normal short work-in-progress is valid; a 60k-char
 * payload with 19 body words is not. Rejecting the latter prevents one bad
 * model/provider response from becoming the new autosave source of truth.
 */
export function draftPersistenceError(raw: string): string | null {
  const integrity = inspectDraftIntegrity(raw)
  if (integrity.hardOversize) {
    return `Draft integrity check refused ${integrity.chars.toLocaleString()} normalized characters (maximum ${DRAFT_HARD_MAX_CHARS.toLocaleString()}). Audit/Fix or restore a prior draft instead of autosaving this payload.`
  }
  if (integrity.pathological && !integrity.recovered) {
    return `Draft integrity check found ${integrity.rawChars.toLocaleString()} characters but only ${integrity.bodyWords} countable body words after normalization. The payload looks like fenced metadata/schema/provider output, so it was not persisted over the last good draft.`
  }
  return null
}
