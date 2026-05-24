'use client'

import React from 'react'

interface ProfilePreviewDrawerProps {
  sellerId: string | null
  viewerId?: string | null
  open: boolean
  onClose: () => void
}

const INDIGO = '#3C3B6E'
const STAR = '#C68B27'
const TEXT_SOFT = '#64748B'
const TEXT_MID = '#334155'
const TEXT = '#0F172A'
const BORDER = '#E2E8F0'
const PANEL = '#FFFFFF'
const MOSS = '#5F6B3A'

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? STAR : 'none'} stroke={STAR} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function Stars({ avg, count }: { avg: number | null; count: number }) {
  const rounded = Math.round((avg || 0))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} filled={i <= rounded} />
        ))}
      </div>
      {count > 0 && (
        <span style={{ fontSize: 12, color: TEXT_SOFT }}>
          {avg?.toFixed(1) ?? '0.0'} · {count} review{count === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

export default function ProfilePreviewDrawer({ sellerId, viewerId, open, onClose }: ProfilePreviewDrawerProps) {
  const [seller, setSeller] = React.useState<any>(null)
  const [gigs, setGigs] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  // Suppress when viewing self
  const suppressed = !!sellerId && !!viewerId && sellerId === viewerId

  React.useEffect(() => {
    if (!open || !sellerId || suppressed) return
    setLoading(true)
    setError('')
    Promise.all([
      fetch(`/api/sellers/${sellerId}`, { credentials: 'same-origin' }).then(r => r.json().catch(() => ({}))),
      fetch(`/api/sellers/${sellerId}/gigs`, { credentials: 'same-origin' }).then(r => r.json().catch(() => ({}))),
    ])
      .then(([sellerRes, gigsRes]) => {
        setSeller(sellerRes?.data?.seller || null)
        setGigs(gigsRes?.data?.gigs || [])
      })
      .catch(() => setError('Could not load profile.'))
      .finally(() => setLoading(false))
  }, [open, sellerId, suppressed])

  if (!open || suppressed) return null

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(15,23,42,0.35)',
        display: 'flex', justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? '100%' : 380,
          height: '100%',
          background: PANEL,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: `1px solid ${BORDER}`,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_MID }}>Profile</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: TEXT_MID }}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: TEXT_SOFT, fontSize: 13 }}>Loading…</div>
          )}
          {error && (
            <div style={{ textAlign: 'center', padding: 40, color: '#B22234', fontSize: 13 }}>{error}</div>
          )}
          {!loading && !error && !seller && (
            <div style={{ textAlign: 'center', padding: 40, color: TEXT_SOFT, fontSize: 13 }}>Profile not found.</div>
          )}
          {!loading && !error && seller && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Avatar + Name + Role */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 96, height: 96, borderRadius: '50%',
                  background: seller.headshot_url ? 'transparent' : INDIGO,
                  overflow: 'hidden',
                  display: 'grid', placeItems: 'center',
                }}>
                  {seller.headshot_url ? (
                    <img src={seller.headshot_url} alt="" style={{ width: 96, height: 96, objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 36, color: '#fff', fontWeight: 600 }}>
                      {(seller.full_name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{
                  fontFamily: "var(--font-lora), 'Lora', Georgia, serif",
                  fontSize: 22, fontWeight: 600, color: TEXT, textAlign: 'center',
                }}>
                  {seller.full_name || 'Seller'}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  padding: '3px 10px', borderRadius: 999,
                  background: `${INDIGO}10`, color: INDIGO,
                }}>
                  {seller.role === 'attorney' ? 'Attorney' : seller.role === 'consultant' ? 'Consultant' : 'Client'}
                </span>
              </div>

              {/* Tagline */}
              {seller.tagline && (
                <div style={{ fontSize: 13, color: TEXT_MID, textAlign: 'center', lineHeight: 1.5 }}>
                  {seller.tagline}
                </div>
              )}

              {/* Rating */}
              <Stars avg={seller.rating_avg} count={seller.rating_count} />

              {/* Jurisdictions (attorney only) */}
              {seller.role === 'attorney' && Array.isArray(seller.jurisdictions) && seller.jurisdictions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {seller.jurisdictions.map((j: string) => (
                    <span key={j} style={{
                      fontSize: 11, fontWeight: 500,
                      padding: '3px 8px', borderRadius: 6,
                      background: `${MOSS}10`, color: MOSS,
                    }}>{j}</span>
                  ))}
                </div>
              )}

              {/* Specialties / practice areas */}
              {Array.isArray(seller.specialties) && seller.specialties.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_SOFT, marginBottom: 6 }}>
                    Specialties
                  </div>
                  <div style={{ fontSize: 13, color: TEXT_MID }}>
                    {seller.specialties.slice(0, 6).join(', ')}
                  </div>
                </div>
              )}
              {(!Array.isArray(seller.specialties) || seller.specialties.length === 0) &&
                Array.isArray(seller.practice_areas) && seller.practice_areas.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_SOFT, marginBottom: 6 }}>
                    Practice areas
                  </div>
                  <div style={{ fontSize: 13, color: TEXT_MID }}>
                    {seller.practice_areas.slice(0, 6).join(', ')}
                  </div>
                </div>
              )}

              {/* Languages */}
              {Array.isArray(seller.languages) && seller.languages.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_SOFT, marginBottom: 6 }}>
                    Languages
                  </div>
                  <div style={{ fontSize: 13, color: TEXT_MID }}>
                    {seller.languages.join(', ')}
                  </div>
                </div>
              )}

              {/* Years of experience */}
              {seller.years_experience && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_SOFT, marginBottom: 6 }}>
                    Experience
                  </div>
                  <div style={{ fontSize: 13, color: TEXT_MID }}>
                    {seller.years_experience} year{seller.years_experience === 1 ? '' : 's'}
                  </div>
                </div>
              )}

              {/* Top 3 gigs */}
              {gigs.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_SOFT, marginBottom: 8 }}>
                    Top services
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {gigs.slice(0, 3).map((gig: any) => (
                      <div key={gig.id} style={{
                        padding: 10, borderRadius: 8,
                        border: `1px solid ${BORDER}`,
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{gig.title}</div>
                        <div style={{ fontSize: 12, color: TEXT_SOFT }}>
                          {gig.starting_price ? `From $${gig.starting_price}` : ''}
                          {gig.order_count ? ` · ${gig.order_count} order${gig.order_count === 1 ? '' : 's'}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer link */}
              <a
                href={`https://market.yousafeconsultancy.com/providers/${seller.profile_id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 13, fontWeight: 600, color: INDIGO,
                  textDecoration: 'none', marginTop: 4,
                }}
              >
                View full profile →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
