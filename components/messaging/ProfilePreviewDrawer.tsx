'use client'

import React from 'react'

interface ProfilePreviewDrawerProps {
  sellerId: string | null
  viewerId?: string | null
  open: boolean
  onClose: () => void
}

const ROLE_LABELS: Record<string, string> = {
  attorney: 'Licensed attorney',
  consultant: 'Regulated consultant',
  client: 'YouSafe client',
}

function Stars({ avg, count }: { avg: number | null; count: number }) {
  if (!count) return null
  return (
    <div className="ys-contact-rating" aria-label={`${avg?.toFixed(1) || '0.0'} out of 5 from ${count} reviews`}>
      <span aria-hidden="true">★</span>
      <strong>{avg?.toFixed(1) || '0.0'}</strong>
      <span>{count} review{count === 1 ? '' : 's'}</span>
    </div>
  )
}

function DetailRow({ icon, label, value, muted }: { icon: string; label: string; value: React.ReactNode; muted?: boolean }) {
  if (!value) return null
  return (
    <div className="ys-contact-row">
      <span className="ys-contact-row-icon" aria-hidden="true">{icon}</span>
      <div className="ys-contact-row-copy">
        <span className="ys-contact-row-label">{label}</span>
        <span className={`ys-contact-row-value ${muted ? 'is-muted' : ''}`}>{value}</span>
      </div>
    </div>
  )
}

export default function ProfilePreviewDrawer({ sellerId, viewerId, open, onClose }: ProfilePreviewDrawerProps) {
  const [seller, setSeller] = React.useState<any>(null)
  const [gigs, setGigs] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const suppressed = !!sellerId && !!viewerId && sellerId === viewerId

  React.useEffect(() => {
    if (!open || !sellerId || suppressed) return
    let cancelled = false
    setLoading(true)
    setError('')

    Promise.all([
      fetch(`/api/sellers/${sellerId}`, { credentials: 'same-origin' }).then(r => r.json().catch(() => ({}))),
      fetch(`/api/sellers/${sellerId}/gigs`, { credentials: 'same-origin' }).then(r => r.json().catch(() => ({}))),
    ])
      .then(([sellerRes, gigsRes]) => {
        if (cancelled) return
        setSeller(sellerRes?.data?.seller || null)
        setGigs(gigsRes?.data?.gigs || [])
      })
      .catch(() => {
        if (!cancelled) setError('Could not load profile.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, sellerId, suppressed])

  React.useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  React.useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  if (!open || suppressed) return null

  const role = seller?.role || 'client'
  const roleLabel = ROLE_LABELS[role] || 'YouSafe member'
  const specialties =
    Array.isArray(seller?.specialties) && seller.specialties.length
      ? seller.specialties
      : Array.isArray(seller?.practice_areas)
        ? seller.practice_areas
        : []

  const memberSince = seller?.member_since
    ? new Date(seller.member_since).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null

  return (
    <div className="ys-contact-info-layer" role="presentation" onClick={onClose}>
      <section
        className="ys-contact-info"
        role="dialog"
        aria-modal="true"
        aria-label="Contact info"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ys-contact-info-head">
          <button type="button" className="ys-contact-back" onClick={onClose} aria-label="Back to conversation">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <strong>Contact info</strong>
          <span className="ys-contact-head-spacer" />
        </header>

        <div className="ys-contact-info-scroll">
          {loading && (
            <div className="ys-contact-state">
              <span className="ys-contact-spinner" aria-hidden="true" />
              <span>Loading profile…</span>
            </div>
          )}

          {error && (
            <div className="ys-contact-state is-error">
              <strong>Profile unavailable</strong>
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && !seller && (
            <div className="ys-contact-state">
              <strong>Profile details are unavailable</strong>
              <span>You can continue this conversation normally.</span>
            </div>
          )}

          {!loading && !error && seller && (
            <>
              <section className="ys-contact-hero">
                <div className="ys-contact-avatar-ring">
                  <div className="ys-contact-avatar">
                    {seller.headshot_url ? (
                      <img src={seller.headshot_url} alt={seller.full_name || ''} />
                    ) : (
                      <span>{(seller.full_name || '?').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </div>

                <h2>{seller.full_name || 'YouSafe member'}</h2>
                <p className="ys-contact-role">{roleLabel}</p>
                {seller.tagline && <p className="ys-contact-tagline">{seller.tagline}</p>}
                <Stars avg={seller.rating_avg} count={seller.rating_count || 0} />

                {role !== 'client' && seller.profile_id && (
                  <a
                    className="ys-contact-primary-action"
                    href={`https://market.yousafeconsultancy.com/providers/${seller.profile_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View marketplace profile
                    <span aria-hidden="true">↗</span>
                  </a>
                )}
              </section>

              <section className="ys-contact-card" aria-label="Profile details">
                {seller.country && <DetailRow icon="◎" label="Country" value={seller.country} />}
                {memberSince && <DetailRow icon="◷" label="Member since" value={memberSince} />}
                {seller.years_experience && (
                  <DetailRow icon="◇" label="Experience" value={`${seller.years_experience} year${seller.years_experience === 1 ? '' : 's'}`} />
                )}
                {Array.isArray(seller.languages) && seller.languages.length > 0 && (
                  <DetailRow icon="文" label="Languages" value={seller.languages.join(', ')} />
                )}
                {role === 'client' && typeof seller.inquiry_count === 'number' && (
                  <DetailRow
                    icon="◫"
                    label="Marketplace activity"
                    value={`${seller.inquiry_count} inquir${seller.inquiry_count === 1 ? 'y' : 'ies'} posted`}
                    muted
                  />
                )}
              </section>

              {role === 'attorney' && Array.isArray(seller.jurisdictions) && seller.jurisdictions.length > 0 && (
                <section className="ys-contact-card">
                  <h3>Jurisdictions</h3>
                  <div className="ys-contact-chip-row">
                    {seller.jurisdictions.map((item: string) => (
                      <span key={item} className="ys-contact-chip">{item}</span>
                    ))}
                  </div>
                </section>
              )}

              {specialties.length > 0 && (
                <section className="ys-contact-card">
                  <h3>{role === 'attorney' ? 'Practice areas' : 'Specialties'}</h3>
                  <div className="ys-contact-chip-row">
                    {specialties.slice(0, 8).map((item: string) => (
                      <span key={item} className="ys-contact-chip">{item}</span>
                    ))}
                  </div>
                </section>
              )}

              {gigs.length > 0 && (
                <section className="ys-contact-card">
                  <div className="ys-contact-card-title-row">
                    <h3>Services</h3>
                    <span>{Math.min(gigs.length, 3)} shown</span>
                  </div>
                  <div className="ys-contact-services">
                    {gigs.slice(0, 3).map((gig: any) => (
                      <div key={gig.id} className="ys-contact-service">
                        <div>
                          <strong>{gig.title}</strong>
                          <span>
                            {gig.order_count ? `${gig.order_count} order${gig.order_count === 1 ? '' : 's'}` : 'Available on YouSafe'}
                          </span>
                        </div>
                        {gig.starting_price ? (
                          <b>${Number(gig.starting_price / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="ys-contact-card ys-contact-safety">
                <h3>Messaging on YouSafe</h3>
                <DetailRow
                  icon="⌁"
                  label="Conversation context"
                  value="Messages, files and service activity stay attached to this YouSafe conversation."
                  muted
                />
                <DetailRow
                  icon="✓"
                  label="Platform protections"
                  value="Use YouSafe messaging and checkout for the clearest service record and support trail."
                  muted
                />
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
