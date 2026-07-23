/**
 * Lightweight markdown → React for Content Studio split preview.
 * No external deps (keeps Worker bundle small). Covers headings, lists,
 * bold/italic, code, links, HR, blockquotes, paragraphs.
 */
import React from 'react'

function inlineFormat(text: string): React.ReactNode[] {
  // Order: code, links, bold, italic
  const parts: React.ReactNode[] = []
  const re =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index))
    }
    const tok = m[0]
    if (tok.startsWith('`')) {
      parts.push(
        <code key={key++} style={codeInline}>
          {tok.slice(1, -1)}
        </code>,
      )
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      parts.push(<em key={key++}>{tok.slice(1, -1)}</em>)
    } else if (tok.startsWith('[')) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (lm) {
        parts.push(
          <a
            key={key++}
            href={lm[2]}
            target="_blank"
            rel="noreferrer"
            style={{ color: '#93C5FD' }}
          >
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

const codeInline: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  padding: '1px 5px',
  borderRadius: 4,
  fontSize: '0.9em',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
}

export function MarkdownLite({
  source,
  style,
}: {
  source: string
  style?: React.CSSProperties
}) {
  // Strip YAML front matter for nicer preview
  let md = source || ''
  if (md.startsWith('---')) {
    const end = md.indexOf('\n---', 3)
    if (end !== -1) md = md.slice(end + 4).replace(/^\n+/, '')
  }

  const lines = md.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let k = 0

  while (i < lines.length) {
    const line = lines[i]

    // fenced code
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // closing fence
      blocks.push(
        <pre key={k++} style={preBlock}>
          {lang ? <div style={{ color: '#6B7280', fontSize: 10, marginBottom: 6 }}>{lang}</div> : null}
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    // HR
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push(<hr key={k++} style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '16px 0' }} />)
      i++
      continue
    }

    // Headings
    const hm = line.match(/^(#{1,6})\s+(.+)$/)
    if (hm) {
      const level = hm[1].length
      const Tag = (`h${Math.min(level, 4)}` as 'h1' | 'h2' | 'h3' | 'h4')
      const sizes = [22, 18, 15, 14]
      blocks.push(
        <Tag
          key={k++}
          style={{
            margin: level === 1 ? '18px 0 10px' : '14px 0 8px',
            fontSize: sizes[level - 1] || 14,
            fontWeight: 700,
            color: '#F9FAFB',
            lineHeight: 1.3,
          }}
        >
          {inlineFormat(hm[2])}
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
        <blockquote
          key={k++}
          style={{
            margin: '10px 0',
            padding: '8px 12px',
            borderLeft: '3px solid #FBBF24',
            color: '#9CA3AF',
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          {q.map((ql, qi) => (
            <div key={qi} style={{ marginBottom: 4 }}>{inlineFormat(ql)}</div>
          ))}
        </blockquote>,
      )
      continue
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={k++} style={{ margin: '8px 0', paddingLeft: 22, color: '#E5E7EB' }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ marginBottom: 4, lineHeight: 1.5 }}>{inlineFormat(it)}</li>
          ))}
        </ul>,
      )
      continue
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={k++} style={{ margin: '8px 0', paddingLeft: 22, color: '#E5E7EB' }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ marginBottom: 4, lineHeight: 1.5 }}>{inlineFormat(it)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // Blank
    if (!line.trim()) {
      i++
      continue
    }

    // Paragraph (consume consecutive non-empty non-special lines)
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith('```') &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[-*+]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !lines[i].startsWith('> ') &&
      !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[i].trim())
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push(
      <p key={k++} style={{ margin: '0 0 12px', lineHeight: 1.6, color: '#E5E7EB', fontSize: 13 }}>
        {inlineFormat(para.join(' '))}
      </p>,
    )
  }

  return (
    <div style={{ fontSize: 13, ...style }}>
      {blocks.length ? blocks : (
        <p style={{ color: '#6B7280' }}>Nothing to preview yet.</p>
      )}
    </div>
  )
}

const preBlock: React.CSSProperties = {
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  padding: 12,
  overflow: 'auto',
  fontSize: 12,
  lineHeight: 1.45,
  color: '#E5E7EB',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  margin: '10px 0',
}
