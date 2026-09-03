import { LocalLinter, Dialect, type Lint, type Suggestion } from 'harper.js'
import { binaryInlined } from 'harper.js/binaryInlined'
import { scoreHarperLints } from '@/lib/editorMetrics'
import { harperSafeLines, mapCorrectedProseToMarkdown, HARPER_ESTATE_WORDS, isHarperNoiseFinding } from '@/lib/harperText'

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
    const k = l.lint_kind() || ''
    if (k === 'Capitalization' || k === 'Readability' || k === 'Style') return false
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
      const item = {
        kind: kindOf(l),
        problem,
        message: l.message?.() || '',
        span: l.span?.(),
        fix,
      }
      if (isHarperNoiseFinding(item)) continue
      mapped.push(item)
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
  const original = String(md || '')
  try {
    const linter = await getLinter()
    const allowed = new Set(['Spelling', 'Grammar', 'Typo', 'Punctuation', 'Nonstandard', 'WordOrder', 'Repetition'])
    let current = original
    let applied = 0
    const items: HarperAutofixResult['items'] = []
    const seen = new Set<string>()
    for (let round = 0; round < 8; round++) {
      const lines = harperSafeLines(current)
      const text = lines.filter((l) => !l.skip).map((l) => l.out).join('\n')
      if (text.trim().length < 40) break
      const lints = (await linter.lint(text, { language: 'plaintext', dedup: true })).filter(keepLint)
      let progressed = false
      let roundText = text
      for (const l of lints) {
        const kind = l.lint_kind() || ''
        if (!allowed.has(kind)) continue
        const problem = String(l.get_problem_text?.() || '').trim()
        if (!problem) continue
        let replacement = ''
        let suggestion: Suggestion | null = null
        try {
          const list = l.suggestions()
          suggestion = list && list.length ? list[0] : null
          if (suggestion && typeof suggestion.get_replacement_text === 'function') {
            replacement = suggestion.get_replacement_text() || ''
          }
        } catch {
          suggestion = null
        }
        if (isHarperNoiseFinding({ kind: kindOf(l), problem, message: l.message?.() || '', fix: replacement })) continue
        if (onlyProblem && problem !== onlyProblem && !problem.includes(onlyProblem) && !onlyProblem.includes(problem)) continue
        const finger = `${kind}:${problem}`
        if (seen.has(finger)) continue
        let nextMd = current
        if (suggestion) {
          try {
            const nextText = await linter.applySuggestion(roundText, l, suggestion)
            if (typeof nextText === 'string' && nextText !== roundText) {
              const mapped = mapCorrectedProseToMarkdown(current, lines, nextText)
              if (mapped !== current) {
                nextMd = mapped
                roundText = nextText
              }
            }
          } catch {
            /* span mismatch — fall through to string replace */
          }
        }
        if (nextMd === current && problem && replacement && current.includes(problem)) {
          if (kind === 'Spelling' && problem.toLowerCase() === replacement.toLowerCase()) {
            seen.add(finger)
            continue
          }
          nextMd = current.replace(problem, replacement)
        }
        seen.add(finger)
        if (nextMd === current) continue
        current = nextMd
        applied++
        progressed = true
        if (items.length < 24) {
          items.push({
            kind: kindOf(l),
            problem: problem.slice(0, 120),
            message: (l.message?.() || '').slice(0, 200),
            fix: replacement.slice(0, 120) || undefined,
          })
        }
        if (onlyProblem) break
      }
      if (!progressed) break
      if (onlyProblem) break
    }
    return { content: current, applied, items }
  } catch (err) {
    linterPromise = null
    console.info('[harper] autofix skipped:', String((err as Error)?.message || err).slice(0, 120))
    return { content: original, applied: 0, items: [] }
  }
}

/** Replace the changed words in `src` with the corrected words in `out`,
 *  preserving everything else (markers, links, emphasis) verbatim. */
export function harperTextPreview(md: string): string {
  return harperSafeLines(md).filter((l) => !l.skip).map((l) => l.out).join(' ').slice(0, 300)
}