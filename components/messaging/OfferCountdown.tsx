'use client'
/**
 * OfferCountdown
 *
 * Displays a live, minute-ticking countdown until `expiresAt`. Used inside
 * MessageOfferCard (in place of its inline day-granularity ExpiryBadge) and
 * intended for reuse anywhere a pending offer is shown (e.g. shared offers
 * list in a future conversation sidebar).
 *
 * Format examples:
 *   "Expires in 2 days"
 *   "Expires in 6 hours"
 *   "Expires in 12 min"
 *   "Expired"
 */
import { useEffect, useState } from 'react'

export interface OfferCountdownProps {
  expiresAt: string
  className?: string
}

function formatRemaining(expiresAt: string): { label: string; expired: boolean } {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return { label: 'Expired', expired: true }
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return { label: `Expires in ${days} day${days === 1 ? '' : 's'}`, expired: false }
  if (hours >= 1) return { label: `Expires in ${hours} hour${hours === 1 ? '' : 's'}`, expired: false }
  if (minutes >= 1) return { label: `Expires in ${minutes} min`, expired: false }
  return { label: 'Expires in <1 min', expired: false }
}

export function OfferCountdown({ expiresAt, className }: OfferCountdownProps) {
  const [{ label, expired }, setState] = useState(() => formatRemaining(expiresAt))

  useEffect(() => {
    setState(formatRemaining(expiresAt))
    const id = setInterval(() => setState(formatRemaining(expiresAt)), 60_000)
    return () => clearInterval(id)
  }, [expiresAt])

  const color = expired ? '#DC2626' : '#D97706' // red-600 / amber-600
  return (
    <span
      className={className}
      style={{ fontSize: 12, fontWeight: 500, color }}
    >
      {label}
    </span>
  )
}

export default OfferCountdown
