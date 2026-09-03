import { LocalLinter, Dialect, type Lint, type Suggestion } from 'harper.js'
import { binaryInlined } from 'harper.js/binaryInlined'
import { scoreHarperLints } from '@/lib/editorMetrics'
import { harperSafeLines, spliceWords, HARPER_ESTATE_WORDS } from '@/lib/harperText'

/**
 * Browser-side Harper.js grammar service — on-device (inlined WASM), lazy.
 *
 * LEAK-FREE feeding: the document's scaffolding never reaches the grammar
 * engine. Frontmatter, JSON-LD, code fences, tables, hr rules and URL
 * destinations are stripped line-by-line, and heading markers ("## ") are
 * removed while the heading TEXT is kept (sentence-case headings are the
 * estate contract — Harper's title-case rule must never see them as prose).
 * The transform is 1:1 line-preserving, so spelling/grammar suggestions
 * apply cleanly back onto the original markdown for one-click autofix.
 *
 * Vocabulary: an estate + program wordlist is imported into the linter so
 * brand names (YouSafe, Caseworks), currencies (AUD), program terms
 * (ImmiAccount, OSHC, CoE, IELTS) and regional spellings (dependants,
 * lodgement, enrolment) never appear as "spelling" noise.
 */

export type HarperLintSummary = {
  score: number
  errors: number
  suggestions: number
  items: Array<{ kind: string; problem: string; message: string; fix?: string }>
}

export type HarperAutofixResult = {
  content: string
  applied: number
  items: Array<{ kind: string; problem: string; message: string; fix?: string }>
}

export { HARPER_ESTATE_WORDS, harperSafeLines, spliceWords } from '@/lib/harperText'

let linterPromise: Promise<LocalLinter> | null = null

function getLinter(): Promise<LocalLinter> {
  if (!linterPromise) {
    linterPromise = (async () => {
      const linter = new LocalLinter({ binary: binaryInlined, dialect: Dialect.American })
      await linter.setup()
      try {
        await linter.importWords(HARPER_ESTATE_WORDS)
      } catch {
        // vocabulary import is best-effort per Harper rule set
      }
      return linter
    })()
  }
  return linterPromise
}

function kindOf(l: Lint): string {
  try {
    return l.lint_kind_pretty() || l.lint_kind() || 'Issue'
  } catch {
    return 'Issue'
  }
}

/** Noise filter: sentence-case headings are the estate contract, so
 *  Harper's title-case Capitalization findings never surface. */
function keepLint(l: Lint): boolean {
  try {
    if ((l.lint_kind() || '') === 'Capitalization') return false
    return true
  } catch {
    return true
  }
}

/** Map a transformed-line lint span back onto the original + capture the
 *  first suggestion so the UI can offer a one-click fix. */
export function harperLintItems(md: string): { lines: Array<{ src: string; out: string }>; items: HarperLintSummary['items'] } {
  const lines = harperSafeLines(md)
  return { lines, items: [] }
}

export async function runHarperGrammar(md: string, signal?: AbortSignal): Promise<HarperLintSummary | null> {
  try {
    const linter = await getLinter()
    if (signal?.aborted) return null
    const lines = harperSafeLines(String(md || ''))
    const joined = lines.filter((l) => !l.skip).map((l) => l.out)
    const text = joined.join('\n')
    if (text.trim().length < 80) {
      return { score: 100, errors: 0, suggestions: 0, items: [] }
    }
    const lints: Lint[] = await linter.lint(text, { language: 'plaintext', dedup: true })
    if (signal?.aborted) return null
    const kept = lints.filter(keepLint)
    const mapped = []
    for (const l of kept) {
      const problem = l.get_problem_text?.() || ''
      let fix: string | undefined
      try {
        const list = l.suggestions()
        const s = list && list.length ? list[0] : null
        if (s && typeof (s as { get_replacement_text?: () => string }).get_replacement_text === 'function') {
          fix = (s as { get_replacement_text: () => string }).get_replacement_text()
        }
      } catch { /* suggestion text is optional */ }
      mapped.push({
        kind: kindOf(l),
        problem,
        message: l.message?.() || '',
        span: l.span?.(),
        fix,
      })
    }
    const { score, errors, suggestions } = scoreHarperLints(mapped)
    const items = mapped
      .filter((m) => m.problem.trim().length > 0)
      .slice(0, 24)
      .map((m) => ({
        kind: m.kind,
        problem: m.problem.slice(0, 120),
        message: m.message.slice(0, 200),
        fix: m.fix?.slice(0, 120),
      }))
    return { score, errors, suggestions, items }
  } catch (err) {
    console.info('[harper] grammar pass skipped:', String((err as Error)?.message || err).slice(0, 120))
    return null
  }
}

/**
 * One-click autofix for Harper findings. Applies Spelling / Grammar / Typo /
 * Punctuation / Nonstandard suggestions on the transformed prose (line index
 * preserved), then splices the corrected words back onto the original
 * markdown line. Never rewrites scaffold, tables, URLs, frontmatter, link
 * anchors or emphasis — only the corrected words change.
 */
/** Apply the first Harper lint whose problem text matches. */
export async function applyHarperProblem(md: string, problem: string): Promise<HarperAutofixResult> {
  const needle = String(problem || '').trim()
  if (!needle) return { content: String(md || ''), applied: 0, items: [] }
  const full = await fixHarperIssues(md, needle)
  return full
}

export async function fixHarperIssues(md: string, onlyProblem?: string): Promise<HarperAutofixResult> {
  try {
    const linter = await getLinter()
    const lines = harperSafeLines(String(md || ''))
    const textLines = lines.filter((l) => !l.skip) as Array<{ src: string; out: string }>
    if (textLines.length === 0) return { content: String(md || ''), applied: 0, items: [] }
    const text = textLines.map((l) => l.out).join('\n')
    const lints = (await linter.lint(text, { language: 'plaintext', dedup: true })).filter(keepLint)
    // Spelling, grammar, punctuation, typos — not opinionated Style/rhythm.
    const allowed = new Set(['Spelling', 'Grammar', 'Typo', 'Punctuation', 'Nonstandard', 'WordOrder', 'Repetition'])
    const correctedOut = new Map<number, string>()
    const items: HarperAutofixResult['items'] = []
    let applied = 0
    for (const l of lints) {
      const kind = l.lint_kind() || ''
      if (!allowed.has(kind)) continue
      const problem = l.get_problem_text?.() || ''
      if (!problem.trim()) continue
      if (onlyProblem && problem !== onlyProblem && !problem.includes(onlyProblem)) continue
      const span = l.span?.()
      if (!span || span.start == null || span.end == null) continue
      const spanLen = span.end - span.start
      const offset = span.start
      if (offset < 0 || offset >= text.length) continue
      const lineIdx = text.slice(0, offset).split('\n').length - 1
      const targetLine = textLines[lineIdx]
      if (!targetLine || lineIdx < 0) continue
      const lineStart = text.slice(0, offset).lastIndexOf('\n') + 1
      const rel = offset - lineStart
      if (rel < 0 || rel + spanLen > targetLine.out.length) continue
      // One word may carry both a correction and a case re-capitalization;
      // apply walls of repeated identical corrections only once per line.
      const lastApplied = correctedOut.get(lineIdx)
      let suggestion: Suggestion | null = null
      try {
        const list = l.suggestions()
        suggestion = list && list.length ? list[0] : null
      } catch {
        suggestion = null
      }
      if (!suggestion) continue
      const replaced = await linter.applySuggestion(lastApplied ?? targetLine.out, l, suggestion)
      const base = lastApplied ?? targetLine.out
      if (replaced == null || replaced === base) continue
      // Case-only changes: estate names and currencies are case-sensitive —
      // Harper must not "correct" YouSafe → yousafe or AUD → Aud.
      if (kind === 'Spelling' && problem.toLowerCase() === replaced.toLowerCase()) continue
      correctedOut.set(lineIdx, replaced)
      applied++
      if (items.length < 24) {
        const changedStart = Math.max(0, rel)
        items.push({
          kind: kindOf(l),
          problem: problem.slice(0, 120),
          message: (l.message?.() || '').slice(0, 200),
          fix: replaced.slice(changedStart, Math.min(replaced.length, changedStart + Math.max(spanLen, problem.length))),
        })
      }
    }
    if (applied === 0) return { content: String(md || ''), applied: 0, items }
    // Splice corrected words back onto their original markdown lines.
    const resultLines: string[] = []
    let proseIdx = 0
    for (const line of lines) {
      if (line.skip) {
        resultLines.push(line.src)
        continue
      }
      const corrected = correctedOut.get(proseIdx)
      resultLines.push(corrected !== undefined ? spliceWords(line.src, corrected) : line.src)
      proseIdx++
    }
    return { content: resultLines.join('\n'), applied, items }
  } catch (err) {
    console.info('[harper] autofix skipped:', String((err as Error)?.message || err).slice(0, 120))
    return { content: String(md || ''), applied: 0, items: [] }
  }
}

/** Replace the changed words in `src` with the corrected words in `out`,
 *  preserving everything else (markers, links, emphasis) verbatim. */
export function harperTextPreview(md: string): string {
  return harperSafeLines(md).filter((l) => !l.skip).map((l) => l.out).join(' ').slice(0, 300)
}