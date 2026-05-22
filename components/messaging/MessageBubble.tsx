'use client'

import React from 'react'
import { fmtFullTime } from '@/lib/messaging/format'

const TEXT = '#1A1F2E'
const BUBBLE_MINE = '#1B2D4F'
const BUBBLE_THEIRS = '#FFFFFF'
const BORDER = '#DDD8CE'
const MONO = "'SF Mono', Menlo, Consolas, monospace"

export interface MessageBubbleProps {
  body: React.ReactNode
  mine: boolean
  isFirstInGroup?: boolean
  isLastInGroup?: boolean
  timestamp?: string | null
  className?: string
  style?: React.CSSProperties
}

export default function MessageBubble({
  body,
  mine,
  isFirstInGroup = true,
  isLastInGroup = true,
  timestamp,
  className,
  style,
}: MessageBubbleProps) {
  const bubbleRadius = mine
    ? `${isFirstInGroup ? 16 : 4}px ${isFirstInGroup ? 4 : 16}px 16px ${isLastInGroup ? 16 : 4}px`
    : `${isFirstInGroup ? 4 : 16}px ${isFirstInGroup ? 16 : 4}px ${isLastInGroup ? 4 : 16}px 16px`

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: mine ? 'row-reverse' : 'row',
        marginBottom: isLastInGroup ? 10 : 2,
        ...style,
      }}
    >
      <div style={{ maxWidth: '75%', position: 'relative' }}>
        <div
          style={{
            padding: '8px 12px',
            borderRadius: bubbleRadius,
            fontSize: 14,
            lineHeight: 1.45,
            background: mine ? BUBBLE_MINE : BUBBLE_THEIRS,
            color: mine ? '#fff' : TEXT,
            border: mine ? 'none' : `1px solid ${BORDER}`,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: mine ? '0 1px 2px rgba(0,0,0,0.12)' : '0 1px 2px rgba(0,0,0,0.06)',
          }}
        >
          {body}
          {isLastInGroup && timestamp && (
            <span
              style={{
                fontSize: 10,
                opacity: mine ? 0.65 : 0.55,
                marginLeft: 8,
                fontFamily: MONO,
                whiteSpace: 'nowrap',
                verticalAlign: 'bottom',
              }}
            >
              {fmtFullTime(timestamp)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
