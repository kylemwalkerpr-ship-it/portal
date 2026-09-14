/**
 * Ship-blocker surfacing + coherent repair policy.
 *
 * Every ship-blocking finding must reach the editor, the refine prompt, and
 * the job payload. Exact twins (same code + message + evidence) collapse;
 * distinct instances of the same code (two kit-piece H2s) do not. An
 * empty-evidence copy of a finding that already has evidence is a twin.
 *
 * Repair copy keeps one human article: meaning coverage, connective tissue,
 * no keyword paste, no independent mini-essays.
 */

import { lookupGate } from './contentQualityPlaybook'

export type SurfacedBlocker = {
  code: string
  message: string
  fix: string
  evidence?: string
}

const STUFFING_FIX_RE = /first H2, In 60 seconds|checklist item|must include keyword/i

/** Codes whose repair is connective tissue, not a local paste. */
export const WHOLE_ARTICLE_BLOCKER_CODES: ReadonlySet<string> = new Set([
  'keyword_stuffing',
  'adjacent_section_overlap',
  'adjacent_section_overlap_severe',
  'stuffed_primary_opener',
  'stuffed_primary_opener_severe',
  'kit_section_opener',
  'missing_short_keyword',
  'missing_long_tail_keyword',
  'missing_outline_section',
  'word_count',
  'thin_content',
])

export function isWholeArticleBlocker(code: string): boolean {
  return WHOLE_ARTICLE_BLOCKER_CODES.has(String(code || '').trim())
}

export function blockerInstanceKey(f: {
  code?: string
  message?: string
  evidence?: string
}): string {
  return `${String(f.code || '').trim()}\n${String(f.message || '').trim()}\n${String(f.evidence || '').trim()}`
}

function softInstanceKey(code: string, message: string): string {
  return `${code}\n${message}`
}

/** Collapse only exact twins. Never drop a distinct ship-blocking instance. */
export function surfaceShipBlockers(
  findings: Array<{
    code?: string
    message?: string
    fix?: string
    evidence?: string
    severity?: string
  }>,
): SurfacedBlocker[] {
  const out: SurfacedBlocker[] = []
  const seenExact = new Set<string>()
  const indexBySoft = new Map<string, number>()
  for (const f of findings || []) {
    const code = String(f.code || '').trim()
    if (!code) continue
    const severity = String(f.severity || 'blocker')
    if (severity !== 'blocker' && severity !== 'format_blocker') continue
    const message = String(f.message || code).replace(/\s+/g, ' ').trim().slice(0, 400)
    const evidence = String(f.evidence || '').trim().slice(0, 240)
    const exact = `${code}\n${message}\n${evidence}`
    if (seenExact.has(exact)) continue
    seenExact.add(exact)
    const soft = softInstanceKey(code, message)
    const existingIdx = indexBySoft.get(soft)
    if (!evidence && existingIdx != null) continue
    const item: SurfacedBlocker = {
      code,
      message,
      fix: coherentBlockerFix(code, f),
      evidence: evidence || undefined,
    }
    if (existingIdx != null && !out[existingIdx].evidence && evidence) {
      out[existingIdx] = item
      continue
    }
    indexBySoft.set(soft, out.length)
    out.push(item)
  }
  return out
}

export function coherentBlockerFix(
  code: string,
  finding?: { message?: string; fix?: string },
): string {
  const supplied = String(finding?.fix || '').trim()
  const usable = supplied && !STUFFING_FIX_RE.test(supplied) ? supplied : ''
  const coherent = coherentFixForCode(code)
  if (usable && coherent && usable !== coherent) return `${usable} ${coherent}`
  return usable || coherent || lookupGate(code)?.promptInstruction || 'Fix this blocker without stuffing keywords or splicing kit pieces.'
}

function coherentFixForCode(code: string): string {
  switch (code) {
    case 'keyword_stuffing':
    case 'adjacent_section_overlap_severe':
    case 'adjacent_section_overlap':
    case 'stuffed_primary_opener':
    case 'stuffed_primary_opener_severe':
    case 'kit_section_opener':
      return 'Rewrite as ONE article: each H2 must continue the previous H2. Cover keywords as topics, not a checklist. Do not splice independent mini-essays.'
    case 'missing_short_keyword':
    case 'missing_long_tail_keyword':
      return 'Cover the missing demand as a topic in a grammatical sentence that already belongs in the argument. Meaning coverage beats exact-string placement. Never paste into the first content H2, In 60 seconds, a heading, or an FAQ question.'
    case 'missing_outline_section':
      return 'Insert the missing H2 as a chapter of this article. Open with a bridge from the previous section. Do not write a standalone mini-guide.'
    case 'word_count':
    case 'thin_content':
      return 'Expand existing sections with concrete procedures, documents, and constraints. Do not pad a heading into an independent mini-essay and do not stuff keywords.'
    case 'sentence_start_repetition':
      return 'Vary sentence openings in service of the argument. Do not shuffle prefixes just to beat the scanner.'
    case 'missing_disclaimer':
      return 'Add the educational / not-legal-advice disclaimer near the end. Do not wrap the article in a code fence.'
    default:
      return ''
  }
}

/** Prompt stanza so a local fix cannot turn the draft back into kit pieces. */
export function coherentRepairPolicyBlock(
  blockers: Array<{ code?: string }>,
): string {
  const needs = (blockers || []).some((b) => isWholeArticleBlocker(String(b.code || '')))
  if (!needs) return ''
  return [
    'COHERENCE (do not break the human draft):',
    '- Keep ONE argument. Each H2 continues the previous H2.',
    '- Cover missing demand as topics in grammatical sentences that already belong.',
    '- Never paste keywords into the first content H2, In 60 seconds, a heading, or an FAQ question.',
    '- Rewrite kit-piece openings as bridges (consequence, constraint, next decision).',
    '- Expand thin sections in place. Do not splice independent mini-essays.',
  ].join('\n')
}

export function formatAllBlockerCodes(blockers: Array<{ code?: string }>): string {
  return [...new Set(blockers.map((b) => String(b.code || '').trim()).filter(Boolean))].join(', ')
}

export function formatAllBlockerMessages(
  blockers: Array<{ message?: string; code?: string }>,
  perMessage = 160,
): string {
  return blockers
    .map((b) => String(b.message || b.code || '').replace(/\s+/g, ' ').trim().slice(0, perMessage))
    .filter(Boolean)
    .join('; ')
}

export function refineNotesForBlockers(
  blockers: Array<{ code?: string; message?: string; fix?: string; evidence?: string }>,
): string[] {
  const lines = surfaceShipBlockers(blockers.map((b) => ({ ...b, severity: 'blocker' }))).map((b) => {
    if (b.code === 'sentence_start_repetition') {
      const ev = String(b.evidence || '?')
      return `- BLOCKER [sentence_start_repetition]: Your sentence openings are repetitive. The pattern "${ev}…" repeats too often. TARGETED FIX: rewrite every other matching opening so it serves the argument. Keep the throughline — do not shuffle prefixes just to beat the scanner.`
    }
    if (b.code === 'outcome_promise') {
      return '- BLOCKER [outcome_promise]: Remove affirmative promises about approval, success, timelines, or results. Do not repeat the flagged wording or discuss this instruction in the article.'
    }
    if (b.code === 'missing_disclaimer') {
      return (
        '- BLOCKER [missing_disclaimer]: The page has NO disclaimer and YMYL rules forbid shipping without one. Add this exact block near the end (before or inside Sources), as markdown — never wrap the article or this block in a code fence:\n' +
        '  **Disclaimer:** This page is educational and editorial only. It is **not legal advice**. ' +
        'Immigration rules change; verify every requirement against official government sources and consult a ' +
        'licensed attorney, solicitor, or registered migration agent for your situation.'
      )
    }
    return `- BLOCKER [${b.code}]: ${b.message}${b.fix ? ` → ${b.fix}` : ''}`
  })
  const policy = coherentRepairPolicyBlock(blockers)
  if (policy) lines.push(policy)
  return lines
}

/** Every warning instance, never a silent cap. */
export function refineNotesForWarnings(
  warnings: Array<{ code?: string; message?: string; fix?: string }>,
): string[] {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const w of warnings || []) {
    const code = String(w.code || '').trim()
    const message = String(w.message || code).replace(/\s+/g, ' ').trim()
    if (!code) continue
    const key = `${code}\n${message}`
    if (seen.has(key)) continue
    seen.add(key)
    const fix = coherentBlockerFix(code, w)
    lines.push(`- WARNING [${code}]: ${message}${fix ? ` → ${fix}` : ''}`)
  }
  return lines
}

/** Slim payload objects for GET/list — keep every instance, shorten text. */
export function slimBlockersForClient(blockers: unknown): unknown {
  if (!Array.isArray(blockers)) return blockers
  return surfaceShipBlockers(
    blockers.map((raw) => {
      const b = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      return {
        code: String(b.code || ''),
        message: String(b.message || ''),
        fix: String(b.fix || ''),
        evidence: typeof b.evidence === 'string' ? b.evidence : undefined,
        severity: 'blocker',
      }
    }),
  )
}
