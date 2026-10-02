'use client'

import type { ReactNode } from 'react'
import { trackAttributionCta } from '@/lib/attribution/client'

/**
 * A plain anchor that records a consented `cta_click` (navigation evidence
 * only, never a conversion claim) before navigating. Safe to render from
 * server components; tracking is a no-op without analytics consent.
 */
export default function TrackedCtaLink({
  href,
  ctaId,
  className,
  children,
}: {
  href: string
  ctaId: string
  className?: string
  children: ReactNode
}) {
  return (
    <a href={href} className={className} onClick={() => trackAttributionCta(ctaId)}>
      {children}
    </a>
  )
}
