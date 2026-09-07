/**
 * Tiny Markdown renderer for attorney/consultant bio fields AND marketplace
 * gig descriptions (Fiverr-style packages with ## / ### sections).
 *
 * Scope: headings (## / ###), bulleted lists (* / -), paragraphs.
 * Anything fancier (inline links, bold/italic, tables) is intentionally
 * NOT supported — keeps the parser tiny and avoids a full markdown dep.
 * Same approach as the apex blog renderInline() helper (commit 40f7947).
 *
 * Single source of truth — used by SellerAbout, MarketplaceProvidersIndex,
 * find-attorney, attorney-profile, and GigDetailPage / gig SSR.
 */
import React from 'react'

const H2: React.CSSProperties = {
  margin: '20px 0 8px',
  fontSize: 17,
  fontWeight: 600,
  lineHeight: 1.3,
  color: '#1C1410',
}
const H3: React.CSSProperties = {
  margin: '16px 0 6px',
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.3,
  color: '#1C1410',
}
const P: React.CSSProperties = {
  margin: '0 0 12px',
  lineHeight: 1.7,
  whiteSpace: 'pre-line',
  color: '#1C1410',
}
const UL: React.CSSProperties = {
  margin: '8px 0 12px',
  paddingLeft: 22,
  lineHeight: 1.7,
  color: '#1C1410',
}

export function renderBioMarkdown(bio: string | null | undefined): React.ReactNode {
  if (!bio) return null
  const lines = String(bio).replace(/\r\n/g, '\n').split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const trimmed = lines[i].trim()
    if (!trimmed) {
      i++
      continue
    }

    // ### heading (check before ##)
    if (trimmed.startsWith('### ')) {
      nodes.push(
        <h4 key={key++} style={H3}>
          {trimmed.slice(4)}
        </h4>,
      )
      i++
      continue
    }
    // ## heading
    if (trimmed.startsWith('## ')) {
      nodes.push(
        <h3 key={key++} style={H2}>
          {trimmed.slice(3)}
        </h3>,
      )
      i++
      continue
    }
    // lone # heading (rare) — strip marker, don't leak raw #
    if (/^#\s+/.test(trimmed) && !trimmed.startsWith('##')) {
      nodes.push(
        <h3 key={key++} style={H2}>
          {trimmed.replace(/^#\s+/, '')}
        </h3>,
      )
      i++
      continue
    }
    // bulleted list
    if (/^[*\-]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[*\-]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^[*\-]\s+/, ''))
        i++
      }
      nodes.push(
        <ul key={key++} style={UL}>
          {items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>,
      )
      continue
    }

    // paragraph — gather until blank line or structured marker
    const para: string[] = []
    while (i < lines.length) {
      const lt = lines[i].trim()
      if (!lt) break
      if (lt.startsWith('## ') || lt.startsWith('### ') || /^#\s+/.test(lt) || /^[*\-]\s+/.test(lt)) break
      para.push(lt)
      i++
    }
    nodes.push(
      <p key={key++} style={P}>
        {para.join('\n')}
      </p>,
    )
  }

  return <>{nodes}</>
}
