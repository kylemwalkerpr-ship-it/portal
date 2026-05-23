'use client'

import React from 'react'
import { fmtFullTime } from '@/lib/messaging/format'

export interface MessageBubbleProps {
  body: React.ReactNode
  mine: boolean
  isFirstInGroup?: boolean
  isLastInGroup?: boolean
  timestamp?: string | null
  readAt?: string | null
  deliveredAt?: string | null
  className?: string
  style?: React.CSSProperties
}

function CheckIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function CheckDoubleIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
      <polyline points="20 6 9 17 4 12" transform="translate(4, 0)" />
    </svg>
  )
}

function TickBadge({ readAt, deliveredAt }: { readAt?: string | null; deliveredAt?: string | null }) {
  // No data yet → grey delivered tick (never omit)
  const isRead = !!readAt
  const isDelivered = !!deliveredAt || (!readAt && !deliveredAt)
  if (isRead) {
    return <span className="bub-tick read"><CheckDoubleIcon size={13} color="#53BDEB" /></span>
  }
  if (isDelivered) {
    return <span className="bub-tick"><CheckDoubleIcon size={13} color="currentColor" /></span>
  }
  return <span className="bub-tick"><CheckIcon size={13} color="currentColor" /></span>
}

export default function MessageBubble({
  body,
  mine,
  isFirstInGroup = true,
  isLastInGroup = true,
  timestamp,
  readAt,
  deliveredAt,
  className,
  style,
}: MessageBubbleProps) {
  const tailClass = isLastInGroup ? (mine ? 'tail-r' : 'tail-l') : ''
  const rowClass = `bubrow ${mine ? 'mine' : 'theirs'} ${isLastInGroup ? 'last' : ''}`
  const bubClass = `bub ${tailClass}`.trim()

  return (
    <div className={`${rowClass} ${className || ''}`.trim()} style={style}>
      <div className={bubClass}>
        <div className="bub-text">{body}</div>
        {isLastInGroup && timestamp && (
          <div className="bub-foot">
            <span>{fmtFullTime(timestamp)}</span>
            {mine && <TickBadge readAt={readAt} deliveredAt={deliveredAt} />}
          </div>
        )}
      </div>
    </div>
  )
}
