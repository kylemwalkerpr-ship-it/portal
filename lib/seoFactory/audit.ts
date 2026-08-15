/**
 * SEO Factory audit scorecard — Ahrefs-lite, estate-specific.
 * Word-count floors come from contentDepth (Google helpful-content / anti-thin).
 */

import {
  checkContentDepth,
  countBodyWords,
  minWordsForType,
  targetWordsForType,
} from './contentDepth'
import { evaluateContentQuality, DISCLAIMER_RE } from './contentQualityGate'
import { countEstateLinks } from './linkAudit'

export interface AuditFinding {
  code: string
  severity: 'blocker' | 'warning' | 'pass'
  message: string
  fix?: string
}

export interface SeoFactoryAudit {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  blockers: AuditFinding[]
  warnings: AuditFinding[]
  passes: AuditFinding[]
  indexableRecommended: boolean
  llmsRecommended: boolean
  wordCount: number
  primaryKeyword?: string
  /** 0–100 human-voice score from quality gate */
  humanScore?: number
  qualitySummary?: string
}

function grade(score: number): SeoFactoryAudit['grade'] {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 55) return 'D'
  return 'F'
}

/**
 * Point weight of every audit check — the single source of truth for scoring.
 * Every point the scorecard awards MUST come from this table (see the
 * `add(…, AUDIT_POINT_WEIGHTS.x)` calls below). The score denominator is
 * AUDIT_MAX_POINTS, and a regression test asserts the two stay in sync, so
 * adding or removing a check forces an explicit update instead of silently
 * drifting the score ceiling.
 */
export const AUDIT_POINT_WEIGHTS = {
  wordCount: 2,
  title: 2,
  metaDescription: 1,
  h2Structure: 1,
  keyword: 2,
  citations: 2,
  schemaArticle: 1,
  schemaFaq: 1,
  internalLinks: 1,
  aiAnswerBlock: 1,
  disclaimer: 1,
  robots: 1,
  humanVoice: 2,
} as const

/**
 * Score denominator. MUST equal the sum of AUDIT_POINT_WEIGHTS — a regression
 * test asserts exactly that, so this literal can never drift from the real
 * total of awarded points. (2026-08-14: was 20 while the checks only awarded
 * 18, which capped a flawless article at 18/20 = 90%.)
 */
export const AUDIT_MAX_POINTS = 18

function extractFrontMatter(content: string): Record<string, string> {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

export function auditContent(opts: {
  content: string
  contentType: string
  primaryKeyword?: string
  indexable?: boolean
  ownershipBlockers?: string[]
  requiredShortKeywords?: string[]
  requiredLongTailKeywords?: string[]
}): SeoFactoryAudit {
  const content = opts.content || ''
  const fm = extractFrontMatter(content)
  const body = content.replace(/^---[\s\S]*?---\r?\n/, '')
  // Prose-only count (excludes JSON-LD / fences) — Google-aligned depth
  const words = countBodyWords(content)
  const primary = (opts.primaryKeyword || fm.primaryKeyword || fm.title || '').toLowerCase()
  const wantIndexable = opts.indexable !== false

  const blockers: AuditFinding[] = []
  const warnings: AuditFinding[] = []
  const passes: AuditFinding[] = []
  let points = 0
  // Score denominator — locked to the weight table by a regression test.
  const max = AUDIT_MAX_POINTS

  const add = (ok: boolean, finding: AuditFinding, pts: number) => {
    if (ok) {
      passes.push({ ...finding, severity: 'pass' })
      points += pts
    } else if (finding.severity === 'blocker') {
      blockers.push(finding)
    } else {
      warnings.push(finding)
    }
  }

  // Ownership blockers from resolver
  for (const b of opts.ownershipBlockers || []) {
    blockers.push({
      code: 'ownership',
      severity: 'blocker',
      message: b,
      fix: /blocked_on_supply/i.test(b)
        ? 'This keyword resolves to the marketplace (market), and the ownership registry blocks it until the category has real inventory (≥3 gigs). Clear it by: (1) publishing gigs in that category in the marketplace, or (2) changing the content type / keyword so ownership routes to a shippable host (legal/regional).'
        : /301|merge/i.test(b)
          ? 'Expand the existing strategy URL instead of creating a sibling page. Update the job target to that canonical, or pick a different keyword.'
          : 'Change keyword, content type, or expand the existing owner URL',
    })
  }

  // Word count — HARD blocker under Google depth floor (unattended ships)
  const minWords = minWordsForType(opts.contentType)
  const targetWords = targetWordsForType(opts.contentType)
  const depth = checkContentDepth({
    content,
    contentType: opts.contentType,
    indexable: wantIndexable,
  })
  if (depth.thin || depth.belowMin) {
    blockers.push({
      code: depth.thin ? 'thin_content' : 'word_count',
      severity: 'blocker',
      message: depth.errors[0] || `Word count ${words} < min ${minWords}`,
      fix: `Expand body prose to ≥${minWords} words (target ~${targetWords}): procedures, document checklists, eligibility, risks, timelines, 4–6 FAQs with full answers. No fluff padding.`,
    })
  } else if (words < targetWords) {
    warnings.push({
      code: 'word_count_target',
      severity: 'warning',
      message: `Word count ${words} meets floor ${minWords} but under target ${targetWords}`,
      fix: `Add another H2 section or expand FAQs toward ~${targetWords} words for competitive depth`,
    })
    // Partial credit for meeting the floor (not the full wordCount weight)
    points += Math.floor(AUDIT_POINT_WEIGHTS.wordCount / 2)
  } else {
    add(true, {
      code: 'word_count',
      severity: 'pass',
      message: `Word count ${words} (min ${minWords}, target ${targetWords})`,
    }, AUDIT_POINT_WEIGHTS.wordCount)
  }

  // Title
  const title = fm.title || body.match(/^#\s+(.+)$/m)?.[1] || ''
  add(title.length > 10 && title.length <= 70, {
    code: 'title',
    severity: !title ? 'blocker' : 'warning',
    message: title ? `Title length ${title.length}: "${title.slice(0, 60)}"` : 'Missing title',
    fix: 'Set YAML title 30–60 chars with primary keyword + year/place when relevant',
  }, AUDIT_POINT_WEIGHTS.title)

  // Meta description
  const desc = fm.description || fm.metaDescription || ''
  add(desc.length >= 120 && desc.length <= 170, {
    code: 'meta_description',
    severity: 'warning',
    message: desc ? `Meta description length ${desc.length}` : 'Missing meta description in front matter',
    fix: 'Add description: 140–160 characters with a concrete benefit',
  }, AUDIT_POINT_WEIGHTS.metaDescription)

  // H2 structure
  const h2s = (body.match(/^##\s+/gm) || []).length
  add(h2s >= 4, {
    code: 'h2_structure',
    severity: 'warning',
    message: `H2 count ${h2s} (want ≥4)`,
    fix: 'Add clear H2 sections covering procedure, documents, risks, FAQ',
  }, AUDIT_POINT_WEIGHTS.h2Structure)

  // Keyword usage
  if (primary) {
    const inTitle = title.toLowerCase().includes(primary.slice(0, Math.min(primary.length, 20)))
    const inBody = body.toLowerCase().includes(primary.split(' ')[0] || primary)
    add(inTitle || inBody, {
      code: 'keyword',
      severity: 'warning',
      message: inTitle ? 'Primary keyword appears in title' : 'Primary keyword weak/missing in title',
      fix: `Include "${opts.primaryKeyword}" naturally in title and first H2`,
    }, AUDIT_POINT_WEIGHTS.keyword)
  } else {
    warnings.push({
      code: 'keyword',
      severity: 'warning',
      message: 'No primary keyword provided',
      fix: 'Pass primary_keyword from GSC brief',
    })
  }

  // Citations
  const hasGov = /\.gov|\.edu|uscis\.gov|canada\.ca|homeaffairs\.gov|gov\.uk|ircc/i.test(body)
  add(hasGov, {
    code: 'citations',
    severity: wantIndexable ? 'blocker' : 'warning',
    message: hasGov ? 'Official .gov/.edu citations present' : 'Missing official authority citations',
    fix: 'Cite USCIS, IRCC, UKVI, or Home Affairs with live URLs',
  }, AUDIT_POINT_WEIGHTS.citations)

  // Schema
  const hasArticle = /"@type"\s*:\s*"Article"/.test(body)
  const hasFaq = /"@type"\s*:\s*"FAQPage"/.test(body)
  add(hasArticle, {
    code: 'schema_article',
    severity: 'warning',
    message: hasArticle ? 'Article JSON-LD present' : 'Missing Article JSON-LD',
    fix: 'Add Article schema in application/ld+json',
  }, AUDIT_POINT_WEIGHTS.schemaArticle)
  add(hasFaq || opts.contentType === 'marketplace_gig', {
    code: 'schema_faq',
    severity: 'warning',
    message: hasFaq ? 'FAQPage JSON-LD present' : 'Missing FAQPage JSON-LD',
    fix: 'Add 4–6 FAQs with FAQPage schema for AI overviews',
  }, AUDIT_POINT_WEIGHTS.schemaFaq)

  // Internal links — shared estate counter (legal. / portal. / any estate
  // subdomain / caseworks.com / relative paths). Future estate hosts are
  // counted automatically via the estate-root regex.
  const internalLinks = countEstateLinks(body)
  add(internalLinks >= 2, {
    code: 'internal_links',
    severity: 'warning',
    message: `Internal/estate links ~${internalLinks}`,
    fix: 'Link to hub + 1–2 related legal/regional pages',
  }, AUDIT_POINT_WEIGHTS.internalLinks)

  // AI / LLM readiness
  const hasTldr = /tldr|in 60 seconds|quick answer|key takeaways/i.test(body)
  add(hasTldr, {
    code: 'ai_answer_block',
    severity: 'warning',
    message: hasTldr ? 'Answer/TL;DR block present' : 'Missing TL;DR / quick-answer block',
    fix: 'Add a concise "In 60 seconds" list for AI Overviews and llms.txt',
  }, AUDIT_POINT_WEIGHTS.aiAnswerBlock)

  // Robots / index policy
  const robots = (fm.robots || '').toLowerCase()
  const declaresNoindex = /noindex/.test(robots)
  if (wantIndexable && declaresNoindex) {
    warnings.push({
      code: 'robots_conflict',
      severity: 'warning',
      message: 'Content marked noindex but ship requested indexable',
      fix: 'Set robots: index,follow or set indexable=false',
    })
  }
  if (!wantIndexable && !declaresNoindex) {
    warnings.push({
      code: 'robots_missing_noindex',
      severity: 'warning',
      message: 'Non-indexable ship should set robots: noindex,follow in front matter',
    })
  } else if (!wantIndexable) {
    passes.push({ code: 'robots_noindex', severity: 'pass', message: 'noindex declared for non-indexable content' })
    points += AUDIT_POINT_WEIGHTS.robots
  } else {
    points += AUDIT_POINT_WEIGHTS.robots
    passes.push({ code: 'robots_index', severity: 'pass', message: 'Indexable intent (no noindex)' })
  }

  // Disclaimer / not legal advice — MUST match the quality gate's DISCLAIMER_RE
  // exactly. A looser local regex here lets the audit read 100/100 while the
  // ship gate still refuses (the reported "100% audit but blocked" failure).
  const hasDisclaimer = DISCLAIMER_RE.test(body)
  add(hasDisclaimer, {
    code: 'disclaimer',
    severity: wantIndexable ? 'blocker' : 'warning',
    message: hasDisclaimer ? 'Disclaimer present' : 'Missing legal disclaimer',
    fix: 'Add short disclaimer: educational only, not legal advice',
  }, AUDIT_POINT_WEIGHTS.disclaimer)

  // ── Voice / tone / human quality (non-negotiable) ────────────────────────
  const quality = evaluateContentQuality({
    content,
    contentType: opts.contentType,
    primaryKeyword: opts.primaryKeyword || fm.primaryKeyword,
    indexable: wantIndexable,
    requiredShortKeywords: opts.requiredShortKeywords,
    requiredLongTailKeywords: opts.requiredLongTailKeywords,
  })
  for (const b of quality.blockers) {
    // Avoid duplicate codes already covered above (tldr/faq/citations)
    if (
      (b.code === 'missing_tldr' && hasTldr) ||
      (b.code === 'missing_official_sources' && hasGov) ||
      (b.code === 'missing_disclaimer' && hasDisclaimer)
    ) {
      continue
    }
    if (blockers.some((x) => x.code === b.code && x.message === b.message)) continue
    blockers.push({
      code: b.code,
      severity: 'blocker',
      message: b.message,
      fix: b.fix,
    })
  }
  for (const w of quality.warnings) {
    if (warnings.some((x) => x.code === w.code)) continue
    warnings.push({
      code: w.code,
      severity: 'warning',
      message: w.message,
      fix: w.fix,
    })
  }
  if (quality.ok && quality.humanScore >= 75) {
    passes.push({
      code: 'human_voice',
      severity: 'pass',
      message: `Human voice ${quality.humanScore}/100`,
    })
    points += AUDIT_POINT_WEIGHTS.humanVoice
  } else if (quality.humanScore >= 60 && quality.ok) {
    // Partial credit for a passing-but-mediocre voice score
    points += Math.floor(AUDIT_POINT_WEIGHTS.humanVoice / 2)
  }

  // Never recommend index for under-floor depth or quality blockers
  const indexableRecommended =
    wantIndexable &&
    blockers.length === 0 &&
    words >= minWords &&
    !depth.thin &&
    !depth.belowMin &&
    quality.ok

  const score = Math.min(100, Math.round((points / max) * 100))
  // Penalize blockers hard (thin content + voice especially)
  const thinPenalty = blockers.some((b) => b.code === 'thin_content' || b.code === 'word_count')
    ? 20
    : 0
  const voicePenalty = blockers.some((b) =>
    ['ai_slop', 'outcome_promise', 'hype_tone', 'inhuman_voice', 'keyword_stuffing'].includes(b.code),
  )
    ? 15
    : 0
  const finalScore = Math.max(0, score - blockers.length * 12 - thinPenalty - voicePenalty)

  return {
    score: finalScore,
    grade: grade(finalScore),
    blockers,
    warnings,
    passes,
    indexableRecommended,
    llmsRecommended: indexableRecommended && hasTldr && hasFaq && finalScore >= 70,
    wordCount: words,
    primaryKeyword: opts.primaryKeyword || fm.primaryKeyword,
    humanScore: quality.humanScore,
    qualitySummary: quality.summary,
  }
}

export function canAutodeploy(audit: SeoFactoryAudit, ymy: boolean, threshold = 70): boolean {
  if (audit.blockers.length > 0) return false
  if (!meetsShipQuality(audit)) return false
  if (audit.score < threshold) return false
  if (ymy && audit.score < 80) return false
  return true
}

/** True when audit has no depth/word-count blockers. */
export function meetsDepthFloor(audit: SeoFactoryAudit): boolean {
  return !audit.blockers.some((b) => b.code === 'word_count' || b.code === 'thin_content')
}

/**
 * Full unattended publish readiness: depth + voice/tone/compliance + no blockers.
 * Use this for auto-run / merge — not depth alone.
 */
export function meetsShipQuality(audit: SeoFactoryAudit): boolean {
  if (audit.blockers.length > 0) return false
  if (!meetsDepthFloor(audit)) return false
  if (audit.humanScore != null && audit.humanScore < 55) return false
  return true
}
