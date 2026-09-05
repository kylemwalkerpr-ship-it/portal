/**
 * WYSIWYG document editor — DOM ↔ markdown gateway.
 *
 * The Document view lets the operator edit the RENDERED article exactly as a
 * word processor: bold, italics, headings, lists, links, quotes, tables.
 * The editor keeps MARKDOWN as the single source of truth (the whole
 * pipeline — gates, ship, renderTarget, caseworks — consumes markdown), so
 * the contentEditable DOM is serialized back to markdown on every edit.
 *
 * The serializer walks the SMALL trusted tag set the renderer emits
 * (h1–h3, p, strong/em/code/a, ul/ol/li, blockquote, pre, table, hr) plus
 * hidden `data-keep` placeholders holding frontmatter + JSON-LD scripts
 * verbatim. Unknown/foreign tags are unwrapped to text; pasted HTML is
 * stripped to plain text so the DOM can never be corrupted.
 */

export interface DsBlockNode {
  tag: string
  text: string
  href?: string
  children?: DsBlockNode[]
}

/** Block-level controls the toolbar can toggle at the caret/selection. */
export type DsBlockCommand =
  | 'bold'
  | 'italic'
  | 'h2'
  | 'h3'
  | 'ul'
  | 'ol'
  | 'link'
  | 'quote'
  | 'hr'
  | 'table'

/**
 * Minimal HTML tokenizer → tree, ONLY for the renderer's emitted subset.
 * Anything unrecognized is kept as a leaf `span` with its raw text so the
 * serializer degrades gracefully and never loses (or invents) content.
 */
export function parseDsHtml(html: string): DsBlockNode[] {
  const VOID = new Set(['br'])
  const BLOCK = new Set(['h1', 'h2', 'h3', 'p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'div'])
  const INLINE = new Set(['strong', 'b', 'em', 'i', 'code', 'a', 'span'])
  const KEEP = 'data-keep'

  const roots: DsBlockNode[] = []
  const stack: DsBlockNode[] = []
  const tagRe = /<\/?([a-zA-Z0-9-]+)((?:\s+[a-zA-Z0-9-]+=(?:"[^"]*"|'[^']*'|[^\s>]*))*)\s*\/?>/g
  let last = 0
  let m: RegExpExecArray | null

  const pushText = (text: string) => {
    if (!text) return
    const top = stack[stack.length - 1]
    if (!top) {
      roots.push({ tag: 'text', text })
      return
    }
    if (!top.children) top.children = []
    const tail = top.children[top.children.length - 1]
    if (tail && tail.tag === 'text') tail.text += text
    else top.children.push({ tag: 'text', text })
  }

  while ((m = tagRe.exec(html)) !== null) {
    if (m.index > last) pushText(html.slice(last, m.index))
    last = m.index + m[0].length
    const tag = m[1].toLowerCase()
    if (m[0].startsWith('</')) {
      // Close: pop the matching open tag.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          const closed = stack.splice(i)
          const node = closed[0]
          if (stack.length) {
            if (!stack[stack.length - 1].children) stack[stack.length - 1].children = []
            stack[stack.length - 1].children.push(node)
          } else {
            roots.push(node)
          }
          // Any siblings that were pushed above the closed node (malformed)
          // are appended to the node as children.
          for (const orphan of closed.slice(1)) {
            if (!node.children) node.children = []
            node.children.push(orphan)
          }
          break
        }
      }
      continue
    }
    if (VOID.has(tag)) {
      pushText(m[0])
      continue
    }
    const attrs = new Map<string, string>()
    const attrRe = /([a-zA-Z0-9-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]*))/g
    let am: RegExpExecArray | null
    while ((am = attrRe.exec(m[2] || '')) !== null) {
      attrs.set(am[1].toLowerCase(), am[2] ?? am[3] ?? am[4] ?? '')
    }
    const href = attrs.get('href')
    const node: DsBlockNode = { tag, text: '' }
    if (tag === 'a' && href) node.href = href
    if (tag !== 'br') stack.push(node)
    else pushText(node.text)
  }
  if (last < html.length) pushText(html.slice(last))
  // Close any unclosed tags.
  while (stack.length) {
    const node = stack.pop()!
    const top = stack[stack.length - 1]
    if (top) {
      if (!top.children) top.children = []
      top.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function inlineMd(node: DsBlockNode): string {
  const inner = (child: DsBlockNode): string => {
    switch (child.tag) {
      case 'text':
        return child.text
      case 'strong':
      case 'b':
        return `**${(child.children || [child]).map(inner).join('')}**`
      case 'em':
      case 'i':
        return `*${(child.children || [child]).map(inner).join('')}*`
      case 'code':
        return `\`${child.text || (child.children || []).map(inner).join('')}\``
      case 'a':
        return `[${(child.children || [child]).map(inner).join('')}](${child.href || ''})`
      default:
        return (child.children || [child]).map(inner).join('')
    }
  }
  return inner(node)
}

function tableMd(node: DsBlockNode): string {
  const rows: string[][] = []
  const walk = (n: DsBlockNode, row: string[], isHead: boolean) => {
    if (n.tag === 'tr') {
      const cells: string[] = []
      const cellWalk = (c: DsBlockNode) => {
        if (c.tag === 'th' || c.tag === 'td') cells.push(inlineMd(c).trim())
        if (c.children) for (const cc of c.children) cellWalk(cc)
      }
      for (const c of n.children || []) cellWalk(c)
      rows.push(cells)
      return
    }
    if (n.children) for (const c of n.children) walk(c, row, isHead)
  }
  for (const c of node.children || []) walk(c, [], false)
  if (!rows.length) return ''
  const colCount = Math.max(...rows.map((r) => r.length))
  const lines = [
    `| ${rows[0].join(' | ')} |`,
    `| ${Array(colCount).fill('---').join(' | ')} |`,
    ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`),
  ]
  return lines.join('\n')
}

/**
 * Serialize the trusted DOM back to markdown. `data-keep` containers are
 * emitted verbatim (frontmatter + JSON-LD survive untouched).
 */
export function serializeDsHtml(html: string): string {
  const roots = parseDsHtml(html)
  const out: string[] = []
  const emit = (node: DsBlockNode) => {
    switch (node.tag) {
      case 'h1': out.push(`# ${inlineMd(node).trim()}`); return
      case 'h2': out.push(`## ${inlineMd(node).trim()}`); return
      case 'h3': out.push(`### ${inlineMd(node).trim()}`); return
      case 'p': {
        const text = inlineMd(node).trim()
        if (text) out.push(text)
        return
      }
      case 'ul': {
        for (const li of node.children || []) {
          if (li.tag === 'li') out.push(`- ${inlineMd(li).trim()}`)
        }
        return
      }
      case 'ol': {
        let n = 1
        for (const li of node.children || []) {
          if (li.tag === 'li') out.push(`${n}. ${inlineMd(li).trim()}`)
          n++
        }
        return
      }
      case 'blockquote': {
        const text = inlineMd(node).trim()
        if (text) out.push(`> ${text}`)
        return
      }
      case 'pre': {
        const text = node.children ? inlineMd(node).trim() : node.text
        if (text) out.push('```\n' + text + '\n```')
        return
      }
      case 'table': {
        const table = tableMd(node)
        if (table) out.push(table)
        return
      }
      case 'hr': out.push('---'); return
      case 'div': {
        // Keep markers: legacy U+0000KEEPU+0000 (DOM-unsafe) and U+E000KEEPU+E000.
        const raw = (node.text || inlineMd(node) || '').trim()
        for (const prefix of ['\u0000KEEP\u0000', '\uE000KEEP\uE000'] as const) {
          if (raw.startsWith(prefix)) {
            out.push(raw.slice(prefix.length))
            return
          }
        }
        // TipTap KeepBlock may strip null markers; still emit parked payload.
        if (/^KEEP---/.test(raw) || /^KEEP<script\b/i.test(raw) || /^KEEP&lt;script\b/i.test(raw)) {
          out.push(raw.replace(/^KEEP/, ''))
          return
        }
        if (raw) out.push(raw)
        return
      }
      default: {
        const text = inlineMd(node).trim()
        if (text) out.push(text)
      }
    }
  }
  for (const node of roots) emit(node)
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}