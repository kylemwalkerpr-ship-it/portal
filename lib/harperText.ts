/**
 * harperText — the leak-free markdown → prose transform for Harper.js.
 *
 * Pure, dependency-free (no wasm import) so tests and the metrics layer can
 * use it anywhere. The line-preserving contract: every source line maps to
 * exactly one output line (same index), so suggestion spans from the grammar
 * engine convert straight back onto the original document for one-click
 * autofix, and structural lines (frontmatter, JSON-LD, fences, tables, hr,
 * URLs) never reach the engine at all.
 */

/** Estate + domain vocabulary — imported into the linter so brand names
 *  (YouSafe, Caseworks), currencies (AUD), program terms (ImmiAccount,
 *  OSHC, CoE, IELTS) and regional spellings (dependants, lodgement,
 *  enrolment) never surface as "spelling" noise. */
export const HARPER_ESTATE_WORDS: string[] = [
  'YouSafe', 'Caseworks', 'MyCaseworks', 'Yousafe', 'AUD', 'USD', 'GBP', 'CAD', 'EUR',
  'ImmiAccount', 'Immi', 'OSHC', 'CoE', 'IELTS', 'OET', 'PTE', 'TOEFL', 'GRE', 'GMAT',
  'dependants', 'dependant', 'lodgement', 'lodgements', 'lodged', 'Enrolment', 'enrolment',
  'Bupa', 'Medibank', 'NIB', 'HCF', 'AHPRA', 'NCSBN', 'NCLEX', 'OISC', 'CICC', 'MARA',
  'USCIS', 'IRCC', 'UKVI', 'Home Office', 'SSN', 'EAD', 'OPT', 'CPT', 'H1B', 'L1',
  'I-20', 'I-485', 'I-130', 'I-797', 'DS-160', 'DS-260', 'STEM', 'PERM', 'EB-2', 'EB-3', 'EB-5',
  'PR', 'EOI', '189', '190', '491', '482', '485', 'WHV', 'CES', 'WES', 'ECA',
  'VisaCheckout', 'GTE', 'GS', 'Confirmation of Enrolment', 'letter of offer', 'accommodation',
  'SEVIS', 'Sevis', 'LCA', 'CRS', 'Paystubs', 'paystubs', 'paystub', 'Form', 'DSO', 'STEM OPT',
  'F-1', 'F1', 'H-1B', 'TN', 'O-1', 'L-1', 'E-2', 'B-1', 'B-2', 'J-1', 'J-2',
  'CRICOS', 'TFN', 'ICT', 'ACS', 'NAATI', 'AFP', 'OVHC', 'OSHC', 'MD', 'VEVO', 'IMMI',
  'CaseWorks', 'YouSafe', 'HomeAffairs', 'SkillSelect', 'PointsTest',
  'rumour', 'rumours', 'colour', 'organise', 'organisation', 'enrolment', 'programmes',
]

export type HarperSafeLine = { src: string; out: string; skip: boolean }

function classifyLine(raw: string): 'skip' | 'table' | 'text' {
  const t = raw.trim()
  if (!t) return 'skip'
  if (t.startsWith('|') && t.endsWith('|')) return 'table'
  if (/^\s*(?:-{3,}|\*{3,}|_{3,}|~{3,})\s*$/.test(t)) return 'skip'
  if (/^```/.test(t)) return 'skip'
  if (t.startsWith('<script') || t.startsWith('</script>')) return 'skip'
  return 'text'
}

/**
 * Line-preserving leak-free transform: markdown → plain prose for Harper.
 * Frontmatter, JSON-LD, code fences, tables, hr rules and URL destinations
 * are stripped; heading markers, list/quote prefixes and inline emphasis are
 * removed while the readable words survive (sentence-case headings are the
 * estate contract — Harper's title-case rule must never see them).
 */
export function harperSafeLines(md: string): HarperSafeLine[] {
  const rawLines = String(md || '').split('\n')
  const out: HarperSafeLine[] = []
  let inFence = false
  let inFm = false
  for (const raw of rawLines) {
    const t = raw.trim()
    if (!inFence && !inFm && t === '---' && out.every((o) => o.skip)) {
      inFm = true
      out.push({ src: raw, out: '', skip: true })
      continue
    }
    if (inFm) {
      if (t === '---') inFm = false
      out.push({ src: raw, out: '', skip: true })
      continue
    }
    if (!inFence && /^```/.test(t)) {
      inFence = true
      out.push({ src: raw, out: '', skip: true })
      continue
    }
    if (inFence) {
      if (/^```/.test(t)) inFence = false
      out.push({ src: raw, out: '', skip: true })
      continue
    }
    const cls = classifyLine(raw)
    if (cls === 'skip' || cls === 'table') {
      out.push({ src: raw, out: '', skip: true })
      continue
    }
    let line = raw
      .replace(/^#{1,4}\s+/, '')
      .replace(/^(?:\s*[-*+]\s+|\s*\d+[.)]\s+|\s*>\s?|\s*\(\d+\)\s*)/, '')
    line = line
      .replace(/!?\[([^\]]*)\]\([^)\s]+\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)\s]+\)/g, '$1')
      .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, '')
      .replace(/\b(?:www\.)[^\s"'<>]+/gi, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\*\*|__|\*|_|~~/g, '')
      .replace(/<\/?[a-z][^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!line || isNonClientFacingLine(line)) {
      out.push({ src: raw, out: '', skip: true })
      continue
    }
    out.push({ src: raw, out: line, skip: false })
  }
  return out
}

/** Scaffold / TOC / nav — not reader sentences Harper should rewrite. */
export function isNonClientFacingLine(line: string): boolean {
  const t = String(line || '').trim()
  if (!t) return true
  if (/table of contents/i.test(t) && t.length > 40) return true
  if (/^table of contents\b/i.test(t)) return true
  if (/^related (guides?|reading|resources)\b/i.test(t) && t.length < 80) return true
  if (/^sources\b/i.test(t) && t.length < 60) return true
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length >= 10 && !/[.?!]/.test(t) && words.filter((w) => /^[A-Z]/.test(w)).length >= Math.ceil(words.length * 0.55)) {
    return true
  }
  return false
}

const ESTATE_WORD_SET = new Set(HARPER_ESTATE_WORDS.map((w) => w.toLowerCase()))

const COMMONWEALTH_SPELLING = new Set([
  'rumour', 'rumours', 'colour', 'colours', 'organise', 'organised', 'organisation',
  'enrolment', 'enrol', 'enrolled', 'programme', 'programmes', 'defence', 'licence',
  'practise', 'travelling', 'cancelled', 'ageing', 'favour', 'honour',
])

function sharedPrefixLen(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  let i = 0
  while (i < x.length && i < y.length && x[i] === y[i]) i++
  return i
}

function isAcronymToken(s: string): boolean {
  return /^[A-Z]{2,12}s?$/.test(s) || /^[A-Z]{1,6}[-/][A-Z0-9]{1,8}$/.test(s)
}

/** Proper nouns, abbreviations, and dialect spelling are not grammar findings. */
export function isHarperNoiseFinding(it: { kind?: string; problem?: string; message?: string; fix?: string }): boolean {
  const kind = String(it.kind || '')
  const problem = String(it.problem || '').trim()
  const fix = String(it.fix || '').trim()
  const message = String(it.message || '')
  if (!problem) return true
  if (/readability/i.test(kind)) return true
  if (/^["'`“”‘’]+$/.test(problem)) return true
  if (problem.length <= 2 && /word choice|spelling|formatting/i.test(kind)) return true
  if (/^byte$/i.test(fix) && /^[A-Za-z]$/.test(problem)) return true
  if (ESTATE_WORD_SET.has(problem.toLowerCase())) return true
  if (COMMONWEALTH_SPELLING.has(problem.toLowerCase())) return true
  if (/yousafe|caseworks|cricos|naati|ovhc|home.?affairs/i.test(problem)) return true
  if (/spelling|word choice/i.test(kind)) {
    if (isAcronymToken(problem)) return true
    if (/[a-z][A-Z]/.test(problem)) return true
    if (/[A-Za-z]+\d|\d[A-Za-z]/.test(problem)) return true
    if (/did you mean to spell/i.test(message) && /^[A-Z0-9]/.test(problem) && !/\s/.test(problem)) return true
    if (fix && problem.length >= 5 && sharedPrefixLen(problem, fix) < 3) return true
    if (/^[A-Z]/.test(problem) && !/\s/.test(problem) && problem.length <= 16 && /spelling/i.test(kind)) return true
  }
  if (/word choice/i.test(kind) && /did you mean ['`]?byte/i.test(message)) return true
  return false
}

export function escapeRegExpWord(w: string): string {
  return String(w || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Replace the changed words in `src` with the corrected words in `out`,
 *  preserving everything else (markers, links, emphasis) verbatim. */
export function spliceWords(src: string, out: string): string {
  const srcWords = src.split(/\s+/).filter(Boolean)
  const outWords = out.split(/\s+/).filter(Boolean)
  if (srcWords.length === outWords.length) {
    let rebuilt = src
    for (let i = 0; i < srcWords.length; i++) {
      if (srcWords[i] !== outWords[i]) {
        const re = new RegExp(escapeRegExpWord(srcWords[i]))
        const next = rebuilt.replace(re, outWords[i])
        if (next !== rebuilt) rebuilt = next
      }
    }
    return rebuilt
  }
  return applyProseCorrection(src, srcWords.join(' '), outWords.join(' '))
}

/** Put Harper's corrected prose back into a markdown source line without throwing. */
export function applyProseCorrection(src: string, before: string, after: string): string {
  if (!src || before === after) return src
  const spliced = (() => {
    const srcWords = src.split(/\s+/).filter(Boolean)
    const outWords = after.split(/\s+/).filter(Boolean)
    if (srcWords.length !== outWords.length) return src
    let rebuilt = src
    for (let i = 0; i < srcWords.length; i++) {
      if (srcWords[i] !== outWords[i]) {
        const re = new RegExp(escapeRegExpWord(srcWords[i]))
        const next = rebuilt.replace(re, outWords[i])
        if (next !== rebuilt) rebuilt = next
      }
    }
    return rebuilt
  })()
  if (spliced !== src) return spliced
  if (before && src.includes(before)) return src.replace(before, after)
  return src
}

/** Apply Harper span replacements from the end of the string so earlier indices stay valid. */
export function applyNonOverlappingSpanFixes(
  text: string,
  fixes: Array<{ start: number; end: number; replacement: string }>,
): { text: string; applied: number } {
  const sorted = [...fixes]
    .filter((f) => Number.isFinite(f.start) && Number.isFinite(f.end) && f.start >= 0 && f.end >= f.start && f.end <= text.length)
    .sort((a, b) => b.start - a.start)
  let out = text
  let lastStart = Infinity
  let applied = 0
  for (const f of sorted) {
    if (f.end > lastStart) continue
    out = out.slice(0, f.start) + f.replacement + out.slice(f.end)
    lastStart = f.start
    applied++
  }
  return { text: out, applied }
}

export function splitMarkdownFrontmatter(md: string): { fm: string; body: string } {
  const raw = String(md || '')
  const m = raw.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)/)
  if (!m) return { fm: '', body: raw }
  return { fm: m[1], body: raw.slice(m[1].length) }
}

export function dialectForRegion(region?: string | null): 'american' | 'british' {
  const r = String(region || '').toUpperCase()
  if (r === 'AU' || r === 'UK' || r === 'GB' || r === 'CA' || r === 'NZ') return 'british'
  return 'american'
}

/** Rebuild markdown from Harper's corrected plaintext lines. Length mismatch is a no-op. */
export function mapCorrectedProseToMarkdown(
  md: string,
  lines: HarperSafeLine[],
  correctedJoined: string,
): string {
  const newOuts = String(correctedJoined || '').split('\n')
  const prose = lines.filter((l) => !l.skip)
  if (newOuts.length !== prose.length) return md
  const result = lines.map((l) => l.src)
  let p = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].skip) continue
    const before = lines[i].out
    const after = newOuts[p++]
    if (after !== before) result[i] = applyProseCorrection(lines[i].src, before, after)
  }
  return result.join('\n')
}