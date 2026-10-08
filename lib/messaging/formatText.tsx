import React from 'react'

/**
 * Formats WhatsApp-style markup into React nodes:
 * - *bold* or **bold** -> <strong>
 * - _italic_ or __italic__ -> <em>
 * - ~strikethrough~ or ~~strikethrough~~ -> <del>
 * - `code` -> <code>
 * - \n -> <br />
 */
export function formatWhatsAppText(text: string): React.ReactNode {
  if (typeof text !== 'string' || !text) {
    return text
  }

  const lines = text.split('\n')

  return lines.map((line, lineIdx) => {
    const formattedLine = parseLineFormatting(line)
    return (
      <React.Fragment key={lineIdx}>
        {formattedLine}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    )
  })
}

function parseLineFormatting(text: string): React.ReactNode[] {
  // Regex matching WhatsApp formatting tokens
  const pattern = /(`[^`]+`|\*{1,2}[^\*\n]+\*{1,2}|_{1,2}[^_\n]+_{1,2}|~{1,2}[^~\n]+~{1,2})/g

  const parts = text.split(pattern)

  return parts.map((part, index) => {
    if (!part) return null

    // Code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          style={{
            background: 'rgba(15,23,42,0.06)',
            padding: '2px 5px',
            borderRadius: '4px',
            fontSize: '0.9em',
            fontFamily: 'monospace',
          }}
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    // Bold (**...** or *...*)
    if (
      (part.startsWith('**') && part.endsWith('**') && part.length >= 4) ||
      (part.startsWith('*') && part.endsWith('*') && part.length >= 2 && !part.startsWith('**'))
    ) {
      const content = part.startsWith('**') ? part.slice(2, -2) : part.slice(1, -1)
      return <strong key={index} style={{ fontWeight: 700 }}>{content}</strong>
    }

    // Italic (__...__ or _..._)
    if (
      (part.startsWith('__') && part.endsWith('__') && part.length >= 4) ||
      (part.startsWith('_') && part.endsWith('_') && part.length >= 2 && !part.startsWith('__'))
    ) {
      const content = part.startsWith('__') ? part.slice(2, -2) : part.slice(1, -1)
      return <em key={index}>{content}</em>
    }

    // Strikethrough (~~...~~ or ~...~)
    if (
      (part.startsWith('~~') && part.endsWith('~~') && part.length >= 4) ||
      (part.startsWith('~') && part.endsWith('~') && part.length >= 2 && !part.startsWith('~~'))
    ) {
      const content = part.startsWith('~~') ? part.slice(2, -2) : part.slice(1, -1)
      return <del key={index}>{content}</del>
    }

    return <React.Fragment key={index}>{part}</React.Fragment>
  })
}
