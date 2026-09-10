/**
 * Lightweight, safe Markdown renderer for attorney/consultant bio fields AND
 * marketplace gig descriptions.
 *
 * Supported block syntax:
 * - # / ## / ### / #### headings
 * - unordered and ordered lists
 * - blockquotes
 * - paragraphs / intentional line breaks
 *
 * Supported inline syntax:
 * - **bold** and __bold__
 * - *italic*
 * - [label](https://example.com)
 * - `inline code`
 * - ~~strikethrough~~
 * - <u>underline</u> (explicitly parsed; never injected as raw HTML)
 *
 * We intentionally do NOT use dangerouslySetInnerHTML. Stored copy is parsed
 * into React nodes and URL schemes are allow-listed, so seller-authored text
 * cannot turn into executable HTML while legitimate formatting remains intact.
 *
 * Single source of truth — used by SellerAbout, MarketplaceProvidersIndex,
 * find-attorney, attorney-profile, and GigDetailPage / gig SSR.
 */
import React from 'react'

const H2: React.CSSProperties = {
  margin: '22px 0 9px',
  fontSize: 18,
  fontWeight: 650,
  lineHeight: 1.3,
  color: '#0F172A',
}
const H3: React.CSSProperties = {
  margin: '18px 0 7px',
  fontSize: 16,
  fontWeight: 650,
  lineHeight: 1.35,
  color: '#0F172A',
}
const P: React.CSSProperties = {
  margin: '0 0 14px',
  lineHeight: 1.72,
  whiteSpace: 'pre-line',
  color: '#0F172A',
}
const LIST: React.CSSProperties = {
  margin: '9px 0 14px',
  paddingLeft: 24,
  lineHeight: 1.72,
  color: '#0F172A',
}
const QUOTE: React.CSSProperties = {
  margin: '12px 0 16px',
  padding: '2px 0 2px 14px',
  borderLeft: '3px solid rgba(15, 23, 42, .18)',
  color: '#334155',
  lineHeight: 1.68,
}
const INLINE_CODE: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: '.92em',
  background: 'rgba(15, 23, 42, .06)',
  borderRadius: 4,
  padding: '1px 4px',
}

/**
 * Remove HTML comments (`<!-- … -->`) from story copy. Roster-ref / internal
 * annotations were historically embedded in gig descriptions and bios and the
 * renderer must never leak them as visible text.
 */
export function stripHtmlComments(text: string | null | undefined): string {
  if (!text) return ''
  let out = String(text).replace(/<!--[\s\S]*?-->/g, ' ')
  out = out
    .split('\n')
    .map((line) => {
      const c = line.indexOf('<!--')
      return c >= 0 ? line.slice(0, c) : line.replace(/-->/g, ' ')
    })
    .join('\n')
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Replace ONE markdown section (from a heading-prefix line up to the next
 * `## ` heading or the true end of input) inside description copy.
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
  const block = String(replacement || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\s*$/g, '')
  const before = head.length ? head.join('\n') + '\n' : ''
  const after = tail.length ? '\n' + tail.join('\n') : ''
  return (before + block + after).replace(/\n{3,}/g, '\n\n')
}

function safeHref(rawHref: string): string | null {
  const href = String(rawHref || '').trim()
  if (!href) return null
  if (href.startsWith('/') || href.startsWith('#')) return href
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href
  return null
}

/**
 * A malformed writer/model response can leave an opening or closing `**` /
 * `__` behind. Once valid pairs have been parsed, strip only marker-looking
 * dangling pairs so buyers do not see raw Markdown punctuation in prose.
 */
function cleanDanglingMarkers(text: string): string {
  return text
    .replace(/(^|[\s([{])(\*\*|__)(?=\S)/g, '$1')
    .replace(/(\S)(\*\*|__)(?=$|[\s)\]},.!?;:])/g, '$1')
    .replace(/(^|\s)(\*\*|__)(?=\s|$)/g, '$1')
    .replace(/<\/?u>/gi, '')
}

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const source = String(text || '')
  const nodes: React.ReactNode[] = []
  // Order matters: paired strong markers must be consumed before single-star
  // emphasis. Underline HTML is interpreted explicitly rather than injected.
  const tokenRe = /(\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|<u>([^<\n]+)<\/u>|~~([^~\n]+)~~|`([^`\n]+)`|\*([^*\n]+)\*)/gi
  let cursor = 0
  let match: RegExpExecArray | null
  let tokenIndex = 0

  while ((match = tokenRe.exec(source)) !== null) {
    if (match.index > cursor) {
      const plain = cleanDanglingMarkers(source.slice(cursor, match.index))
      if (plain) nodes.push(plain)
    }

    const whole = match[0]
    const key = `${keyPrefix}-${tokenIndex++}`

    if (match[2] != null && match[3] != null) {
      const href = safeHref(match[3])
      if (href) {
        const external = /^https?:/i.test(href)
        nodes.push(
          <a
            key={key}
            href={href}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            style={{ color: '#1D4ED8', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            {renderInlineMarkdown(match[2], `${key}-label`)}
          </a>,
        )
      } else {
        nodes.push(renderInlineMarkdown(match[2], `${key}-label`))
      }
    } else if (match[4] != null) {
      nodes.push(<strong key={key}>{renderInlineMarkdown(match[4], key)}</strong>)
    } else if (match[5] != null) {
      nodes.push(<strong key={key}>{renderInlineMarkdown(match[5], key)}</strong>)
    } else if (match[6] != null) {
      nodes.push(<u key={key}>{renderInlineMarkdown(match[6], key)}</u>)
    } else if (match[7] != null) {
      nodes.push(<del key={key}>{renderInlineMarkdown(match[7], key)}</del>)
    } else if (match[8] != null) {
      nodes.push(<code key={key} style={INLINE_CODE}>{match[8]}</code>)
    } else if (match[9] != null) {
      nodes.push(<em key={key}>{renderInlineMarkdown(match[9], key)}</em>)
    } else {
      nodes.push(cleanDanglingMarkers(whole))
    }

    cursor = tokenRe.lastIndex
  }

  if (cursor < source.length) {
    const plain = cleanDanglingMarkers(source.slice(cursor))
    if (plain) nodes.push(plain)
  }

  return nodes
}

function isStructuredLine(line: string): boolean {
  const trimmed = line.trim()
  return (
    /^#{1,4}\s+/.test(trimmed) ||
    /^[*\-+]\s+/.test(trimmed) ||
    /^\d+[.)]\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed)
  )
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

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      const depth = headingMatch[1].length
      const content = renderInlineMarkdown(headingMatch[2], `h-${key}`)
      if (depth <= 2) {
        nodes.push(<h3 key={key++} style={H2}>{content}</h3>)
      } else {
        nodes.push(<h4 key={key++} style={H3}>{content}</h4>)
      }
      i++
      continue
    }

    if (/^[*\-+]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[*\-+]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^[*\-+]\s+/, ''))
        i++
      }
      const listKey = key++
      nodes.push(
        <ul key={listKey} style={LIST}>
          {items.map((item, j) => (
            <li key={j}>{renderInlineMarkdown(item, `ul-${listKey}-${j}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i++
      }
      const listKey = key++
      nodes.push(
        <ol key={listKey} style={LIST}>
          {items.map((item, j) => (
            <li key={j}>{renderInlineMarkdown(item, `ol-${listKey}-${j}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      const quoteKey = key++
      nodes.push(
        <blockquote key={quoteKey} style={QUOTE}>
          {renderInlineMarkdown(quoteLines.join(' '), `quote-${quoteKey}`)}
        </blockquote>,
      )
      continue
    }

    const para: string[] = []
    while (i < lines.length) {
      const lt = lines[i].trim()
      if (!lt || isStructuredLine(lines[i])) break
      para.push(lt)
      i++
    }
    const paraKey = key++
    const paragraphText = para.join('\n')
    nodes.push(
      <p key={paraKey} style={P}>
        {paragraphText.split('\n').map((line, lineIndex) => (
          <React.Fragment key={`${paraKey}-${lineIndex}`}>
            {lineIndex > 0 && <br />}
            {renderInlineMarkdown(line, `p-${paraKey}-${lineIndex}`)}
          </React.Fragment>
        ))}
      </p>,
    )
  }

  return <>{nodes}</>
}
