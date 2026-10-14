import React from 'react'

/** Render a small safe subset of message Markdown without interpreting HTML. */
export function renderMessageMarkup(text: string): React.ReactNode {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g)
  return tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={index}>{token.slice(2, -2).trim()}</strong>
    if (token.startsWith('`') && token.endsWith('`')) return <code key={index}>{token.slice(1, -1)}</code>
    const link = token.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (link) {
      try {
        const url = new URL(link[2])
        if (!url.username && !url.password) return <a key={index} href={url.href} target="_blank" rel="noopener noreferrer">{link[1]}</a>
      } catch { /* Preserve invalid URLs as plain text. */ }
    }
    return token
  })
}
