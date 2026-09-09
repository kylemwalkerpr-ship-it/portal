/**
 * Deterministic whole-document cohesion critique. No LLM — the writer and
 * author-revise pass consume these findings as directives.
 */

export type CohesionFinding = { code: string; message: string; evidence?: string }

const TLDR_HEADING = /^(in 60 seconds|tldr|tl;dr|key takeaways)$/i
const STRUCTURAL_H2 = /^(in 60 seconds|tldr|tl;dr|key takeaways|faq|frequently asked questions|sources|official sources|disclaimer|table of contents|related guides?)$/i
const LEGAL_WORD_RE =
  /\b(?:must(?:\s+not)?|shall(?:\s+not)?|never|may(?:\s+not)?|cannot|can\s+not|unless)\b/gi

function normHeading(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[*_`#]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripYamlAndFences(content: string): string {
  let body = String(content || '')
  body = body.replace(/^\uFEFF/, '')
  body = body.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '')
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
  body = body.replace(/```[\s\S]*?```/g, '\n')
  return body
}

function paragraphs(content: string): string[] {
  return stripYamlAndFences(content)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false
      if (/^#{1,6}\s/.test(p)) return false
      if (/^[-*+]\s/.test(p)) return false
      if (/^\d+[.)]\s/.test(p)) return false
      if (/^(?:---|```|~~~)/.test(p)) return false
      return p.split(/\s+/).filter(Boolean).length >= 4
    })
}

function firstFourWords(paragraph: string): string {
  const words = paragraph
    .replace(/[#>*_`[\]]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.toLowerCase().replace(/[^a-z0-9'-]/g, ''))
    .filter(Boolean)
  return words.join(' ')
}

function h2Sections(content: string): Array<{ heading: string; body: string }> {
  const body = stripYamlAndFences(content)
  const re = /^##\s+(.+)$/gm
  const marks: { index: number; heading: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    marks.push({ index: m.index, heading: m[1].trim() })
  }
  const out: Array<{ heading: string; body: string }> = []
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index
    const headingLineEnd = body.indexOf('\n', start)
    const bodyStart = headingLineEnd >= 0 ? headingLineEnd + 1 : start
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length
    out.push({ heading: marks[i].heading, body: body.slice(bodyStart, end).trim() })
  }
  return out
}

function tokensOver4(text: string): Set<string> {
  const set = new Set<string>()
  for (const w of String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)) {
    if (w.length > 4) set.add(w)
  }
  return set
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

function faqQuestions(content: string): string[] {
  const sections = h2Sections(content)
  const faq = sections.find((s) => /^(faq|frequently asked questions)\b/i.test(normHeading(s.heading)))
  if (!faq) return []
  return Array.from(faq.body.matchAll(/^###\s+(.+)$/gm)).map((m) => m[1].trim())
}

const ADJACENT_OVERLAP = 0.5

export function critiqueCohesion(content: string): { score: number; findings: CohesionFinding[] } {
  const findings: CohesionFinding[] = []
  const text = String(content || '')
  if (!text.trim()) return { score: 100, findings }

  const openerCounts = new Map<string, number>()
  for (const p of paragraphs(text)) {
    const key = firstFourWords(p)
    if (!key) continue
    openerCounts.set(key, (openerCounts.get(key) || 0) + 1)
  }
  for (const [opener, count] of openerCounts) {
    if (count >= 3) {
      findings.push({
        code: 'repeated_paragraph_opener',
        message: `The same first four words appear in ${count} paragraphs.`,
        evidence: opener,
      })
    }
  }

  const sections = h2Sections(text)
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i]
    const b = sections[i + 1]
    if (STRUCTURAL_H2.test(normHeading(a.heading)) || STRUCTURAL_H2.test(normHeading(b.heading))) continue
    const ja = tokensOver4(a.body)
    const jb = tokensOver4(b.body)
    if (ja.size < 8 || jb.size < 8) continue
    const overlap = jaccard(ja, jb)
    if (overlap >= ADJACENT_OVERLAP) {
      findings.push({
        code: 'adjacent_section_overlap',
        message: `Adjacent H2s “${a.heading}” and “${b.heading}” repeat the same argument.`,
        evidence: `jaccard=${overlap.toFixed(2)};later=${b.heading}`,
      })
    }
  }

  const h2Titles = sections
    .filter((s) => !STRUCTURAL_H2.test(normHeading(s.heading)))
    .map((s) => ({ raw: s.heading, key: normHeading(s.heading) }))
  for (const q of faqQuestions(text)) {
    const qKey = normHeading(q.replace(/\?+$/, ''))
    if (!qKey) continue
    const dup = h2Titles.find((h) => {
      if (!h.key) return false
      return h.key === qKey || h.key.includes(qKey) || qKey.includes(h.key)
    })
    if (dup) {
      findings.push({
        code: 'faq_duplicates_h2',
        message: `FAQ question restates H2 “${dup.raw}”.`,
        evidence: q,
      })
    }
  }

  const tldrCount = sections.filter((s) => TLDR_HEADING.test(normHeading(s.heading))).length
  if (tldrCount >= 2) {
    findings.push({
      code: 'multiple_tldr_blocks',
      message: `Document has ${tldrCount} In-60-seconds / TL;DR-like blocks.`,
      evidence: String(tldrCount),
    })
  }

  const score = Math.max(0, 100 - 8 * findings.length)
  return { score, findings }
}

/**
 * Factual fingerprint tokens that must survive a full-document author rewrite:
 * URLs, numbers, and legal qualifiers.
 */
export function factTokens(text: string): string[] {
  const raw = String(text || '')
  const urls = (raw.match(/https?:\/\/[^\s)\]>'"`]+/gi) || []).map((u) =>
    u.replace(/[.,;:]+$/, '').toLowerCase(),
  )
  const numbers = raw.match(/\b\d+(?:[.,]\d+)*\b/g) || []
  const legal = (raw.match(LEGAL_WORD_RE) || []).map((s) => s.toLowerCase().replace(/\s+/g, ' '))
  return [...urls, ...numbers, ...legal]
}

export function uniqueFactTokens(text: string): Set<string> {
  return new Set(factTokens(text))
}

export function factsWerePreserved(
  original: string,
  revised: string,
): { ok: boolean; reason?: string } {
  const orig = uniqueFactTokens(original)
  const next = uniqueFactTokens(revised)
  const missing: string[] = []
  for (const t of orig) if (!next.has(t)) missing.push(t)
  if (missing.length) {
    return {
      ok: false,
      reason: `Fact tokens shrank (${missing.slice(0, 8).join(', ')})`,
    }
  }
  if (/\bdisclaimer\b/i.test(original) && !/\bdisclaimer\b/i.test(revised)) {
    return { ok: false, reason: 'Disclaimer was removed' }
  }
  if (/not legal advice/i.test(original) && !/not legal advice/i.test(revised)) {
    return { ok: false, reason: 'Legal disclaimer qualifier was removed' }
  }
  return { ok: true }
}
