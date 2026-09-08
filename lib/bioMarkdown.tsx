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

/**
 * Remove HTML comments (`<!-- … -->`) from story copy. Roster-ref / internal
 * annotations were historically embedded in gig descriptions and bios and the
 * tiny markdown renderer leaked them as visible text; this keeps the copy clean
 * at the renderer layer even if a legacy comment survives in storage. Bare
 * unterminated `<!--`/`-->` tokens are dropped too. Legitimate markdown is
 * otherwise preserved byte-for-byte.
 */
export function stripHtmlComments(text: string | null | undefined): string {
  if (!text) return ''
  // Well-formed comments first (may span lines).
  let out = String(text).replace(/<!--[\s\S]*?-->/g, ' ')
  // Residual malformed markers: an unterminated `<!--` swallows the rest of
  // ITS line (the internal marker body must never render). Stray `-->`.
  out = out
    .split('\n')
    .map((line) => {
      const c = line.indexOf('<!--')
      return c >= 0 ? line.slice(0, c) : line.replace(/-->/g, ' ')
    })
    .join('\n')
  // Collapse the whitespace a removed comment can leave (incl. blank lines).
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Replace ONE markdown section (from a heading-prefix line up to the next
 * `## ` heading or the TRUE end of input) inside description copy.
 *
 * Explicitly avoids regex `\Z`-style asserts: in JS `\Z` is an identity escape
 * (matches the literal letter "Z"), which would falsely terminate a section
 * whenever the copy contains a "Z". Section boundaries are found by scanning
 * physical lines, which handles (a) a section at the very end of the input,
 * (b) a following `## ` heading, and (c) arbitrary letter "Z" content.
 *
 * Falls back to `description` unchanged when the heading is not present.
 */
export function replaceMarkdownSection(
  description: string,
  headingPrefix: string,
  replacement: string,
): string {
  const src = String(description || '').replace(/\r\n/g, '\n')
  const lines = src.split('\n')
  const prefix = (headingPrefix || '').trim()
  if (!prefix) return description || ''
  const headingIdx = lines.findIndex((l) => l.trim().startsWith(prefix))
  if (headingIdx < 0) return description || ''
  let nextIdx = lines.length
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i].trim())) {
      nextIdx = i
      break
    }
  }
  const head = lines.slice(0, headingIdx)
  const tail = lines.slice(nextIdx)
  const block = String(replacement || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s*$/g, '')
  const before = head.length ? head.join('\n') + '\n' : ''
  const after = tail.length ? '\n' + tail.join('\n') : ''
  return (before + block + after).replace(/\n{3,}/g, '\n\n')
}

export function renderBioMarkdown(bio: string | null | undefined): React.ReactNode {
  if (!bio) return null
  const lines = stripHtmlComments(bio).replace(/\r\n/g, '\n').split('\n')
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
