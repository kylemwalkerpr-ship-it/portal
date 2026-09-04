import { LocalLinter, Dialect, SuggestionKind, type Lint, type Suggestion } from 'harper.js'
import { binaryInlined } from 'harper.js/binaryInlined'
import { scoreHarperLints } from '@/lib/editorMetrics'
import {
  harperSafeLines,
  mapCorrectedProseToMarkdown,
  HARPER_ESTATE_WORDS,
  isHarperNoiseFinding,
  applyNonOverlappingSpanFixes,
  splitMarkdownFrontmatter,
  dialectForRegion,
  maskHarperScaffold,
} from '@/lib/harperText'

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

const linterByDialect = new Map<string, Promise<LocalLinter>>()

function dialectEnum(key: 'american' | 'british'): Dialect {
  try {
    if (key === 'british' && Dialect.British != null) return Dialect.British
  } catch { /* enum missing in this build */ }
  return Dialect.American
}

function getLinter(region?: string | null): Promise<LocalLinter> {
  const key = dialectForRegion(region)
  let pending = linterByDialect.get(key)
  if (!pending) {
    pending = (async () => {
      const dialect = dialectEnum(key)
      const linter = new LocalLinter({ binary: binaryInlined, dialect })
      await linter.setup()
      // Worker/Local: materialize default rule registry (harper.js#3490).
      try { await linter.getDefaultLintConfig() } catch { /* older builds */ }
      try {
        await linter.setDialect(dialect)
      } catch { /* constructed dialect is enough */ }
      try {
        await linter.importWords(HARPER_ESTATE_WORDS)
      } catch {
        // vocabulary import is best-effort per Harper rule set
      }
      try {
        await linter.setLintConfig({
          SentenceCapitalization: false,
          HeadingCapitalization: false,
          ProperNounCapitalization: false,
        } as Record<string, boolean>)
      } catch { /* rule keys vary by harper.js version */ }
      return linter
    })().catch((err) => {
      linterByDialect.delete(key)
      throw err
    })
    linterByDialect.set(key, pending)
  }
  return pending
}

async function lintSource(linter: LocalLinter, source: string): Promise<Lint[]> {
  try {
    return await linter.lint(source, { language: 'markdown', dedup: true })
  } catch {
    return linter.lint(source, { language: 'plaintext', dedup: true })
  }
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

function suggestionReplacement(
  s: Suggestion | null,
  span: { start: number; end: number } | null,
  source?: string,
): string | null {
  if (!s) return null
  try {
    const kind = typeof s.kind === 'function' ? s.kind() : undefined
    const repl = typeof s.get_replacement_text === 'function' ? (s.get_replacement_text() || '') : ''
    if (kind === SuggestionKind.Remove) return ''
    if (kind === SuggestionKind.InsertAfter) {
      const original = span && source ? source.slice(span.start, span.end) : ''
      return `${original}${repl}`
    }
    if (kind === SuggestionKind.Replace || repl.length > 0 || (span && span.end > span.start)) return repl
  } catch { /* kind/text optional */ }
  return null
}

export async function runHarperGrammar(
  md: string,
  signal?: AbortSignal,
  region?: string | null,
  extraWords?: string[],
): Promise<HarperLintSummary | null> {
  try {
    const linter = await getLinter(region)
    if (extraWords?.length) {
      try {
        await linter.importWords(extraWords.map((w) => String(w || '').trim()).filter(Boolean).slice(0, 80))
      } catch { /* vocabulary is best-effort */ }
    }
    if (signal?.aborted) return null
    const { body } = splitMarkdownFrontmatter(String(md || ''))
    const source = body.trim().length >= 80 ? maskHarperScaffold(body) : harperSafeLines(String(md || '')).filter((l) => !l.skip).map((l) => l.out).join('\n')
    if (source.trim().length < 80) {
      return { score: 100, errors: 0, suggestions: 0, items: [] }
    }
    const lints: Lint[] = await lintSource(linter, source)
    if (signal?.aborted) return null
    const kept = lints.filter(keepLint)
    const mapped = []
    for (const l of kept) {
      const problem = l.get_problem_text?.() || ''
      let fix: string | undefined
      try {
        const list = l.suggestions()
        const s = list && list.length ? list[0] : null
        const span = l.span?.()
        const repl = suggestionReplacement(s, span || null, source)
        if (repl != null) fix = repl
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
      .slice(0, 48)
      .map((m) => ({
        kind: m.kind,
        problem: m.problem.slice(0, 120),
        message: m.message.slice(0, 200),
        fix: m.fix?.slice(0, 160),
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
export async function applyHarperProblem(md: string, problem: string, region?: string | null): Promise<HarperAutofixResult> {
  const needle = String(problem || '').trim()
  if (!needle) return { content: String(md || ''), applied: 0, items: [] }
  return fixHarperIssues(md, needle, region)
}

export async function fixHarperIssues(md: string, onlyProblem?: string, region?: string | null): Promise<HarperAutofixResult> {
  const original = String(md || '')
  try {
    const linter = await getLinter(region)
    const allowed = new Set([
      'Spelling', 'Grammar', 'Punctuation', 'Nonstandard', 'WordOrder',
      'Repetition', 'Agreement', 'Typo', 'WordChoice', 'RepeatedWords',
    ])
    const { fm, body } = splitMarkdownFrontmatter(original)
    let currentBody = body
    let applied = 0
    const items: HarperAutofixResult['items'] = []
    const seen = new Set<string>()
    for (let round = 0; round < 16; round++) {
      if (currentBody.trim().length < 40) break
      const lints = (await lintSource(linter, maskHarperScaffold(currentBody))).filter(keepLint)
      const spanFixes: Array<{ start: number; end: number; replacement: string; kind: string; problem: string; message: string }> = []
      for (const l of lints) {
        const kind = l.lint_kind() || ''
        if (!allowed.has(kind) && !allowed.has(kindOf(l))) continue
        const problem = String(l.get_problem_text?.() || '').trim()
        if (!problem) continue
        const span = l.span?.()
        if (!span) continue
        let suggestion: Suggestion | null = null
        try {
          const list = l.suggestions()
          suggestion = list && list.length ? list[0] : null
        } catch {
          suggestion = null
        }
        const replacement = suggestionReplacement(suggestion, span, currentBody)
        if (replacement == null) continue
        if (isHarperNoiseFinding({ kind: kindOf(l), problem, message: l.message?.() || '', fix: replacement })) continue
        if (onlyProblem && problem !== onlyProblem && !problem.includes(onlyProblem) && !onlyProblem.includes(problem)) continue
        const finger = `${kind}:${problem}:${span.start}`
        if (seen.has(finger)) continue
        if (kind === 'Spelling' && problem.toLowerCase() === replacement.toLowerCase()) continue
        spanFixes.push({
          start: span.start,
          end: span.end,
          replacement,
          kind: kindOf(l),
          problem,
          message: l.message?.() || '',
        })
      }
      if (!spanFixes.length) break
      const pass = applyNonOverlappingSpanFixes(currentBody, spanFixes)
      if (pass.applied === 0) {
        // Harper span apply missed — last resort: applySuggestion one-at-a-time on markdown body
        let progressed = false
        for (const l of lints) {
          const problem = String(l.get_problem_text?.() || '').trim()
          if (onlyProblem && problem !== onlyProblem) continue
          const list = (() => { try { return l.suggestions() } catch { return [] } })()
          const suggestion = list && list[0]
          if (!suggestion) continue
          try {
            const next = await linter.applySuggestion(currentBody, l, suggestion)
            if (typeof next === 'string' && next !== currentBody) {
              currentBody = next
              applied++
              progressed = true
              if (items.length < 48) {
                items.push({
                  kind: kindOf(l),
                  problem: problem.slice(0, 120),
                  message: (l.message?.() || '').slice(0, 200),
                  fix: suggestionReplacement(suggestion, null, currentBody) || undefined,
                })
              }
              if (onlyProblem) break
            }
          } catch { /* try next lint */ }
        }
        if (!progressed) break
        if (onlyProblem) break
        continue
      }
      for (const f of spanFixes) {
        seen.add(`${f.kind}:${f.problem}:${f.start}`)
        if (items.length < 48) {
          items.push({
            kind: f.kind,
            problem: f.problem.slice(0, 120),
            message: f.message.slice(0, 200),
            fix: f.replacement.slice(0, 160) || undefined,
          })
        }
      }
      currentBody = pass.text
      applied += pass.applied
      if (onlyProblem) break
    }
    const content = fm ? `${fm}${currentBody}` : currentBody
    return { content, applied, items }
  } catch (err) {
    linterByDialect.clear()
    console.info('[harper] autofix skipped:', String((err as Error)?.message || err).slice(0, 120))
    return { content: original, applied: 0, items: [] }
  }
}

/** Replace the changed words in `src` with the corrected words in `out`,
 *  preserving everything else (markers, links, emphasis) verbatim. */
export function harperTextPreview(md: string): string {
  return harperSafeLines(md).filter((l) => !l.skip).map((l) => l.out).join(' ').slice(0, 300)
}