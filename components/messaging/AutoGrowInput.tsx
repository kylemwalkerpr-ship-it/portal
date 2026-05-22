'use client'

import React from 'react'

const SANS = "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif"
const BORDER = '#DDD8CE'
const TEXT = '#1A1F2E'

interface AutoGrowInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
  style?: React.CSSProperties
}

export default function AutoGrowInput({ value, onChange, onSubmit, disabled, placeholder, style }: AutoGrowInputProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          onSubmit()
        }
      }}
      placeholder={placeholder}
      rows={1}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '10px 14px',
        background: '#FAFAF7',
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        color: TEXT,
        fontSize: 14,
        fontFamily: SANS,
        outline: 'none',
        resize: 'none',
        overflowY: 'auto',
        lineHeight: 1.4,
        minHeight: 40,
        maxHeight: 120,
        ...style,
      }}
    />
  )
}
