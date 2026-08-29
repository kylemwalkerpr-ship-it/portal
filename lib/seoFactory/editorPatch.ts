/**
 * Structured EditorPatch contract and deterministic applier (brief §5.3).
 *
 * The reviewer never returns a free-form complete document as the primary
 * repair protocol. It returns a bounded list of operations, each bound to an
 * outstanding registered `targeted_ai` finding, an anchor that exists exactly
 * once, and the hash of the anchored original text. The applier is pure and
 * deterministic: any violation rejects the WHOLE patch and leaves the
 * accepted document untouched.
 *
 * Milestone B scope: validator + applier used by tests, the bounded loop, and
 * shadow mode in the reaudit route. It does not replace the live editor flow.
 */

import { repairClassFor, type RepairClass } from './contentQualityPlaybook'
import {
  computeDocumentFingerprint,
  fingerprintViolations,
  textHash,
  normalizeHeadingText,
  type PreservationViolation,
} from './documentFingerprint'

export type EditorPatchOperation =
  | { kind: 'replace'; findingCode: string; anchor: string; expectedHash: string; replacement: string }
  | { kind: 'insert_after'; findingCode: string; anchor: string; expectedHash: string; insertion: string }
  | { kind: 'remove'; findingCode: string; anchor: string; expectedHash: string }

export type EditorPatch = {
  version: 1
  operations: EditorPatchOperation[]
}

export type PatchRejection = { ok: false; reason: string; findingCode?: string }
export type PatchApplyOk = { ok: true; content: string; applied: string[]; violations: [] }
export type PatchPreservationRejected = {
  ok: false
  reason: 'editor_preservation_rejected'
  findingCode?: string
  violations: PreservationViolation[]
  /** The accepted document is untouched — the caller keeps the original. */
  content: null
}

export type PatchApplyResult = PatchApplyOk | PatchRejection | PatchPreservationRejected

export type OutstandingFinding = { code: string; repairClass?: RepairClass }

/** Default operation cap — one named budget, no hidden magic numbers. */
export const EDITOR_PATCH_MAX_OPERATIONS = 12

const FRONTMATTER_DELIMITER_RE = /^---\s*$/m
const SCRIPT_TAG_RE = /<script/i
const CODE_FENCE_RE = /^\s*```/m
const HEADING_LINE_RE = /^\s*#{1,6}\s+/

export function isEditorPatchShape(value: unknown): value is EditorPatch {
  if (!value || typeof value !== 'object') return false
  const p = value as { version?: unknown; operations?: unknown }
  if (p.version !== 1) return false
  if (!Array.isArray(p.operations)) return false
  for (const op of p.operations) {
    if (!op || typeof op !== 'object') return false
    const o = op as Record<string, unknown>
    if (o.kind !== 'replace' && o.kind !== 'insert_after' && o.kind !== 'remove') return false
    if (typeof o.findingCode !== 'string' || typeof o.anchor !== 'string' || typeof o.expectedHash !== 'string') return false
    if (o.kind === 'replace' && typeof o.replacement !== 'string') return false
    if (o.kind === 'insert_after' && typeof o.insertion !== 'string') return false
  }
  return true
}

/** Parse a raw provider response into an EditorPatch; reject anything else. */
export function parseEditorPatch(raw: string): { ok: true; patch: EditorPatch } | { ok: false; reason: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'patch is not valid JSON' }
  }
  // Tolerate a patch wrapped in a code fence or prose.
  if (!isEditorPatchShape(parsed)) {
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) {
      try {
        const inner = JSON.parse(fence[1].trim())
        if (isEditorPatchShape(inner)) return { ok: true, patch: inner }
      } catch {
        /* fall through */
      }
    }
    return { ok: false, reason: 'patch does not match the EditorPatch v1 contract' }
  }
  return { ok: true, patch: parsed }
}

type LocatedLine = { index: number; text: string }

function findAnchorLines(lines: string[], anchor: string): LocatedLine[] {
  const trimmed = anchor.trim()
  const exact = lines.map((text, index) => ({ index, text })).filter((l) => l.text.trim() === trimmed)
  if (exact.length) return exact
  // Substring fallback for long anchors — must still be unique.
  const partial = lines.map((text, index) => ({ index, text })).filter((l) => l.text.trim().includes(trimmed))
  return partial
}

/** A `remove` on a heading removes the heading and its body until the next heading of <= level. */
function removeSpanForHeading(lines: string[], headingIndex: number): number {
  const m = lines[headingIndex].match(/^\s*(#{1,6})\s/)
  const level = m ? m[1].length : 6
  let end = headingIndex + 1
  while (end < lines.length) {
    const hm = lines[end].match(/^\s*(#{1,6})\s/)
    if (hm && hm[1].length <= level) break
    end++
  }
  return end
}

function isInsideProtectedRegion(lines: string[], lineIndex: number): boolean {
  // Frontmatter: between leading --- fences.
  let inFm = false
  let fmEnd = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i])) {
      if (!inFm) inFm = true
      else { fmEnd = i; break }
    }
  }
  if (fmEnd >= 0 && lineIndex <= fmEnd) return true
  // JSON-LD script blocks.
  let inScript = false
  for (let i = 0; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i]) && i <= fmEnd) continue
    if (/<script[^>]*application\/ld\+json/i.test(lines[i])) inScript = true
    if (inScript && lineIndex === i) return true
    if (inScript && /<\/script>/i.test(lines[i])) inScript = false
  }
  return false
}

function introducedForbiddenSyntax(text: string, opKind: string, anchorIsHeading: boolean): string | null {
  if (FRONTMATTER_DELIMITER_RE.test(text)) return 'edit introduces frontmatter delimiters'
  if (SCRIPT_TAG_RE.test(text)) return 'edit introduces a <script> (schema is scaffold-generated, never model-authored)'
  if (CODE_FENCE_RE.test(text)) return 'edit introduces a code fence'
  if (HEADING_LINE_RE.test(text) && !anchorIsHeading) return 'edit introduces a heading outside the targeted anchor'
  if (opKind === 'replace' && text.includes('](http') && !anchorIsHeading) {
    // Link edits must target the line that owns the link (checked via anchor content in caller).
  }
  return null
}

/**
 * Validate and atomically apply an EditorPatch. Every operation must be
 * authorized by an outstanding registered `targeted_ai` finding; anything
 * else — invalid JSON, unknown/unregistered codes, missing or ambiguous
 * anchors, hash mismatches, non-local edits, frontmatter/JSON-LD/schema
 * tampering — rejects the full patch with the accepted document untouched.
 */
export function applyEditorPatch(
  content: string,
  patch: EditorPatch,
  opts: { outstanding: OutstandingFinding[]; maxOperations?: number },
): PatchApplyResult {
  const maxOps = opts.maxOperations ?? EDITOR_PATCH_MAX_OPERATIONS
  if (!patch || !Array.isArray(patch.operations)) {
    return { ok: false, reason: 'patch does not match the EditorPatch v1 contract' }
  }
  if (patch.operations.length === 0) return { ok: false, reason: 'patch has no operations' }
  if (patch.operations.length > maxOps) {
    return { ok: false, reason: `patch exceeds the operation cap (${patch.operations.length} > ${maxOps})` }
  }

  const outstanding = new Map(opts.outstanding.map((f) => [f.code, f]))
  const lines = content.split('\n')
  const before = computeDocumentFingerprint(content)
  const targetedHeadings: string[] = []
  const targetedAnchors: string[] = []
  const seenAnchors = new Set<string>()

  // Validate every operation against the PRE-patch document first — atomicity.
  type Planned = { op: EditorPatchOperation; start: number; end: number; original: string }
  const planned: Planned[] = []
  for (const op of patch.operations) {
    const found = outstanding.get(op.findingCode)
    if (!found) {
      return { ok: false, reason: `finding "${op.findingCode}" is not outstanding`, findingCode: op.findingCode }
    }
    let repairClass: RepairClass
    try {
      repairClass = found.repairClass ?? repairClassFor(op.findingCode)
    } catch {
      return { ok: false, reason: `finding "${op.findingCode}" is not registered in the playbook`, findingCode: op.findingCode }
    }
    if (repairClass !== 'targeted_ai') {
      return {
        ok: false,
        reason: `finding "${op.findingCode}" has repair class "${repairClass}" — only targeted_ai findings are patchable`,
        findingCode: op.findingCode,
      }
    }
    if (seenAnchors.has(op.anchor)) {
      return { ok: false, reason: `duplicate anchor in patch: "${op.anchor}"`, findingCode: op.findingCode }
    }
    seenAnchors.add(op.anchor)

    const matches = findAnchorLines(lines, op.anchor)
    if (matches.length === 0) {
      return { ok: false, reason: `anchor not found: "${op.anchor.slice(0, 80)}"`, findingCode: op.findingCode }
    }
    if (matches.length > 1) {
      return { ok: false, reason: `anchor is ambiguous (${matches.length} matches): "${op.anchor.slice(0, 80)}"`, findingCode: op.findingCode }
    }
    const match = matches[0]
    if (textHash(match.text) !== op.expectedHash) {
      return { ok: false, reason: `expectedHash mismatch for anchor "${op.anchor.slice(0, 80)}" — the document changed under the patch`, findingCode: op.findingCode }
    }
    if (isInsideProtectedRegion(lines, match.index)) {
      return { ok: false, reason: 'anchor targets frontmatter or JSON-LD — not model-editable', findingCode: op.findingCode }
    }
    const anchorIsHeading = /^\s*#{1,6}\s/.test(match.text)

    if (op.kind === 'replace' || op.kind === 'insert_after') {
      const text = op.kind === 'replace' ? op.replacement : op.insertion
      const forbidden = introducedForbiddenSyntax(text, op.kind, anchorIsHeading)
      if (forbidden) return { ok: false, reason: forbidden, findingCode: op.findingCode }
    }
    if (anchorIsHeading) targetedHeadings.push(op.anchor)
    targetedAnchors.push(match.text.trim())
    if (op.kind === 'replace') {
      // The replacement lines are the targeted region on the AFTER side —
      // links/citations there are exactly what the finding authorized.
      for (const l of op.replacement.split('\n')) targetedAnchors.push(l.trim())
    }
    if (op.kind === 'replace' && /^\s*#{1,6}\s/.test(op.replacement)) {
      // Heading replacement must preserve the level.
      const beforeLevel = (match.text.match(/^\s*(#{1,6})\s/) || [])[1]?.length
      const afterLevel = (op.replacement.match(/^\s*(#{1,6})\s/) || [])[1]?.length
      if (beforeLevel && afterLevel && beforeLevel !== afterLevel) {
        return { ok: false, reason: `heading level change ${beforeLevel} -> ${afterLevel} is not permitted`, findingCode: op.findingCode }
      }
      targetedHeadings.push(op.replacement)
    }
    const end = op.kind === 'remove' && anchorIsHeading ? removeSpanForHeading(lines, match.index) : match.index + 1
    planned.push({ op, start: match.index, end, original: lines.slice(match.index, end).join('\n') })
  }

  // Apply bottom-up so indices stay valid.
  const working = [...lines]
  const applied: string[] = []
  planned.sort((a, b) => b.start - a.start)
  for (const { op, start, end, original } of planned) {
    if (op.kind === 'replace') working.splice(start, end - start, ...op.replacement.split('\n'))
    else if (op.kind === 'insert_after') working.splice(end, 0, ...op.insertion.split('\n'))
    else working.splice(start, end - start)
    applied.push(`${op.kind}:${op.findingCode}`)
  }

  const afterContent = working.join('\n')
  const after = computeDocumentFingerprint(afterContent)
  const violations = fingerprintViolations(before, after, {
    targetedHeadings,
    targetedAnchors,
  })
  if (violations.length) {
    return { ok: false, reason: 'editor_preservation_rejected', violations, content: null }
  }
  return { ok: true, content: afterContent, applied, violations: [] }
}

/** Convenience: hash of an anchored original line (what the model must echo back). */
export function anchorHash(content: string, anchor: string): string | null {
  const lines = content.split('\n')
  const matches = findAnchorLines(lines, anchor)
  if (matches.length !== 1) return null
  return textHash(matches[0].text)
}

export { normalizeHeadingText }
