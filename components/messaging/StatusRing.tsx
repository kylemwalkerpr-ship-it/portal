'use client'

/**
 * StatusRing — wraps an Avatar (or any circular child) with a WhatsApp-style
 * 2px ring that signals whether the person has an active inquiry-status
 * broadcast, and whether the current viewer has already opened it.
 *
 *   hasStatus + !viewed → solid indigo ring (#3C3B6E)
 *   hasStatus +  viewed → dashed border-color ring (#E2E8F0)
 *   !hasStatus          → no ring; child renders alone
 */
import React from 'react'

interface StatusRingProps {
  children: React.ReactNode
  hasStatus: boolean
  viewed: boolean
  size?: number
}

export default function StatusRing({ children, hasStatus, viewed, size = 40 }: StatusRingProps) {
  if (!hasStatus) return <>{children}</>

  const stroke = viewed ? '#E2E8F0' : '#3C3B6E'
  const dasharray = viewed ? '4 3' : undefined
  // SVG sits behind the avatar with 2px padding so the ring hugs but doesn't clip.
  const ringSize = size + 6
  const r = (ringSize - 2) / 2

  return (
    <div
      style={{
        position: 'relative',
        width: ringSize,
        height: ringSize,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={ringSize}
        height={ringSize}
        viewBox={`0 0 ${ringSize} ${ringSize}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray={dasharray}
        />
      </svg>
      <div style={{ width: size, height: size, position: 'relative' }}>{children}</div>
    </div>
  )
}
