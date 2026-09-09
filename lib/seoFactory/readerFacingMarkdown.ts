/**
 * Reader-facing markdown cleanup for editorial copy.
 *
 * Content Studio articles are not developer documentation. Models sometimes
 * return prose, headings, a Sources list, or leaked JSON inside fenced code
 * blocks. Fences make finished copy look machine-produced and hide structure
 * from downstream scanners. Keep prose that was merely fenced; drop actual
 * code/schema dumps. Valid JSON-LD belongs in <script type="application/ld+json">.
 */

export type ReaderMarkdownCleanup = {
  content: string
  changed: number
  unwrapped: number
  dropped: number
}

const PROSE_FENCE_LANG = /^(?:markdown|md|mdx|text|article|html)?$/i
const CODE_FENCE_LANG = /^(?:json|jsonld|javascript|js|typescript|ts|tsx|jsx|bash|sh|shell|python|py|yaml|yml|xml|css|sql)$/i

function proseLike(inner: string): boolean {
  const text = String(inner || '').trim()
  if (!text) return false
  if (/^#{1,6}\s+\S/m.test(text)) return true
  if (/^(?:[-*+]\s+|\d+[.)]\s+)/m.test(text) && text.split(/\s+/).length >= 12) return true
  const words = text.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
  const sentences = (text.match(/[.!?](?:\s|$)/g) || []).length
  return words >= 30 && sentences >= 2
}

/**
 * Remove fenced-code presentation from reader-facing editorial copy.
 * - prose/markdown fences are unwrapped, preserving their contents;
 * - code/schema fences are dropped;
 * - unlabeled fences are unwrapped only when they clearly contain prose.
 */
export function stripReaderFacingCodeFences(content: string): ReaderMarkdownCleanup {
  const source = String(content || '')
  let changed = 0
  let unwrapped = 0
  let dropped = 0

  const next = source.replace(
    /^```([^\n`]*)[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm,
    (_whole, rawLang: string, rawInner: string) => {
      const lang = String(rawLang || '').trim().toLowerCase()
      const inner = String(rawInner || '').trim()
      changed++

      if (PROSE_FENCE_LANG.test(lang) && proseLike(inner)) {
        unwrapped++
        return inner
      }
      if (!lang && proseLike(inner)) {
        unwrapped++
        return inner
      }
      if (CODE_FENCE_LANG.test(lang) || /"@context"\s*:\s*"https?:\/\/schema\.org/i.test(inner)) {
        dropped++
        return ''
      }

      // Unknown language: never expose it as a code card. Preserve only prose.
      if (proseLike(inner)) {
        unwrapped++
        return inner
      }
      dropped++
      return ''
    },
  )

  return {
    content: next.replace(/\n{3,}/g, '\n\n'),
    changed,
    unwrapped,
    dropped,
  }
}
