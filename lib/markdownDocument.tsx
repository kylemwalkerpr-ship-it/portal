/**
 * Word-style markdown → React document renderer for the Content Studio
 * draft "Document" view. Renders the draft the way it will read on the live
 * page: a clean paper document with serif body, sans headings (the Medium
 * typography split), real tables, ordered lists, and blockquote callouts.
 *
 * No external deps (keeps the Worker bundle small). Covers the same block
 * set the markdownToBlogJsx renderer emits on the live page, so the in-studio
 * reading view matches what ships.
 */
import React from 'react'

const FONT_SANS =
  "var(--portal-font-sans, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif)"
const FONT_SERIF = "var(--portal-font-display, Georgia, 'Times New Roman', serif)"
const FONT_MONO =
  "var(--portal-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)"

const INK = '#1F2937'
const MUTED = '#6B7280'

function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('`')) {
      parts.push(
        <code key={key++} style={codeStyle}>
          {tok.slice(1, -1)}
        </code>,
      )
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      parts.push(<em key={key++}>{tok.slice(1, -1)}</em>)
    } else if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      if (lm) {
        parts.push(
          <a key={key++} href={lm[2]} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            {lm[1]}
          </a>,
        )
      } else {
        parts.push(tok)
      }
    }
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : [text]
}

/** Render a pipe-table row (cells separated by |) into <td>/<th>. */
function tableRow(cells: string[], Cell: 'td' | 'th', key: number): React.ReactNode {
  return (
    <tr key={key}>
      {cells.map((c, i) => {
        const clean = c.trim().replace(/^\|/, '').replace(/\|$/, '')
        return (
          <Cell key={i} style={Cell === 'th' ? thStyle : tdStyle}>
            {inline(clean)}
          </Cell>
        )
      })}
    </tr>
  )
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')
}

/**
 * Prose-only source for the live-site document preview. Drops YAML, JSON-LD
 * scripts, and trailing incomplete schema so the stream does not render as a
 * raw `{ "@context": ... }` dump.
 */
const FM_KEYS = new Set([
  'title',
  'content_type',
  'primaryKeyword',
  'description',
  'metaDescription',
  'region',
  'canonicalUrl',
  'canonical',
  'robots',
  'ogImage',
  'og:image',
  'image',
])

export function documentPreviewSource(source: string): string {
  let md = String(source || '')
  if (md.startsWith('---')) {
    const end = md.indexOf('\n---', 3)
    if (end !== -1) {
      // Complete frontmatter block — strip it and any trailing blank lines.
      md = md.slice(end + 4).replace(/^\n+/, '')
    } else {
      // Streaming frontmatter: the model has emitted `---` but not closed it
      // yet. Strip everything up to the first real heading so the preview does
      // not show raw YAML tokens (`title:`, `description:`) as prose.
      const firstHeading = md.search(/\n#[ \t]+/)
      md = firstHeading !== -1 ? md.slice(firstHeading + 1).replace(/^\n+/, '') : ''
    }
  }
  // Streaming can also leave stray frontmatter keys before the first heading.
  // Only strip a contiguous run of known frontmatter keys at the top of the
  // body, so normal prose like "Note: this is important" is never removed.
  const lines = md.split('\n')
  let cut = 0
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) { cut = i + 1; continue }
    if (/^---$/.test(t)) { cut = i + 1; continue }
    const m = t.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (m && FM_KEYS.has(m[1])) { cut = i + 1; continue }
    break
  }
  if (cut > 0) md = lines.slice(cut).join('\n')

  md = md.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
  md = md.replace(/<script\b[^>]*>[\s\S]*$/i, '\n')
  md = md.replace(/```(?:json|ld\+json|html)[\s\S]*?```/gi, '\n')
  md = md.replace(/\{[\s\n]*"@context"\s*:\s*"https?:\/\/schema\.org"[\s\S]*?(?:\n\s*\}[\s\n]*|$)/g, '\n')
  md = md.replace(/\{[\s\n]*"@context"[\s\S]*$/g, '\n')
  return md.replace(/\n{3,}/g, '\n\n').trim()
}

function isHtmlContent(s: string): boolean {
  // Detect if the content is primarily HTML (contains block-level tags)
  // rather than markdown. The AI sometimes generates HTML instead of markdown.
  return /<h[1-6][\s>]|<p[\s>]|<ul[\s>]|<ol[\s>]|<a\s+href|<table[\s>]|<blockquote[\s>]/i.test(s)
}

/** Render HTML content as styled React elements. Used when the article
 *  contains raw HTML (e.g. from a caseworks page.tsx or AI-generated HTML)
 *  instead of markdown. */
function renderHtmlContent(html: string, k: { v: number }): React.ReactNode[] {
  // Split into block-level segments and render each
  const blocks: React.ReactNode[] = []
  // Simple block-level HTML parser — splits on block tags
  const blockRe = /(<\/?(?:h[1-6]|p|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|pre|code|div|span|a|strong|em|br|hr)[^>]*>)/gi
  const segments = html.split(blockRe)
  
  let inList = false
  let listItems: React.ReactNode[] = []
  let listType: 'ul' | 'ol' = 'ul'
  
  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx]
    if (!seg) continue
    const t = seg.trim()
    if (!t) continue
    
    // Block-level tags
    const hMatch = t.match(/^<h([1-6])[^>]*>/i)
    if (hMatch) {
      const level = Math.min(parseInt(hMatch[1]), 4) as 1 | 2 | 3 | 4
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4'
      // Extract content until closing tag using current index
      let closeIdx = -1
      for (let j = idx + 1; j < segments.length; j++) {
        if (segments[j]?.trim().toLowerCase() === `</${Tag}>`) { closeIdx = j; break }
      }
      const inner = closeIdx > -1 
        ? segments.slice(idx + 1, closeIdx).join('')
        : segments.slice(idx + 1).join('')
      blocks.push(<Tag key={k.v++} style={headingStyle[level]}>{inline(inner)}</Tag>)
      continue
    }
    if (/^<\/h[1-6]>/i.test(t)) continue
    
    if (/^<p[\s>]/i.test(t)) {
      let closeIdx = -1
      for (let j = idx + 1; j < segments.length; j++) {
        if (segments[j]?.trim().toLowerCase() === '</p>') { closeIdx = j; break }
      }
      const inner = closeIdx > -1
        ? segments.slice(idx + 1, closeIdx).join('')
        : segments.slice(idx + 1).join('')
      blocks.push(<p key={k.v++} style={paraStyle}>{inline(inner)}</p>)
      continue
    }
    if (/^<\/p>/i.test(t)) continue
    
    if (/^<ul[\s>]/i.test(t)) { inList = true; listType = 'ul'; listItems = []; continue }
    if (/^<ol[\s>]/i.test(t)) { inList = true; listType = 'ol'; listItems = []; continue }
    if (/^<\/ul>/i.test(t) || /^<\/ol>/i.test(t)) {
      if (inList && listItems.length) {
        const ListTag = listType as 'ul' | 'ol'
        blocks.push(<ListTag key={k.v++} style={listStyle}>{listItems}</ListTag>)
      }
      inList = false
      listItems = []
      continue
    }
    if (/^<li[\s>]/i.test(t)) {
      let closeIdx = -1
      for (let j = idx + 1; j < segments.length; j++) {
        if (segments[j]?.trim().toLowerCase() === '</li>') { closeIdx = j; break }
      }
      const inner = closeIdx > -1
        ? segments.slice(idx + 1, closeIdx).join('')
        : segments.slice(idx + 1).join('')
      listItems.push(<li key={k.v++} style={liStyle}>{inline(inner)}</li>)
      continue
    }
    if (/^<\/li>/i.test(t)) continue
    
    if (/^<blockquote[\s>]/i.test(t)) {
      let closeIdx = -1
      for (let j = idx + 1; j < segments.length; j++) {
        if (segments[j]?.trim().toLowerCase() === '</blockquote>') { closeIdx = j; break }
      }
      const inner = closeIdx > -1
        ? segments.slice(idx + 1, closeIdx).join('')
        : segments.slice(idx + 1).join('')
      blocks.push(<blockquote key={k.v++} style={blockquoteStyle}><p style={{ margin: 0 }}>{inline(inner)}</p></blockquote>)
      continue
    }
    if (/^<\/blockquote>/i.test(t)) continue
    
    if (/^<a\s+href/i.test(t)) {
      // Inline link — extract href and content
      const hrefMatch = t.match(/href=["']([^"']*)["']/i)
      const href = hrefMatch?.[1] || '#'
      let closeIdx = -1
      for (let j = idx + 1; j < segments.length; j++) {
        if (segments[j]?.trim().toLowerCase() === '</a>') { closeIdx = j; break }
      }
      const inner = closeIdx > -1
        ? segments.slice(idx + 1, closeIdx).join('')
        : segments.slice(idx + 1).join('')
      blocks.push(<a key={k.v++} href={href} target="_blank" rel="noopener noreferrer" style={linkStyle}>{inline(inner)}</a>)
      continue
    }
    if (/^<\/a>/i.test(t)) continue
    
    // Skip unknown tags but render their inner text
    if (/^<[^/]/.test(t) && !/^<(?:br|hr|img)\b/i.test(t)) {
      // Opening tag — skip it, content will be rendered by inline()
      continue
    }
    if (/^<\//.test(t)) continue // closing tag
    
    // Bare text — render as paragraph if not in a list
    if (!inList && t && !/^<(?:br|hr|img)\b/i.test(t)) {
      blocks.push(<p key={k.v++} style={paraStyle}>{inline(t)}</p>)
    }
  }
  
  // Flush any remaining list items
  if (inList && listItems.length) {
    const ListTag = listType as 'ul' | 'ol'
    blocks.push(<ListTag key={k.v++} style={listStyle}>{listItems}</ListTag>)
  }
  
  return blocks
}

export function MarkdownDocument({ source }: { source: string }) {
  const md = documentPreviewSource(source)

  // If content is primarily HTML, render it as styled HTML via dangerouslySetInnerHTML.
  // Guard: HTML parsing freezes the browser above ~40k chars — fall back to a
  // safe prose preview so the editor stays responsive.
  if (isHtmlContent(md) && md.length < 40_000) {
    return (
      <div style={pageStyle}>
        <div
          dangerouslySetInnerHTML={{ __html: md }}
          className="markdown-doc"
          style={{
            fontFamily: FONT_SERIF, fontSize: 17, lineHeight: 1.8, color: INK,
            letterSpacing: '-0.003em',
          }}
        />
        <style>{`
          .markdown-doc h1 { font-family: ${FONT_SANS}; font-size: 30px; font-weight: 700; line-height: 1.2; letter-spacing: -0.02em; color: ${INK}; margin: 0 0 20px; }
          .markdown-doc h2 { font-family: ${FONT_SANS}; font-size: 22px; font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: ${INK}; margin: 32px 0 12px; }
          .markdown-doc h3 { font-family: ${FONT_SANS}; font-size: 19px; font-weight: 600; line-height: 1.35; letter-spacing: -0.02em; color: ${INK}; margin: 24px 0 10px; }
          .markdown-doc h4 { font-family: ${FONT_SANS}; font-size: 17px; font-weight: 600; line-height: 1.4; letter-spacing: -0.02em; color: ${INK}; margin: 20px 0 8px; }
          .markdown-doc p { margin: 0 0 16px; }
          .markdown-doc ul, .markdown-doc ol { margin: 0 0 16px; padding-left: 28px; }
          .markdown-doc li { margin: 0 0 6px; }
          .markdown-doc blockquote { margin: 20px 0; padding: 12px 20px; border-left: 3px solid #D1D5DB; color: ${MUTED}; font-style: italic; font-size: 16px; line-height: 1.7; }
          .markdown-doc a { color: #1D4ED8; text-decoration: underline; }
          .markdown-doc a:hover { color: #1E40AF; }
          .markdown-doc strong { font-weight: 700; }
          .markdown-doc em { font-style: italic; }
          .markdown-doc code { background: #F3F4F6; padding: 1px 6px; border-radius: 4px; font-size: 0.85em; font-family: ${FONT_MONO}; color: #111827; }
          .markdown-doc pre { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 14px; overflow: auto; font-size: 13px; line-height: 1.6; color: #111827; font-family: ${FONT_MONO}; margin: 20px 0; }
          .markdown-doc table { width: 100%; border-collapse: collapse; font-size: 15px; margin: 20px 0; }
          .markdown-doc th, .markdown-doc td { border: 1px solid #E5E7EB; padding: 8px 12px; text-align: left; vertical-align: top; }
          .markdown-doc th { font-family: ${FONT_SANS}; font-weight: 700; background: #F9FAFB; font-size: 14px; }
          .markdown-doc hr { border: none; border-top: 1px solid #E5E7EB; margin: 28px 0; }
        `}</style>
      </div>
    )
  }

  const lines = md.split('\n')
  // Guard: rendering more than 800 lines of markdown is O(n²) in the
  // inline() regex loop and will freeze Safari on failed-job content.
  if (lines.length > 800) {
    return (
      <div style={pageStyle}>
        <pre style={{ ...preStyle, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {md}
        </pre>
      </div>
    )
  }
  const blocks: React.ReactNode[] = []
  let i = 0
  let k = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // closing fence
      blocks.push(
        <pre key={k++} style={preStyle}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(trimmed)) {
      blocks.push(<hr key={k++} style={hrStyle} />)
      i++
      continue
    }

    // Pipe table — header row + separator + body rows
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1].trim())) {
      const head = parseTableRow(trimmed)
      const rows: string[][] = []
      i += 2 // skip header + separator
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i].trim()))
        i++
      }
      blocks.push(
        <div key={k++} style={tableWrap}>
          <table style={tableStyle}>
            <thead>{tableRow(head, 'th', k++)}</thead>
            <tbody>{rows.map((r) => tableRow(r, 'td', k++))}</tbody>
          </table>
        </div>,
      )
      continue
    }

    // Headings
    const hm = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (hm) {
      const level = Math.min(hm[1].length, 4)
      const style = headingStyle[level as 1 | 2 | 3 | 4]
      const Tag = (`h${level}` as 'h1' | 'h2' | 'h3' | 'h4')
      blocks.push(
        <Tag key={k++} style={style}>
          {inline(hm[2])}
        </Tag>,
      )
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const q: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        q.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={k++} style={blockquoteStyle}>
          {q.map((ql, qi) => (
            <p key={qi} style={{ margin: qi === q.length - 1 ? 0 : '0 0 8px' }}>
              {inline(ql)}
            </p>
          ))}
        </blockquote>,
      )
      continue
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={k++} style={listStyle}>
          {items.map((it, ii) => (
            <li key={ii} style={liStyle}>
              {inline(it)}
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={k++} style={listStyle}>
          {items.map((it, ii) => (
            <li key={ii} style={liStyle}>
              {inline(it)}
            </li>
          ))}
        </ol>,
      )
      continue
    }

    // Blank line
    if (!trimmed) {
      i++
      continue
    }

    // Paragraph — consume consecutive non-special lines
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith('```') &&
      !/^#{1,6}\s/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].startsWith('> ') &&
      !lines[i].trim().startsWith('|') &&
      !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim())
      i++
    }
    blocks.push(
      <p key={k++} style={paraStyle}>
        {inline(para.join(' '))}
      </p>,
    )
  }

  return (
    <div style={pageStyle}>
      {blocks.length ? (
        blocks
      ) : (
        <p style={{ color: MUTED, fontStyle: 'italic', textAlign: 'center', margin: '40px 0' }}>
          Nothing to preview yet.
        </p>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  background: '#FFFFFF',
  color: INK,
  maxWidth: 720,
  margin: '0 auto',
  padding: '44px 52px',
  boxSizing: 'border-box',
  minHeight: '75vh',
  borderRadius: 2,
  border: '1px solid #E5E5E5',
  boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24), 0 8px 16px rgba(0,0,0,0.08)',
}

const headingStyle: Record<1 | 2 | 3 | 4, React.CSSProperties> = {
  1: {
    fontFamily: FONT_SANS, fontSize: 30, fontWeight: 700, lineHeight: 1.2,
    letterSpacing: '-0.02em', color: INK, margin: '0 0 20px', textWrap: 'balance',
  },
  2: {
    fontFamily: FONT_SANS, fontSize: 22, fontWeight: 700, lineHeight: 1.3,
    letterSpacing: '-0.02em', color: INK, margin: '32px 0 12px', textWrap: 'balance',
  },
  3: {
    fontFamily: FONT_SANS, fontSize: 19, fontWeight: 600, lineHeight: 1.35,
    letterSpacing: '-0.02em', color: INK, margin: '24px 0 10px', textWrap: 'balance',
  },
  4: {
    fontFamily: FONT_SANS, fontSize: 17, fontWeight: 600, lineHeight: 1.4,
    letterSpacing: '-0.02em', color: INK, margin: '20px 0 8px',
  },
}

const paraStyle: React.CSSProperties = {
  fontFamily: FONT_SERIF, fontSize: 17, lineHeight: 1.8, color: INK,
  margin: '0 0 16px', letterSpacing: '-0.003em',
}

const listStyle: React.CSSProperties = {
  fontFamily: FONT_SERIF, fontSize: 17, lineHeight: 1.8, color: INK,
  margin: '0 0 16px', paddingLeft: 28,
}

const liStyle: React.CSSProperties = { margin: '0 0 6px', letterSpacing: '-0.003em' }

const blockquoteStyle: React.CSSProperties = {
  margin: '20px 0', padding: '12px 20px', borderLeft: '3px solid #D1D5DB',
  color: MUTED, fontStyle: 'italic', fontFamily: FONT_SERIF, fontSize: 16, lineHeight: 1.7,
}

const tableWrap: React.CSSProperties = { margin: '20px 0', overflowX: 'auto' }

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 15, fontFamily: FONT_SERIF,
}

const thStyle: React.CSSProperties = {
  border: '1px solid #E5E7EB', padding: '8px 12px', textAlign: 'left',
  fontFamily: FONT_SANS, fontWeight: 700, background: '#F9FAFB', fontSize: 14,
}

const tdStyle: React.CSSProperties = {
  border: '1px solid #E5E7EB', padding: '8px 12px', verticalAlign: 'top', lineHeight: 1.55,
}

const codeStyle: React.CSSProperties = {
  background: '#F3F4F6', padding: '1px 6px', borderRadius: 4, fontSize: '0.85em',
  fontFamily: FONT_MONO, color: '#111827',
}

const preStyle: React.CSSProperties = {
  background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 14,
  overflow: 'auto', fontSize: 13, lineHeight: 1.6, color: '#111827', fontFamily: FONT_MONO,
  margin: '20px 0',
}

const hrStyle: React.CSSProperties = { border: 'none', borderTop: '1px solid #E5E7EB', margin: '28px 0' }

const linkStyle: React.CSSProperties = { color: '#1D4ED8', textDecoration: 'underline' }
