'use client'

/**
 * Tiny Markdown renderer for attorney/consultant bio fields.
 *
 * Bios are saved as plain text but attorneys often paste `## Section`
 * headings, `### sub-headings`, and bulleted lists from prep docs.
 * Without a renderer, the literal `##` symbols leak into the page.
 *
 * Scope: headings (## / ###), bulleted lists (* / -), paragraphs.
 * Anything fancier (inline links, bold/italic, tables) is intentionally
 * NOT supported — bios don't need it and keeping the parser tiny avoids
 * pulling in a full markdown dep. Same approach as the apex blog
 * renderInline() helper (commit 40f7947).
 *
 * Single source of truth — used by SellerAbout (marketplace seller
 * profile), MarketplaceProvidersIndex (provider directory), find-attorney
 * (legacy designer view), attorney-profile (preview drawer). Adding more
 * call sites: just import renderBioMarkdown(bio).
 */
import React from 'react'

const BLOCK_SPLIT = /\n{2,}/

export function renderBioMarkdown(bio: string | null | undefined): React.ReactNode {
  if (!bio) return null
  const blocks = String(bio).split(BLOCK_SPLIT)
  return (
    <>
      {blocks.map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        // H2 (## …)
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} style={{ margin: '20px 0 8px', fontSize: 17, fontWeight: 600, lineHeight: 1.3, color: '#1C1410' }}>
              {trimmed.replace(/^## /, '')}
            </h3>
          )
        }
        // H3 (### …)
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} style={{ margin: '16px 0 6px', fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: '#1C1410' }}>
              {trimmed.replace(/^### /, '')}
            </h4>
          )
        }
        // All-bullet block
        const lines = trimmed.split('\n')
        if (lines.length > 0 && lines.every(l => /^\s*[*\-]\s+/.test(l))) {
          return (
            <ul key={i} style={{ margin: '8px 0 12px', paddingLeft: 22, lineHeight: 1.7, color: '#1C1410' }}>
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\s*[*\-]\s+/, '')}</li>
              ))}
            </ul>
          )
        }
        // Plain paragraph — preserve internal single newlines via white-space:pre-line
        return (
          <p key={i} style={{ margin: '0 0 12px', lineHeight: 1.7, whiteSpace: 'pre-line', color: '#1C1410' }}>
            {trimmed}
          </p>
        )
      })}
    </>
  )
}
