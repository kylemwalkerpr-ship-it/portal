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
}

function grade(score: number): SeoFactoryAudit['grade'] {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 55) return 'D'
  return 'F'
}

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
  const max = 20

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
      fix: 'Change keyword, content type, or expand the existing owner URL',
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
    // Partial points for meeting the floor
    points += 1
  } else {
    add(true, {
      code: 'word_count',
      severity: 'pass',
      message: `Word count ${words} (min ${minWords}, target ${targetWords})`,
    }, 2)
  }

  // Title
  const title = fm.title || body.match(/^#\s+(.+)$/m)?.[1] || ''
  add(title.length > 10 && title.length <= 70, {
    code: 'title',
    severity: !title ? 'blocker' : 'warning',
    message: title ? `Title length ${title.length}: "${title.slice(0, 60)}"` : 'Missing title',
    fix: 'Set YAML title 30–60 chars with primary keyword + year/place when relevant',
  }, 2)

  // Meta description
  const desc = fm.description || fm.metaDescription || ''
  add(desc.length >= 120 && desc.length <= 170, {
    code: 'meta_description',
    severity: 'warning',
    message: desc ? `Meta description length ${desc.length}` : 'Missing meta description in front matter',
    fix: 'Add description: 140–160 characters with a concrete benefit',
  }, 1)

  // H2 structure
  const h2s = (body.match(/^##\s+/gm) || []).length
  add(h2s >= 4, {
    code: 'h2_structure',
    severity: 'warning',
    message: `H2 count ${h2s} (want ≥4)`,
    fix: 'Add clear H2 sections covering procedure, documents, risks, FAQ',
  }, 1)

  // Keyword usage
  if (primary) {
    const inTitle = title.toLowerCase().includes(primary.slice(0, Math.min(primary.length, 20)))
    const inBody = body.toLowerCase().includes(primary.split(' ')[0] || primary)
    add(inTitle || inBody, {
      code: 'keyword',
      severity: 'warning',
      message: inTitle ? 'Primary keyword appears in title' : 'Primary keyword weak/missing in title',
      fix: `Include "${opts.primaryKeyword}" naturally in title and first H2`,
    }, 2)
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
  }, 2)

  // Schema
  const hasArticle = /"@type"\s*:\s*"Article"/.test(body)
  const hasFaq = /"@type"\s*:\s*"FAQPage"/.test(body)
  add(hasArticle, {
    code: 'schema_article',
    severity: 'warning',
    message: hasArticle ? 'Article JSON-LD present' : 'Missing Article JSON-LD',
    fix: 'Add Article schema in application/ld+json',
  }, 1)
  add(hasFaq || opts.contentType === 'marketplace_gig', {
    code: 'schema_faq',
    severity: 'warning',
    message: hasFaq ? 'FAQPage JSON-LD present' : 'Missing FAQPage JSON-LD',
    fix: 'Add 4–6 FAQs with FAQPage schema for AI overviews',
  }, 1)

  // Internal links
  const internalLinks = (body.match(/\]\(\//g) || []).length + (body.match(/yousafeconsultancy\.com/g) || []).length
  add(internalLinks >= 2, {
    code: 'internal_links',
    severity: 'warning',
    message: `Internal/estate links ~${internalLinks}`,
    fix: 'Link to hub + 1–2 related legal/regional pages',
  }, 1)

  // AI / LLM readiness
  const hasTldr = /tldr|in 60 seconds|quick answer|key takeaways/i.test(body)
  add(hasTldr, {
    code: 'ai_answer_block',
    severity: 'warning',
    message: hasTldr ? 'Answer/TL;DR block present' : 'Missing TL;DR / quick-answer block',
    fix: 'Add a concise "In 60 seconds" list for AI Overviews and llms.txt',
  }, 1)

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
    points += 1
  } else {
    points += 1
    passes.push({ code: 'robots_index', severity: 'pass', message: 'Indexable intent (no noindex)' })
  }

  // Disclaimer / not legal advice
  const hasDisclaimer = /not legal advice|editorial|consult (an? )?(attorney|lawyer|solicitor)/i.test(body)
  add(hasDisclaimer, {
    code: 'disclaimer',
    severity: 'warning',
    message: hasDisclaimer ? 'Disclaimer present' : 'Missing legal disclaimer',
    fix: 'Add short disclaimer: educational only, not legal advice',
  }, 1)

  // Never recommend index for under-floor depth
  const indexableRecommended =
    wantIndexable &&
    blockers.length === 0 &&
    words >= minWords &&
    !depth.thin &&
    !depth.belowMin

  const score = Math.min(100, Math.round((points / max) * 100))
  // Penalize blockers hard (thin content especially)
  const thinPenalty = blockers.some((b) => b.code === 'thin_content' || b.code === 'word_count')
    ? 20
    : 0
  const finalScore = Math.max(0, score - blockers.length * 12 - thinPenalty)

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
  }
}

export function canAutodeploy(audit: SeoFactoryAudit, ymy: boolean, threshold = 70): boolean {
  if (audit.blockers.length > 0) return false
  // Depth floor is non-negotiable even if score looks high
  if (audit.blockers.some((b) => b.code === 'word_count' || b.code === 'thin_content')) return false
  if (audit.score < threshold) return false
  if (ymy && audit.score < 80) return false
  return true
}

/** True when audit has no depth/word-count blockers (safe for unattended publish). */
export function meetsDepthFloor(audit: SeoFactoryAudit): boolean {
  return !audit.blockers.some((b) => b.code === 'word_count' || b.code === 'thin_content')
}
