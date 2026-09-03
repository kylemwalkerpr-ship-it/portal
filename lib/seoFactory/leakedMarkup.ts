/**
 * Convert or strip HTML that leaked into markdown drafts as visible text
 * (`<details>`, `</div>`, `<summary>…`). The document editor escapes tags,
 * so collapsible HTML shows as characters unless we fold it back to markdown.
 */

const SCRIPT_HOLD = '%%YS_SCRIPT_'

function restoreScripts(s: string, scripts: string[]): string {
  return s.replace(new RegExp(`${SCRIPT_HOLD}(\\d+)%%`, 'g'), (_, i) => scripts[Number(i)] || '')
}

function holdScripts(md: string): { text: string; scripts: string[] } {
  const scripts: string[] = []
  const text = String(md || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
    scripts.push(block)
    return `\n\n${SCRIPT_HOLD}${scripts.length - 1}%%\n\n`
  })
  return { text, scripts }
}

function innerText(html: string): string {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fold well-formed <details><summary>…</summary>…</details> into ### markdown. */
export function convertDetailsBlocksToMarkdown(md: string): string {
  let s = String(md || '')
  for (let i = 0; i < 8; i++) {
    const next = s.replace(
      /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
      (_m, summary: string, body: string) => {
        const title = innerText(summary) || 'Details'
        const inner = String(body || '').trim()
        return `\n\n### ${title}\n\n${inner}\n\n`
      },
    )
    if (next === s) break
    s = next
  }
  return s
}

/**
 * Remove leftover structural tags that would otherwise print in Document view.
 * JSON-LD <script> blocks are preserved. Emphasis tags become markdown.
 */
export function stripLeakedHtmlTags(md: string): string {
  const held = holdScripts(String(md || ''))
  let s = convertDetailsBlocksToMarkdown(held.text)
  s = s
    .replace(/<\/?(?:strong|b)\b[^>]*>/gi, '**')
    .replace(/<\/?(?:em|i)\b[^>]*>/gi, '*')
    .replace(/<\/?(?:details|summary|div|span|section|article|header|footer|aside|main|nav|figure|figcaption|button|label)\b[^>]*>/gi, '')
    .replace(/<\/[a-z][a-z0-9]*\s*>/gi, '')
    .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
  return restoreScripts(s, held.scripts)
}

export function sanitizeLeakedMarkup(md: string): string {
  return stripLeakedHtmlTags(md).trimEnd() + (String(md || '').endsWith('\n') ? '\n' : '')
}
