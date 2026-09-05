'use client'
/**
 * StudioDocEditor — TipTap document editor for the rendered article.
 *
 * TipTap (ProseMirror) edits trusted HTML from mdToEditableHtml; every
 * change serializes back to markdown via serializeDsHtml (pipeline SoT).
 * Frontmatter and JSON-LD live in atom keepBlock nodes and round-trip
 * verbatim. Markdown mode remains in AdminInlineEditor.
 */

import * as React from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Node as TipTapNode } from '@tiptap/core'
import { serializeDsHtml } from '@/lib/editorDoc'
import { peelCollapsedFrontmatter } from '@/lib/seoFactory/formatContract'
import { sanitizeLeakedMarkup } from '@/lib/seoFactory/leakedMarkup'

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
  let s = sanitizeLeakedMarkup(peelCollapsedFrontmatter(String(md || '')))
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
.gd-editor .gd-caret-guard{display:inline-block;width:1px;height:15px}
.gd-editor mark.gd-jump{background:#FDE68A;color:inherit;padding:0 2px;border-radius:2px}`

/** Atom node so frontmatter / JSON-LD never enter the prose schema. */
const KeepBlock = TipTapNode.create({
  name: 'keepBlock',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return {
      kind: { default: 'fm' },
      payload: { default: '' },
    }
  },
  parseHTML() {
    return [{
      tag: 'div[data-keep]',
      getAttrs: (el) => {
        const node = el as HTMLElement
        return {
          kind: node.getAttribute('data-keep') || 'fm',
          payload: node.textContent || '',
        }
      },
    }]
  },
  renderHTML({ node }) {
    return [
      'div',
      {
        'data-keep': node.attrs.kind,
        contenteditable: 'false',
        style: 'display:none',
      },
      node.attrs.payload,
    ]
  },
})

function countLiveWords(md: string): number {
  const body = String(md || '')
    .replace(/^---[\s\S]*?\n---\s*/, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/[#>*`\[\]()|-]/g, ' ')
  return body.trim().split(/\s+/).filter(Boolean).length
}

function markActive(editor: Editor | null, name: string, attrs?: Record<string, unknown>): boolean {
  if (!editor) return false
  return editor.isActive(name, attrs)
}

const TIP_STYLE = `
.gd-editor .ProseMirror{outline:none;min-height:inherit}
.gd-editor .ProseMirror p{margin:0 0 14px;line-height:1.7;color:${TOKENS.ink};font-size:16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
.gd-editor .ProseMirror h1{font-family:${TOKENS.serif};font-size:32px;line-height:1.2;margin:28px 0 14px;color:${TOKENS.heading};font-weight:700}
.gd-editor .ProseMirror h2{font-family:${TOKENS.serif};font-size:24px;line-height:1.25;margin:26px 0 12px;color:${TOKENS.heading2};font-weight:700}
.gd-editor .ProseMirror h3{font-family:${TOKENS.serif};font-size:19px;line-height:1.3;margin:22px 0 10px;color:${TOKENS.heading2};font-weight:700}
.gd-editor .ProseMirror ul,.gd-editor .ProseMirror ol{margin:0 0 14px;padding-left:1.4em;line-height:1.7}
.gd-editor .ProseMirror blockquote{margin:16px 0;padding:8px 16px;border-left:3px solid #9A7B3B;color:#4B5563;background:#FAFAF8}
.gd-editor .ProseMirror a{color:${TOKENS.link};text-decoration:underline}
.gd-editor .ProseMirror hr{border:none;border-top:1px solid ${TOKENS.border};margin:22px 0}
.gd-editor .ProseMirror table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
.gd-editor .ProseMirror th{border-bottom:2px solid rgba(0,0,0,0.08);padding:8px 10px;text-align:left;background:#F8FAFC;font-weight:700;color:#17365D}
.gd-editor .ProseMirror td{border-bottom:1px solid rgba(0,0,0,0.08);padding:8px 10px;vertical-align:top}
.gd-editor .ProseMirror mark.gd-jump{background:#FDE68A;color:inherit;padding:0 2px;border-radius:2px}
.gd-editor .ProseMirror p.is-editor-empty:first-child::before{color:${TOKENS.inkDim};content:attr(data-placeholder);float:left;height:0;pointer-events:none;font-style:italic}
.gd-toolbar-sticky{position:sticky;top:0;z-index:5}
`

export default function StudioDocEditor({
  content,
  onChange,
  disabled,
  minHeight = 640,
  highlightPhrase,
}: {
  content: string
  onChange: (md: string) => void
  disabled?: boolean
  minHeight?: number
  highlightPhrase?: string | null
}) {
  const lastSerializedRef = React.useRef('')
  const [findOpen, setFindOpen] = React.useState(false)
  const [findQ, setFindQ] = React.useState('')
  const [liveWords, setLiveWords] = React.useState(0)
  const findInputRef = React.useRef<HTMLInputElement | null>(null)
  const [, bump] = React.useState(0)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Placeholder.configure({ placeholder: 'Start writing your draft…' }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      KeepBlock,
    ],
    content: mdToEditableHtml(String(content || '')),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'gd-prosemirror',
        'data-testid': 'studio-wysiwyg-document',
      },
      handlePaste(_view, event) {
        const text = event.clipboardData?.getData('text/plain')
        if (text == null) return false
        event.preventDefault()
        // Insert plain text only — never raw HTML paste.
        _view.dispatch(_view.state.tr.insertText(text))
        return true
      },
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
          event.preventDefault()
          setFindOpen(true)
          window.setTimeout(() => findInputRef.current?.focus(), 0)
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = serializeDsHtml(ed.getHTML())
      lastSerializedRef.current = md.trim()
      setLiveWords(countLiveWords(md))
      onChange(md)
    },
    onSelectionUpdate: () => bump((n) => n + 1),
    immediatelyRender: false,
  })

  React.useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  React.useEffect(() => {
    if (!editor) return
    const incoming = String(content || '')
    if (lastSerializedRef.current && lastSerializedRef.current === incoming.trim()) return
    editor.commands.setContent(mdToEditableHtml(incoming), false)
    lastSerializedRef.current = incoming.trim()
    setLiveWords(countLiveWords(incoming))
  }, [content, editor])

  React.useEffect(() => {
    const phrase = String(highlightPhrase || '').trim()
    if (!phrase || !editor) return
    const root = editor.view.dom
    root.querySelectorAll('mark.gd-jump').forEach((el) => {
      const parent = el.parentNode
      if (!parent) return
      parent.replaceChild(document.createTextNode(el.textContent || ''), el)
      parent.normalize()
    })
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: globalThis.Node | null
    const needle = phrase.slice(0, 80)
    while ((node = walker.nextNode())) {
      const text = node.textContent || ''
      const idx = text.toLowerCase().indexOf(needle.toLowerCase())
      if (idx < 0) continue
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, Math.min(text.length, idx + needle.length))
      const mark = document.createElement('mark')
      mark.className = 'gd-jump'
      mark.dataset.testid = 'studio-jump-mark'
      try {
        range.surroundContents(mark)
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
      } catch { /* split nodes — skip */ }
      break
    }
  }, [highlightPhrase, content, editor])

  const runFind = (q: string) => {
    if (!q || !editor) return
    const root = editor.view.dom
    const sel = window.getSelection()
    sel?.removeAllRanges()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node: globalThis.Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent || ''
      const idx = text.toLowerCase().indexOf(q.toLowerCase())
      if (idx < 0) continue
      const range = document.createRange()
      range.setStart(node, idx)
      range.setEnd(node, Math.min(text.length, idx + q.length))
      sel?.addRange(range)
      ;(node.parentElement as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      break
    }
  }

  const cmd = (kind: string) => {
    if (!editor || disabled) return
    const chain = editor.chain().focus()
    switch (kind) {
      case 'undo': chain.undo().run(); break
      case 'redo': chain.redo().run(); break
      case 'bold': chain.toggleBold().run(); break
      case 'italic': chain.toggleItalic().run(); break
      case 'underline': chain.toggleUnderline().run(); break
      case 'strike': chain.toggleStrike().run(); break
      case 'h1': chain.toggleHeading({ level: 1 }).run(); break
      case 'h2': chain.toggleHeading({ level: 2 }).run(); break
      case 'h3': chain.toggleHeading({ level: 3 }).run(); break
      case 'p': chain.setParagraph().run(); break
      case 'ul': chain.toggleBulletList().run(); break
      case 'ol': chain.toggleOrderedList().run(); break
      case 'quote': chain.toggleBlockquote().run(); break
      case 'hr': chain.setHorizontalRule().run(); break
      case 'clear': chain.unsetAllMarks().clearNodes().run(); break
      case 'link': {
        const prev = editor.getAttributes('link').href as string | undefined
        const url = window.prompt('Link URL', prev || 'https://')
        if (url === null) break
        if (!url.trim()) chain.extendMarkRange('link').unsetLink().run()
        else chain.extendMarkRange('link').setLink({ href: url.trim() }).run()
        break
      }
      case 'table':
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        break
    }
  }

  const btn = (label: React.ReactNode, title: string, kind: string, active?: boolean) => (
    <button
      type="button"
      title={title}
      onClick={() => cmd(kind)}
      aria-pressed={active || false}
      style={{
        ...TOOLBAR_BTN,
        background: active ? '#FEF3C7' : '#fff',
        borderColor: active ? '#9A7B3B' : TOKENS.border,
        fontWeight: active ? 700 : 500,
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight }}>
      {!disabled && (
        <div
          className="gd-toolbar-sticky"
          role="toolbar"
          aria-label="Document formatting"
          style={{
            display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center',
            padding: '8px 10px', border: `1px solid ${TOKENS.border}`, borderRadius: 8,
            background: 'rgba(250,250,251,.96)', backdropFilter: 'blur(6px)',
            boxShadow: '0 1px 2px rgba(15,23,42,.06)',
          }}
        >
          {btn('Undo', 'Undo (Ctrl/Cmd+Z)', 'undo')}
          {btn('Redo', 'Redo (Ctrl/Cmd+Shift+Z)', 'redo')}
          <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }} />
          {btn(<strong>B</strong>, 'Bold', 'bold', markActive(editor, 'bold'))}
          {btn(<em>I</em>, 'Italic', 'italic', markActive(editor, 'italic'))}
          {btn(<u>U</u>, 'Underline', 'underline', markActive(editor, 'underline'))}
          {btn(<s>S</s>, 'Strikethrough', 'strike', markActive(editor, 'strike'))}
          <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }} />
          {btn('H1', 'Heading 1', 'h1', markActive(editor, 'heading', { level: 1 }))}
          {btn('H2', 'Heading 2', 'h2', markActive(editor, 'heading', { level: 2 }))}
          {btn('H3', 'Heading 3', 'h3', markActive(editor, 'heading', { level: 3 }))}
          {btn('¶', 'Paragraph', 'p', markActive(editor, 'paragraph'))}
          <span style={{ width: 1, height: 18, background: TOKENS.border, margin: '0 4px' }} />
          {btn('• List', 'Bullet list', 'ul', markActive(editor, 'bulletList'))}
          {btn('1. List', 'Numbered list', 'ol', markActive(editor, 'orderedList'))}
          {btn('🔗', 'Insert link', 'link', markActive(editor, 'link'))}
          {btn('❝', 'Blockquote', 'quote', markActive(editor, 'blockquote'))}
          {btn('—', 'Horizontal rule', 'hr')}
          {btn('⊞ Table', 'Insert table', 'table')}
          {btn('Clear', 'Clear formatting', 'clear')}
          <button
            type="button"
            title="Find in document (Ctrl/Cmd+F)"
            onClick={() => { setFindOpen(true); window.setTimeout(() => findInputRef.current?.focus(), 0) }}
            style={TOOLBAR_BTN}
          >
            Find
          </button>
          {findOpen && (
            <input
              ref={findInputRef}
              value={findQ}
              placeholder="Find in document…"
              onChange={(e) => { setFindQ(e.target.value); runFind(e.target.value) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); runFind(findQ) }
                if (e.key === 'Escape') setFindOpen(false)
              }}
              style={{ padding: '4px 8px', fontSize: 12, border: `1px solid ${TOKENS.border}`, borderRadius: 6, minWidth: 160 }}
            />
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: TOKENS.inkDim, fontFamily: 'var(--portal-font-mono, monospace)', whiteSpace: 'nowrap' }}>
            {liveWords.toLocaleString()} words · TipTap · page layout
          </span>
        </div>
      )}
      <style>{APPEND_STYLE + TIP_STYLE}</style>
      <div style={{
        border: `1px solid ${TOKENS.border}`, borderRadius: 8, background: TOKENS.canvas,
        padding: '18px 12px', overflow: 'auto', maxHeight: 780,
      }}>
        <div
          className="gd-editor"
          style={{
            width: 'min(816px, 100%)', minHeight, margin: '0 auto',
            padding: '56px clamp(32px, 6vw, 72px) 84px',
            background: TOKENS.paper, borderRadius: 4,
            boxShadow: '0 1px 3px rgba(15,23,42,.12), 0 8px 28px rgba(15,23,42,.08)',
            boxSizing: 'border-box',
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
