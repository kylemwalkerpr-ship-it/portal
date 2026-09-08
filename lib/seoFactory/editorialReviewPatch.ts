import { anchorHash, applyEditorPatch, parseEditorPatch } from './editorPatch'
import { maskHarperScaffold, splitMarkdownFrontmatter } from '../harperText'

/** Editorial model edits prose only. Facts and publishing structure belong to the brief/gate. */
export function applyEditorialReviewPatch(content: string, raw: string): { content: string; clean: boolean } {
  const parsed = parseEditorPatch(raw)
  if (!parsed.ok) throw new Error('reason' in parsed ? parsed.reason : 'Editorial patch is invalid')
  if (!parsed.patch.operations.length) return { content, clean: true }
  const { body } = splitMarkdownFrontmatter(content)
  const mask = maskHarperScaffold(body).split('\n')
  const lines = body.split('\n')
  const editable = new Set(lines.filter((line, i) => line.trim() && mask[i] === line && !/^\s*(?:#|\||<|```|~~~)/.test(line)).map(l => l.trim()))
  const tokens = (text: string) => (text.match(/https?:\/\/[^\s)]+|\b\d[\w.,%/-]*|\b(?:must|not|never|may|cannot|unless)\b/gi) || []).sort().join('|')
  for (const op of parsed.patch.operations) {
    if (op.kind !== 'replace' || !editable.has(op.anchor.trim())) throw new Error('Editorial edit must replace an existing prose line')
    if (/\n|<|^\s*#/.test(op.replacement)) throw new Error('Editorial edit cannot introduce markup or sections')
    if (tokens(op.anchor) !== tokens(op.replacement)) throw new Error('Editorial edit changed a URL, number or legal qualification')
  }
  const patch = { ...parsed.patch, operations: parsed.patch.operations.map(op => ({ ...op, expectedHash: anchorHash(content, op.anchor) || '' })) }
  const result = applyEditorPatch(content, patch, { outstanding: [{ code: 'editorial_review', repairClass: 'targeted_ai' }] })
  if (!result.ok) throw new Error('reason' in result ? result.reason : 'Editorial patch was rejected')
  return { content: result.content, clean: false }
}
