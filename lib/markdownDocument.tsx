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
export function documentPreviewSource(source: string): string {
  let md = String(source || '')
  if (md.startsWith('---')) {
    const end = md.indexOf('\n---', 3)
    if (end !== -1) md = md.slice(end + 4).replace(/^\n+/, '')
  }
  md = md.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
  md = md.replace(/<script\b[^>]*>[\s\S]*$/i, '\n')
  md = md.replace(/```(?:json|ld\+json|html)[\s\S]*?```/gi, '\n')
  md = md.replace(/\{[\s\n]*"@context"\s*:\s*"https?:\/\/schema\.org"[\s\S]*?(?:\n\s*\}[\s\n]*|$)/g, '\n')
  md = md.replace(/\{[\s\n]*"@context"[\s\S]*$/g, '\n')
  return md.replace(/\n{3,}/g, '\n\n').trim()
}

export function MarkdownDocument({ source }: { source: string }) {
  const md = documentPreviewSource(source)

  const lines = md.split('\n')
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
