/**
 * Shared rewrite acceptance. Length alone is not enough.
 * Missing audit context fails closed.
 */

import { countBodyWords } from './contentDepth'
import { validateRevisionQuality, type RevisionValidation } from './revisionQuality'
import type { SeoFactoryAudit } from './audit'
import type { KeywordTerm } from '@/lib/seoEngine/keywordTerms'

const QUALIFICATION = /\b(unless|except|only if|does not|cannot|not eligible|subject to|provided that|except when|except where)\b/i
const AMOUNT = /\b(?:\$?\d[\d,]*(?:\.\d+)?|\d+\s?(?:usd|cad|gbp|aud|days?|weeks?|months?|years?|hours?))\b/gi
const DATE = /\b(?:20\d{2}-\d{2}-\d{2}|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*20\d{2})?|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+20\d{2})\b/gi

export function acceptRewriteCandidate(input: {
  previous: string
  next: string
  previousAudit?: SeoFactoryAudit | null
  nextAudit?: SeoFactoryAudit | null
  requiredKeywords?: string[]
  keywordTerms?: KeywordTerm[]
  minWords?: number
  maxWords?: number
}): RevisionValidation {
  if (!input.previousAudit || !input.nextAudit) {
    return { ok: false, reason: 'rewrite rejected: audit context omitted' }
  }
  const prevWords = countBodyWords(input.previous)
  const nextWords = countBodyWords(input.next)
  if (nextWords < 40) return { ok: false, reason: 'rewrite shorter than 40 words' }
  if (input.minWords != null && nextWords < input.minWords) {
    return { ok: false, reason: `rewrite below contract word bound (${nextWords} < ${input.minWords})` }
  }
  if (input.maxWords != null && nextWords > input.maxWords) {
    return { ok: false, reason: `rewrite exceeded contract word bound (${nextWords} > ${input.maxWords})` }
  }
  if (prevWords >= 800 && nextWords < prevWords * 0.7) {
    return { ok: false, reason: 'rewrite dropped more than 30% of an established article' }
  }

  const lostQualification = lostQualificationClauses(input.previous, input.next)
  if (lostQualification) {
    return { ok: false, reason: `rewrite removed a qualification or exception: ${lostQualification}` }
  }

  const lostAmount = lostValues(input.previous, input.next, AMOUNT)
  if (lostAmount) return { ok: false, reason: `rewrite changed or dropped an amount/duration: ${lostAmount}` }

  const lostDate = lostValues(input.previous, input.next, DATE)
  if (lostDate) return { ok: false, reason: `rewrite changed or dropped a date: ${lostDate}` }

  const lostCitation = lostCitations(input.previous, input.next)
  if (lostCitation) return { ok: false, reason: `rewrite dropped a required citation: ${lostCitation}` }

  const lostHeading = lostHeadings(input.previous, input.next)
  if (lostHeading) return { ok: false, reason: `rewrite dropped a required heading: ${lostHeading}` }

  if (unrelatedReplacement(input.previous, input.next)) {
    return { ok: false, reason: 'rewrite is an unrelated replacement of the accepted article' }
  }

  return validateRevisionQuality(input.previousAudit, input.nextAudit, {
    original: input.previous,
    revised: input.next,
    requiredKeywords: input.requiredKeywords || [],
    keywordTerms: input.keywordTerms,
  })
}

export function lostQualificationClauses(previous: string, next: string): string | null {
  const prevClauses = sentences(previous).filter((s) => QUALIFICATION.test(s))
  if (!prevClauses.length) return null
  const nextNorm = normalize(next)
  for (const clause of prevClauses) {
    const tokens = significantTokens(clause)
    const kept = tokens.filter((t) => nextNorm.includes(t)).length
    if (tokens.length >= 3 && kept < Math.ceil(tokens.length * 0.6)) return clause.slice(0, 140)
    if (!QUALIFICATION.test(next)) return clause.slice(0, 140)
  }
  return null
}

function lostValues(previous: string, next: string, pattern: RegExp): string | null {
  pattern.lastIndex = 0
  const prev = new Set((previous.match(pattern) || []).map((v) => v.toLowerCase()))
  pattern.lastIndex = 0
  if (!prev.size) return null
  const nextSet = new Set((next.match(pattern) || []).map((v) => v.toLowerCase()))
  for (const value of prev) {
    if (!nextSet.has(value)) return value
  }
  return null
}

function lostCitations(previous: string, next: string): string | null {
  const prevLinks = previous.match(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g) || []
  if (!prevLinks.length) return null
  for (const link of prevLinks) {
    const href = link.match(/\((https?:\/\/[^)]+)\)/)?.[1]
    if (href && !next.includes(href)) return href
  }
  return null
}

function lostHeadings(previous: string, next: string): string | null {
  const prev = [...previous.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase())
  if (!prev.length) return null
  const nextSet = new Set([...next.matchAll(/^#{2,3}\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase()))
  for (const heading of prev) {
    if (!nextSet.has(heading)) return heading
  }
  return null
}

function unrelatedReplacement(previous: string, next: string): boolean {
  const prevTokens = new Set(significantTokens(previous))
  const nextTokens = significantTokens(next)
  if (prevTokens.size < 12 || nextTokens.length < 12) return false
  const overlap = nextTokens.filter((t) => prevTokens.has(t)).length
  return overlap / Math.min(prevTokens.size, nextTokens.length) < 0.18
}

function sentences(text: string): string[] {
  return String(text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
}

function normalize(text: string): string {
  return String(text || '').toLowerCase()
}

function significantTokens(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 3)
}
