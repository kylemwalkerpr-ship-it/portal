'use client'
/**
 * StudioDocEditor — a word-processor-style editor for the rendered article.
 *
 * The Document view is contentEditable over a markdown-rendered HTML page:
 * the operator clicks anywhere and types, selects text and presses the
 * formatting toolbar (B / I / H2 / H3 / lists / link / quote / hr / table),
 * and every change is serialized back to markdown (the pipeline's single
 * source of truth). Frontmatter and JSON-LD render as hidden keep-regions
 * and round-trip verbatim.
 *
 * Pasting is forced to plain text so the DOM can never be corrupted by
 * arbitrary HTML; the serializer accepts only the trusted tag subset.
 */

import * as React from 'react'
import { serializeDsHtml } from '@/lib/editorDoc'

const TOKENS = {
  paper: '#fff',
  canvas: '#EEF0F2',
  ink: '#1F2937',
  inkDim: '#9CA3AF',
  heading: '#111827',
  heading2: '#17365D',
  link: '#1D4ED8',
  border: 'rgba(0,0,0,0.08)',
  serif: "var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)",
}

const KEEP_PREFIX = '\u0000KEEP\u0000'

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inlineHtml(text: string): string {
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out += esc(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('`')) out += `<code>${esc(tok.slice(1, -1))}</code>`
    else if (tok.startsWith('**')) out += `<strong>${esc(tok.slice(2, -2))}</strong>`
    else if (tok.startsWith('*')) out += `<em>${esc(tok.slice(1, -1))}</em>`
    else {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      out += lm ? `<a href="${esc(lm[2])}">${esc(lm[1])}</a>` : esc(tok)
    }
    last = m.index + tok.length
  }
  out += esc(text.slice(last))
  return out
}

function tableHtml(rows: string[][]): string {
  const head = rows[0] || []
  const body = rows.slice(1)
  return (
    '<table><thead><tr>' + head.map((c) => `<th>${inlineHtml(c)}</th>`).join('') + '</tr></thead><tbody>' +
    body.map((r) => '<tr>' + r.map((c) => `<td>${inlineHtml(c)}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>'
  )
}

/** Render the document's VISIBLE markdown to trusted HTML for contentEditable. */
export function mdToEditableHtml(md: string): string {
  // Hide frontmatter + JSON-LD; keep them verbatim for the serializer.
  let s = String(md || '')
  let keeps = ''
  if (s.startsWith('---')) {
    const end = s.indexOf('\n---', 3)
    if (end !== -1) {
      keeps += `<div data-keep="fm" contenteditable="false">${KEEP_PREFIX}${esc(s.slice(0, end + 4))}</div>`
      s = s.slice(end + 4).replace(/^\n+/, '')
    }
  }
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (block) => {
    keeps += `<div data-keep="schema" contenteditable="false">${KEEP_PREFIX}${esc(block)}</div>`
    return ''
  })
  const lines = s.split('\n')
  const out: string[] = []
  let i = 0
  let para: string[] = []
  const flush = () => {
    if (para.length) {
      out.push(`<p>${para.map(inlineHtml).join(' ')}</p>`)
      para = []
    }
  }
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      i++
      continue
    }
    const hm = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (hm) {
      flush()
      const level = hm[1].length
      out.push(`<h${level}>${inlineHtml(hm[2])}</h${level}>`)
      i++
      continue
    }
    if (trimmed.startsWith('```')) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        code.push(lines[i])
        i++
      }
      i++
      out.push(`<pre>${esc(code.join('\n'))}</pre>`)
      continue
    }
    if (trimmed.startsWith('> ')) {
      flush()
      const q: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        q.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote>${q.map(inlineHtml).join(' ')}</blockquote>`)
      continue
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      flush()
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''))
        i++
      }
      out.push('<ul>' + items.map((it) => `<li>${inlineHtml(it)}</li>`).join('') + '</ul>')
      continue
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      flush()
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      out.push('<ol>' + items.map((it) => `<li>${inlineHtml(it)}</li>`).join('') + '</ol>')
      continue
    }
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(trimmed)) {
      flush()
      out.push('<hr>')
      i++
      continue
    }
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const cells = lines[i].trim().split('|').slice(1, -1).map((c) => c.trim())
        if (!cells.every((c) => /^-{1,}$/.test(c))) rows.push(cells)
        i++
      }
      if (rows.length) {
        flush()
        out.push(tableHtml(rows))
        continue
      }
    }
    para.push(trimmed)
    i++
  }
  flush()
  return keeps + out.join('')
}

const TOOLBAR_BTN: React.CSSProperties = {
  padding: '5px 9px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)',
  background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer',
  minWidth: 30, fontWeight: 600, lineHeight: 1,
}

const APPEND_STYLE = `[data-keep]{display:none}
.gd-editor[contenteditable]{outline:none}
.gd-editor{color:#1F2937;font-family:Georgia,Cambria,'Times New Roman',serif;font-size:15px;line-height:1.78}
.gd-editor h1{font-family:${TOKENS.serif};font-size:30px;line-height:1.15;margin:6px 0 22px;color:#111827;font-weight:700}
.gd-editor h2{font-family:${TOKENS.serif};font-size:22px;line-height:1.25;margin:30px 0 12px;color:#17365D;font-weight:700}
.gd-editor h3{font-family:${TOKENS.serif};font-size:17px;line-height:1.3;margin:22px 0 8px;color:#1F4E79;font-weight:700}
.gd-editor p{margin:0 0 14px}
.gd-editor a{color:#1D4ED8;text-decoration:underline}
.gd-editor ul{margin:8px 0 16px;padding-left:26px}
.gd-editor ol{margin:8px 0 16px;padding-left:26px}
.gd-editor li{margin-bottom:5px;line-height:1.6}
.gd-editor blockquote{margin:14px 0;padding:10px 16px;border-left:3px solid #9A7B3B;background:#FCF8EF;color:#57534E;font-style:italic}
.gd-editor pre{background:#F8FAFC;border:1px solid rgba(0,0,0,0.08);padding:12px 14px;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap}
.gd-editor code{background:#F3F4F6;padding:1px 5px;border-radius:4px;font-size:.88em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#B91C1C}
.gd-editor table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
.gd-editor th{border-bottom:2px solid rgba(0,0,0,0.08);padding:8px 10px;text-align:left;background:#F8FAFC;font-weight:700;color:#17365D}
.gd-editor td{border-bottom:1px solid rgba(0,0,0,0.08);padding:8px 10px;vertical-align:top}
.gd-editor .gd-caret-guard{display:inline-block;width:1px;height:15px}`

export default function StudioDocEditor({
  content,
  onChange,
  disabled,
  minHeight = 640,
}: {
  content: string
  onChange: (md: string) => void
  disabled?: boolean
  minHeight?: number
}) {
  const editorRef = React.useRef<HTMLDivElement | null>(null)
  const contentRef = React.useRef(content)
  contentRef.current = content
  const lastSerializedRef = React.useRef('')

  // (Re)hydrate the editable DOM when the EXTERNAL content changes and the
  // user is not mid-edit (e.g. after Audit & Fix returns fixedContent).
  React.useEffect(() => {
    if (!editorRef.current) return
    const serialized = lastSerializedRef.current
    const currentMd = contentRef.current
    if (!serialized || serialized === currentMd.trim()) return
    editorRef.current.innerHTML = mdToEditableHtml(currentMd)
    lastSerializedRef.current = ''
  }, [content])

  React.useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = mdToEditableHtml(contentRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyCommand = (command: () => void) => {
    if (!editorRef.current) return
    const sel = window.getSelection()
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null
    command()
    // Restore focus + selection.
    editorRef.current.focus()
    if (range) {
      const restored = window.getSelection()
      restored?.removeAllRanges()
      restored?.addRange(range)
    }
    syncFromDom()
  }

  const syncFromDom = React.useCallback(() => {
    if (!editorRef.current) return
    const md = serializeDsHtml(editorRef.current.innerHTML)
    lastSerializedRef.current = md.trim()
    contentRef.current = md
    onChange(md)
  }, [onChange])

  const cmd = (kind: 'bold' | 'italic' | 'h2' | 'h3' | 'p' | 'ul' | 'ol' | 'quote' | 'hr' | 'link' | 'table') => {
    if (disabled) return
    applyCommand(() => {
      const ed = editorRef.current
      if (!ed) return
      switch (kind) {
        case 'bold': document.execCommand('bold'); break
        case 'italic': document.execCommand('italic'); break
        case 'h2': document.execCommand('formatBlock', false, 'h2'); break
        case 'h3': document.execCommand('formatBlock', false, 'h3'); break
        case 'p': document.execCommand('formatBlock', false, 'p'); break
        case 'ul': document.execCommand('insertUnorderedList'); break
        case 'ol': document.execCommand('insertOrderedList'); break
        case 'quote': document.execCommand('formatBlock', false, 'blockquote'); break
        case 'hr': document.execCommand('insertHorizontalRule'); break
        case 'link': {
          const url = window.prompt('Link URL', 'https://')
          if (url) document.execCommand('createLink', false, url.trim())
          break
        }
        case 'table': {
          const html = tableHtml([
            ['Column A', 'Column B', 'Column C'],
            ['', '', ''],
            ['', '', ''],
          ])
          document.execCommand('insertHTML', false, html)
          break
        }
      }
    })
  }

  const toolbar: Array<{ label: React.ReactNode; title: string; run: () => void; wide?: boolean }> = [
    { label: <strong>B</strong>, title: 'Bold (Ctrl/Cmd+B)', run: () => cmd('bold') },
    { label: <em>I</em>, title: 'Italic (Ctrl/Cmd+I)', run: () => cmd('italic') },
    { label: 'H2', title: 'Heading 2', run: () => cmd('h2') },
    { label: 'H3', title: 'Heading 3', run: () => cmd('h3') },
    { label: '¶', title: 'Paragraph (Ctrl/Cmd+0)', run: () => cmd('p') },
    { label: '• List', title: 'Bullet list', run: () => cmd('ul') },
    { label: '1. List', title: 'Numbered list', run: () => cmd('ol') },
    { label: '🔗', title: 'Insert link', run: () => cmd('link') },
    { label: '❝', title: 'Blockquote', run: () => cmd('quote') },
    { label: '—', title: 'Horizontal rule', run: () => cmd('hr') },
    { label: '⊞ Table', title: 'Insert 3-column table', run: () => cmd('table') },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight }}>
      {!disabled && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', padding: '6px 8px', border: `1px solid ${TOKENS.border}`, borderRadius: 8, background: '#FAFAFB' }}>
          {toolbar.map((t, i) => (
            <React.Fragment key={i}>
              {i === 2 && <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }} />}
              {i === 7 && <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }} />}
              <button type="button" title={t.title} onClick={t.run} style={t.wide ? { ...TOOLBAR_BTN, minWidth: 56 } : TOOLBAR_BTN}>
                {t.label}
              </button>
            </React.Fragment>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: TOKENS.inkDim, fontFamily: 'var(--portal-font-mono, monospace)' }}>
            {disabled ? 'read-only' : 'click to edit · changes update markdown + re-audit'}
          </span>
        </div>
      )}
      <style>{APPEND_STYLE}</style>
      <div style={{
        border: `1px solid ${TOKENS.border}`, borderRadius: 8, background: TOKENS.canvas,
        padding: '18px 12px', overflow: 'auto', maxHeight: 780,
      }}>
        <div
          ref={editorRef}
          data-testid="studio-wysiwyg-document"
          className="gd-editor"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={() => syncFromDom()}
          onPaste={(e) => {
            if (disabled) return
            e.preventDefault()
            const text = e.clipboardData?.getData('text/plain') || ''
            document.execCommand('insertText', false, text)
            syncFromDom()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault()
              document.execCommand('insertText', false, '  ')
            }
          }}
          style={{
            width: 'min(816px, 100%)', minHeight, margin: '0 auto',
            padding: '56px clamp(32px, 6vw, 72px) 84px',
            background: TOKENS.paper, borderRadius: 4,
            boxShadow: '0 1px 3px rgba(15,23,42,.12), 0 8px 28px rgba(15,23,42,.08)',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  )
}