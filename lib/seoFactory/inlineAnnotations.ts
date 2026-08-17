/**
 * Inline-annotation helpers for the Content Studio editor.
 *
 * The quality gate emits findings (blockers + warnings). Many warnings have NO
 * `evidence` (e.g. tone_whilst, emdash_spam, missing_second_person,
 * wall_of_text, missing_reader_path…) so a naive location lookup produces zero
 * annotations — the admin saw "2 warning(s)" with no way to resolve them.
 * `synthesizeAnchor` locates ANY finding in the content (via a message-derived
 * phrase, a code-derived token, or a document-level fallback) so every
 * blocker AND warning becomes a clickable, AI-fixable annotation.
 */

import type { QualityFinding } from './contentQualityGate'

export type InlineAnnotation = {
  id: string
  line: number
  col: number
  endLine: number
  endCol: number
  length: number
  severity: 'blocker' | 'warning'
  code: string
  message: string
  fix: string
  highlightedText: string
}

function indexToLineCol(content: string, index: number) {
  const before = content.slice(0, index)
  const line = (before.match(/\n/g) || []).length + 1
  const lastNl = before.lastIndexOf('\n')
  return { line, col: lastNl === -1 ? index + 1 : index - lastNl }
}

/** Distinctive phrase to search for — from the finding's own words. */
function phraseCandidates(f: QualityFinding): string[] {
  const out: string[] = []
  const add = (s: string | undefined | null) => {
    const t = String(s || '').trim()
    // Skip pure punctuation / too-short phrases
    if (t.length >= 3 && /[A-Za-z]{3,}/.test(t)) out.push(t)
  }
  add(f.evidence)
  // "Message: The department requires…" → search the tail after the colon
  const m = (f.message || '').match(/:\s*(.{8,60})/)
  if (m) add(m[1])
  add(f.message)
  return out
}

/** Token derived from the finding code used as a last-chance locator. */
function codeTokens(f: QualityFinding): string[] {
  const code = (f.code || '').toLowerCase()
  // missing_second_person → ["second person"] ; tone_whilst → ["whilst"]
  const table: Record<string, string> = {
    tone_whilst: 'whilst',
    emdash_spam: '—',
    en_dash_spam: '–',
    heres_spam: "here's",
    missing_second_person: 'you',
    stiff_formality: "don't",
    missing_reader_path: 'table of contents',
    missing_visual_break: '## ',
    missing_concrete_example: 'for example',
    passive_density: ' is ',
  }
  if (table[code]) return [table[code]]
  return []
}

/**
 * Produce zero-or-more inline annotations for a quality finding.
 * `maxHits` caps duplicates (repeated sentence-start violations can match many
 * times); evidence-less warnings fall back to a single document-level anchor.
 */
export function findingToAnnotations(
  content: string,
  f: QualityFinding,
  maxHits = 6,
): InlineAnnotation[] {
  const results: InlineAnnotation[] = []
  const severity = (f.severity === 'blocker' ? 'blocker' : 'warning') as 'blocker' | 'warning'
  const body = content || ''
  const lower = body.toLowerCase()

  const pushAt = (index: number, len: number, highlighted: string) => {
    if (index < 0 || index >= Math.max(1, body.length)) return
    const { line, col } = indexToLineCol(body, index)
    const ep = indexToLineCol(body, index + len)
    results.push({
      id: `${f.code}-${results.length}-${index}`,
      line,
      col,
      endLine: ep.line,
      endCol: ep.col,
      length: len,
      severity,
      code: f.code,
      message: f.message,
      fix: f.fix || 'Review and fix.',
      highlightedText: highlighted,
    })
  }

  // 1) sentence_start_repetition — find every sentence starting with the key
  if (f.code === 'sentence_start_repetition' && f.evidence) {
    const prefix = f.evidence.replace(/\u2026$/, '').trim()
    if (prefix.length >= 3) {
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(
        `(?:^|[.!?]\\s+)(${escaped}\\S*(?:\\s+\\S+){0,5})`,
        'gim',
      )
      let m: RegExpExecArray | null
      let n = 0
      while ((m = regex.exec(body)) !== null && n < 12) {
        const si = m.index + m[0].indexOf(m[1])
        const ht = m[1].slice(0, 80)
        const { line, col } = indexToLineCol(body, si)
        const ep = indexToLineCol(body, si + ht.length)
        results.push({
          id: `${f.code}-${n}`, line, col, endLine: ep.line, endCol: ep.col,
          length: ht.length, severity, code: f.code,
          message: f.message, fix: f.fix || 'Vary this sentence opening.',
          highlightedText: ht,
        })
        n++
      }
    }
    if (results.length) return results
  }

  // 2) Exact evidence phrase (blockers with evidence point at the flagged text)
  if (f.evidence && f.evidence.length >= 3) {
    const le = f.evidence.toLowerCase()
    let idx = 0
    let n = 0
    while (idx < lower.length && n < maxHits) {
      const found = lower.indexOf(le, idx)
      if (found === -1) break
      pushAt(found, f.evidence.length, body.slice(found, found + f.evidence.length))
      n++
      idx = found + 1
    }
    if (results.length) return results
  }

  // 3) Message-derived phrase — "…: The department requires X" → locate it
  for (const phrase of phraseCandidates(f)) {
    if (phrase.length < 3) continue
    const idx = lower.indexOf(phrase.toLowerCase())
    if (idx !== -1) {
      pushAt(idx, Math.min(phrase.length, 90), body.slice(idx, idx + Math.min(phrase.length, 90)))
      return results
    }
  }

  // 4) Code-derived token — whilst, em-dash, "you", headings, etc.
  for (const token of codeTokens(f)) {
    if (!token || token === ' ') continue
    const idx = lower.indexOf(token.toLowerCase())
    if (idx !== -1) {
      pushAt(idx, token.length, body.slice(idx, idx + token.length))
      return results
    }
  }

  // 5) Document-level fallback — warning applies to the whole piece (structure,
  //    tone, reader path). Anchor at line 1 so it is still clickable/fixable.
  pushAt(0, 0, '')
  return results
}

/** Merge quality-gate + audit warnings into one deduped list (audit warnings
 *  cover indexability: schema_article, schema_faq, meta_description,
 *  internal_links, ai_answer_block, word_count_target…). Prefers the quality
 *  finding when codes collide (it carries remediation). */
export function mergeWarnings(
  quality: QualityFinding[],
  audit: Array<{ code: string; message: string; fix?: string }>,
): Array<{ code: string; message: string; fix?: string }> {
  const out = new Map<string, { code: string; message: string; fix?: string }>()
  for (const w of quality) out.set(w.code, { code: w.code, message: w.message, fix: w.fix })
  for (const w of audit) if (!out.has(w.code)) out.set(w.code, { code: w.code, message: w.message, fix: w.fix })
  return [...out.values()]
}

/** Build the AI prompt for a warnings-only targeted sweep. */
/** Prompt for a blockers-only sweep when mechanical repair is not enough. */
export function buildBlockersFixPrompt(
  content: string,
  blockers: Array<{ code: string; message: string; fix?: string }>,
): string {
  const list = blockers.map((b) => `- [${b.code}] ${b.message}${b.fix ? ` → Fix: ${b.fix}` : ''}`).join('\n')
  return [
    '## BLOCKERS SWEEP — resolve EVERY hard gate listed below',
    'These findings block shipping. Apply the smallest edit that clears each one.',
    'Do NOT regenerate the article. Keep headings, facts, citations, and interlinks.',
    '',
    'BLOCKERS TO RESOLVE:',
    list,
    '',
    'RULES:',
    '1. Title must be 30–60 characters. Meta description must be 70–160 characters.',
    '2. Keep a single H1. Set robots to index,follow. Add ogImage: /og-image.png if missing.',
    '3. Collapse any // in URLs. Article JSON-LD needs headline, image, datePublished, author.',
    '4. Dead or invented links: READ the surrounding sentence. Replace the href in place with a LIVE official .gov/.edu or estate hub URL that fits that claim (visa → USCIS/IRCC/UKVI/Home Affairs; housing/campus → the regional legal hub). If no swap fits, delete the href and add a new verifiable markdown citation next to the claim or under ## Official sources. Never invent a URL. Never leave a 404.',
    '5. Return the COMPLETE article only.',
    '',
    'CURRENT ARTICLE:',
    content.slice(0, 20000),
  ].join('\n')
}

export function buildWarningsFixPrompt(content: string, warnings: Array<{ code: string; message: string; fix?: string }>): string {
  const list = warnings.map((w) => `- [${w.code}] ${w.message}${w.fix ? ` → Fix: ${w.fix}` : ''}`).join('\n')
  return [
    '## WARNINGS SWEEP — resolve ONLY the quality warnings below',
    'These are quality-gate warnings: the article passes its hard blockers, but',
    'each warning erodes reader engagement / AI-overview eligibility. Fix ALL of',
    'them with the SMALLEST possible edits. Do NOT regenerate the article.',
    '',
    'WARNINGS TO RESOLVE:',
    list,
    '',
    'RULES:',
    '1. Keep every heading, fact, official citation, interlink, and paragraph meaning.',
    '2. For tone issues (whilst/em-dash spam/repetition/stiffness): rewrite the few',
    '   affected sentences naturally — vary openers, add contractions, prefer "while".',
    '3. For structure issues (missing reader path / visual break / example / second',
    '   person): add ONE concise table of contents, a short list or comparison table,',
    '   a clearly labeled example, or address the reader directly — where it fits.',
    '4. Do not pad. Fix, then stop.',
    '',
    'CURRENT ARTICLE:',
    content.slice(0, 20000),
  ].join('\n')
}
