'use client'

import React from 'react'

const AVATAR_BG = [
  '#0F172A', '#3D2B6B', '#0E7C8E', '#1A6B45', '#8B5E0A', '#8B1A1A', '#5C6070',
]

function bgForId(id: string | null | undefined): string {
  if (!id) return AVATAR_BG[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_BG[Math.abs(hash) % AVATAR_BG.length]
}

export function initials(name: string | null | undefined): string {
  return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() || '').join('')
}

interface AvatarProps {
  name?: string | null
  src?: string | null
  userId?: string | null
  size?: number
  online?: boolean | null
  className?: string
  style?: React.CSSProperties
}

export default function Avatar({ name, src, userId, size = 32, online = null, className, style }: AvatarProps) {
  const bg = bgForId(userId || name)
  const label = initials(name)

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        ...style,
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: `${bg}15`,
            color: bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: Math.max(10, size * 0.38),
            fontFamily: "'Cormorant Garamond', Georgia, serif",
          }}
        >
          {label || '?'}
        </div>
      )}
      {online !== null && (
        <span
          style={{
            position: 'absolute',
            bottom: size * 0.02,
            right: size * 0.02,
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: '50%',
            background: online ? '#1A6B45' : '#9097A8',
            border: `2px solid #fff`,
          }}
        />
      )}
    </div>
  )
}
