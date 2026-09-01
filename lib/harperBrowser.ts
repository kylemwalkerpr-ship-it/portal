import { LocalLinter, Dialect, type Lint } from 'harper.js'
import { binaryInlined } from 'harper.js/binaryInlined'
import { extractProse, scoreHarperLints } from '@/lib/editorMetrics'

/**
 * Browser-side Harper.js grammar service. The 20MB WASM binary is loaded
 * lazily (the inlined build — no separate .wasm request, no Next webpack
 * config) the first time the editor needs a grammar pass, then reused for
 * the session. Runs fully on-device: article text never leaves the browser
 * for grammar/spelling.
 */

let linterPromise: Promise<LocalLinter> | null = null

function getLinter(): Promise<LocalLinter> {
  if (!linterPromise) {
    linterPromise = (async () => {
      const linter = new LocalLinter({ binary: binaryInlined, dialect: Dialect.American })
      await linter.setup()
      return linter
    })()
  }
  return linterPromise
}

export type HarperLintSummary = {
  score: number
  errors: number
  suggestions: number
  items: Array<{ kind: string; problem: string; message: string }>
}

export async function runHarperGrammar(md: string, signal?: AbortSignal): Promise<HarperLintSummary | null> {
  try {
    const linter = await getLinter()
    if (signal?.aborted) return null
    // Trim to prose + headings the checker understands (markdown mode skips
    // code blocks and URLs; keep the article surface readable for it).
    const text = String(md || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .slice(0, 60_000)
    if (text.trim().length < 80) {
      return { score: 100, errors: 0, suggestions: 0, items: [] }
    }
    const opts: { language: 'markdown'; dedup: boolean } = { language: 'markdown', dedup: true }
    const lints: Lint[] = await linter.lint(text, opts)
    if (signal?.aborted) return null
    const mapped = lints.map((l) => ({
      kind: l.lint_kind_pretty() || l.lint_kind(),
      problem: l.get_problem_text?.() || '',
      message: l.message?.() || '',
      span: l.span?.(),
    }))
    const { score, errors, suggestions } = scoreHarperLints(mapped)
    const items = mapped
      .filter((m) => m.problem.trim().length > 0)
      .slice(0, 24)
      .map((m) => ({ kind: m.kind, problem: m.problem.slice(0, 120), message: m.message.slice(0, 200) }))
    return { score, errors, suggestions, items }
  } catch (err) {
    // Harper/WASM unavailable (privacy mode, unsupported browser) — silently
    // degrade to "no grammar signal" rather than pollute the editor.
    console.info('[harper] grammar pass skipped:', String((err as Error)?.message || err).slice(0, 120))
    return null
  }
}

/** Deterministic word count used to decide whether a grammar pass is worth it. */
export function harperTextPreview(md: string): string {
  return extractProse(md).slice(0, 300)
}