// @ts-nocheck
'use client'
import React from 'react'
import { C, Badge, Card, Input, Textarea, Btn, LoadingState } from '../design/shared'
import { T, F } from './tokens'

const containerStyle = {
  display: 'flex',
  gap: '32px',
  alignItems: 'flex-start',
}

const sidebarStyle = {
  width: '280px',
  flexShrink: 0,
}

const mainStyle = {
  flex: 1,
  minWidth: 0,
}

const ratingSummary = {
  background: T.vellum,
  border: `1px solid ${T.rule}`,
  borderRadius: '14px',
  padding: '24px',
  marginBottom: '24px',
}

const ratingHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  marginBottom: '24px',
}

const ratingBig = {
  fontFamily: F.display,
  fontSize: '56px',
  fontWeight: 500,
  letterSpacing: '-0.02em',
  lineHeight: 1,
  color: T.ink,
}

const ratingMeta = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const ratingStars = {
  fontSize: '22px',
  color: T.star,
  letterSpacing: '0.05em',
}

const ratingCount = {
  fontFamily: F.mono,
  fontSize: '10.5px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: T.inkSoft,
}

const ratingBarContainer = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
}

const ratingBarRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
}

const ratingBarLabel = {
  fontFamily: F.mono,
  fontSize: '12px',
  fontWeight: 600,
  width: '20px',
  textAlign: 'right' as const,
  color: T.inkMid,
}

const ratingBarTrack = {
  flex: 1,
  height: '8px',
  background: T.paper3,
  borderRadius: '4px',
  overflow: 'hidden',
}

const ratingBarFill = (percent: number) => ({
  height: '100%',
  background: T.star,
  borderRadius: '4px',
  transition: 'width 300ms ease',
  width: `${percent}%`,
})

const ratingBarCount = {
  fontFamily: F.mono,
  fontSize: '12px',
  color: T.inkSoft,
  width: '40px',
  textAlign: 'right' as const,
}

const filterSection = {
  background: T.vellum,
  border: `1px solid ${T.rule}`,
  borderRadius: '14px',
  padding: '20px',
}

const filterTitle = {
  fontFamily: F.mono,
  fontSize: '11px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
  margin: '0 0 16px',
  color: T.inkSoft,
}

const filterGroup = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
  marginBottom: '20px',
}

const filterLabel = {
  fontFamily: F.mono,
  fontSize: '10.5px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
  margin: '0 0 8px',
  color: T.inkSoft,
}

const filterOption = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontFamily: F.ui,
  fontSize: '13.5px',
  color: T.ink,
  cursor: 'pointer',
}

const filterCheckbox = {
  width: '16px',
  height: '16px',
  cursor: 'pointer',
  accentColor: T.indigo,
}

const reviewsHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '24px',
}

const reviewsTitle = {
  fontFamily: F.display,
  fontSize: '24px',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  margin: 0,
  color: T.ink,
}

const reviewsCount = {
  fontFamily: F.mono,
  fontSize: '10.5px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: T.inkSoft,
  marginTop: '4px',
}

const sortSelect = {
  padding: '8px 12px',
  borderRadius: '999px',
  border: `1px solid ${T.rule}`,
  background: T.vellum,
  color: T.ink,
  fontFamily: F.ui,
  fontSize: '13px',
  cursor: 'pointer',
}

const reviewCard = {
  background: T.vellum,
  border: `1px solid ${T.rule}`,
  borderRadius: '14px',
  padding: '24px',
  marginBottom: '16px',
}

const reviewHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: '16px',
}

const reviewAuthor = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
}

const reviewAvatar = {
  width: '44px',
  height: '44px',
  borderRadius: '50%',
  background: T.indigoSoft,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: F.display,
  fontSize: '15px',
  fontWeight: 600,
  color: T.indigo,
}

const reviewAuthorInfo = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '4px',
}

const reviewAuthorName = {
  fontFamily: F.display,
  fontSize: '16px',
  fontWeight: 500,
  letterSpacing: '-0.005em',
  color: T.ink,
}

const reviewDate = {
  fontFamily: F.mono,
  fontSize: '10.5px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: T.inkSoft,
}

const reviewRating = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  fontSize: '17px',
  color: T.star,
}

const reviewTitle = {
  fontFamily: F.display,
  fontSize: '17px',
  fontWeight: 500,
  letterSpacing: '-0.005em',
  margin: '0 0 8px',
  color: T.ink,
}

const reviewComment = {
  fontFamily: F.ui,
  fontSize: '14.5px',
  lineHeight: 1.65,
  color: T.ink,
  margin: '0 0 16px',
}

const reviewBadges = {
  display: 'flex',
  gap: '8px',
  marginBottom: '16px',
}

const reviewReply = {
  background: T.indigoSoft,
  border: `1px solid ${T.rule}`,
  borderRadius: '12px',
  padding: '16px',
  marginTop: '16px',
}

const replyHeader = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
}

const replyLabel = {
  fontFamily: F.mono,
  fontSize: '10.5px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  fontWeight: 600,
  color: T.indigo,
}

const replyText = {
  fontFamily: F.ui,
  fontSize: '14px',
  lineHeight: 1.55,
  color: T.ink,
  margin: 0,
}

const replyForm = {
  marginTop: '16px',
}

const replyTextarea = {
  width: '100%',
  padding: '12px',
  borderRadius: '10px',
  border: `1px solid ${T.rule}`,
  background: T.vellum,
  color: T.ink,
  fontSize: '14px',
  fontFamily: F.ui,
  resize: 'vertical' as const,
  minHeight: '80px',
}

const replyButtons = {
  display: 'flex',
  gap: '8px',
  marginTop: '12px',
}

const emptyState = {
  textAlign: 'center' as const,
  padding: '48px 24px',
  color: T.inkMid,
  fontFamily: F.ui,
}

const emptyIcon = {
  fontSize: '40px',
  marginBottom: '12px',
  color: T.inkMid,
}

const emptyTitle = {
  fontFamily: F.display,
  fontSize: '20px',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  margin: '0 0 8px',
  color: T.ink,
}

const emptyText = {
  fontFamily: F.ui,
  fontSize: '14px',
  margin: 0,
  color: T.inkMid,
}

interface RatingBreakdownProps {
  breakdown: { 5: number; 4: number; 3: number; 2: number; 1: number }
  total: number
}

export function RatingBreakdown({ breakdown, total }: RatingBreakdownProps) {
  const maxCount = Math.max(...Object.values(breakdown), 1)

  return (
    <div style={ratingBarContainer}>
      {[5, 4, 3, 2, 1].map(star => {
        const count = breakdown[star as keyof typeof breakdown]
        const percent = total > 0 ? (count / total) * 100 : 0

        return (
          <div key={star} style={ratingBarRow}>
            <span style={ratingBarLabel}>{star}</span>
            <div style={ratingBarTrack}>
              <div style={ratingBarFill(percent)} />
            </div>
            <span style={ratingBarCount}>{count}</span>
          </div>
        )
      })}
    </div>
  )
}

interface ReviewFiltersProps {
  filters: {
    minRating?: number
    hasReply?: boolean | null
  }
  onFilterChange: (filters: any) => void
  sort: string
  onSortChange: (sort: string) => void
  // Real aggregate for THIS gig/seller (computed server-side over all ratings,
  // independent of the active filters). Defaults represent the no-reviews state.
  average?: number
  total?: number
  breakdown?: { 5: number; 4: number; 3: number; 2: number; 1: number }
}

export function ReviewFilters({ filters, onFilterChange, sort, onSortChange, average = 0, total = 0, breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } }: ReviewFiltersProps) {
  const starGlyphs = (n: number) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n))
  const handleRatingChange = (rating: number) => {
    if (filters.minRating === rating) {
      onFilterChange({ ...filters, minRating: undefined })
    } else {
      onFilterChange({ ...filters, minRating: rating })
    }
  }

  const handleReplyChange = (value: boolean | null) => {
    if (filters.hasReply === value) {
      onFilterChange({ ...filters, hasReply: null })
    } else {
      onFilterChange({ ...filters, hasReply: value })
    }
  }

  return (
    <div style={sidebarStyle}>
      {total > 0 ? (
        <div style={ratingSummary}>
          <div style={ratingHeader}>
            <div style={ratingBig}>{average.toFixed(1)}</div>
            <div style={ratingMeta}>
              <div style={ratingStars}>{starGlyphs(average)}</div>
              <div style={ratingCount}>Based on {total} review{total === 1 ? '' : 's'}</div>
            </div>
          </div>
          <RatingBreakdown breakdown={breakdown} total={total} />
        </div>
      ) : (
        <div style={ratingSummary}>
          <div style={ratingCount}>No reviews yet</div>
        </div>
      )}

      <div style={filterSection}>
        <h3 style={filterTitle}>Filters</h3>

        <div style={filterGroup}>
          <label style={filterLabel}>Minimum Rating</label>
          {[5, 4, 3, 2, 1].map(rating => (
            <label key={rating} style={filterOption}>
              <input
                type="checkbox"
                checked={filters.minRating === rating}
                onChange={() => handleRatingChange(rating)}
                style={filterCheckbox}
              />
              <span>{rating} stars & up</span>
            </label>
          ))}
        </div>

        <div style={filterGroup}>
          <label style={filterLabel}>Reply Status</label>
          <label style={filterOption}>
            <input
              type="checkbox"
              checked={filters.hasReply === true}
              onChange={() => handleReplyChange(true)}
              style={filterCheckbox}
            />
            <span>Has seller reply</span>
          </label>
          <label style={filterOption}>
            <input
              type="checkbox"
              checked={filters.hasReply === false}
              onChange={() => handleReplyChange(false)}
              style={filterCheckbox}
            />
            <span>No reply yet</span>
          </label>
        </div>
      </div>
    </div>
  )
}

interface ReviewCardProps {
  review: {
    id: string
    rating: number
    title?: string
    comment: string
    created_at: string
    is_verified_purchase?: boolean
    seller_reply?: string
    seller_reply_at?: string
    client?: {
      id: string
      full_name?: string
      email?: string
      avatar_url?: string
    }
    gig?: {
      id: string
      title: string
      slug: string
    }
  }
  canReply?: boolean
  onReply?: (reviewId: string, reply: string) => Promise<void>
  onDeleteReply?: (reviewId: string) => Promise<void>
}

export function ReviewCard({ review, canReply = false, onReply, onDeleteReply }: ReviewCardProps) {
  const [showReplyForm, setShowReplyForm] = React.useState(false)
  const [replyText, setReplyText] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const authorName = review.client?.full_name || review.client?.email?.split('@')[0] || 'Anonymous'
  const authorInitials = authorName.split(' ').map(n => n[0]).join('').toUpperCase()
  const date = new Date(review.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const handleSubmitReply = async () => {
    if (!replyText.trim() || !onReply) return

    setSubmitting(true)
    try {
      await onReply(review.id, replyText)
      setShowReplyForm(false)
      setReplyText('')
    } catch (error) {
      console.error('Failed to submit reply:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={reviewCard}>
      <div style={reviewHeader}>
        <div style={reviewAuthor}>
          <div style={reviewAvatar}>
            {review.client?.avatar_url ? (
              <img src={review.client.avatar_url} alt={authorName} style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
            ) : (
              authorInitials
            )}
          </div>
          <div style={reviewAuthorInfo}>
            <div style={reviewAuthorName}>{authorName}</div>
            <div style={reviewDate}>{date}</div>
          </div>
        </div>
        <div style={reviewRating}>
          {'★'.repeat(review.rating)}
          <span style={{ color: T.ruleSoft }}>{'★'.repeat(5 - review.rating)}</span>
        </div>
      </div>

      {review.title && <h4 style={reviewTitle}>{review.title}</h4>}

      <p style={reviewComment}>{review.comment}</p>

      <div style={reviewBadges}>
        {review.is_verified_purchase && (
          <Badge color="green">Verified Purchase</Badge>
        )}
      </div>

      {review.seller_reply ? (
        <div style={reviewReply}>
          <div style={replyHeader}>
            <span style={replyLabel}>Seller Response</span>
            {review.seller_reply_at && (
              <span style={{ fontFamily: F.mono, fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: T.inkSoft }}>
                {new Date(review.seller_reply_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
          </div>
          <p style={replyText}>{review.seller_reply}</p>
          {canReply && onDeleteReply && (
            <button
              onClick={() => onDeleteReply(review.id)}
              style={{
                marginTop: '12px',
                padding: '4px 8px',
                fontFamily: F.ui,
                fontSize: '12px',
                color: T.inkSoft,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Delete reply
            </button>
          )}
        </div>
      ) : canReply && onReply ? (
        <>
          {showReplyForm ? (
            <div style={replyForm}>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Write your response to this review..."
                style={replyTextarea}
              />
              <div style={replyButtons}>
                <Btn
                  onClick={handleSubmitReply}
                  disabled={submitting || !replyText.trim()}
                  variant="primary"
                  size="sm"
                >
                  {submitting ? 'Sending...' : 'Send Reply'}
                </Btn>
                <Btn
                  onClick={() => {
                    setShowReplyForm(false)
                    setReplyText('')
                  }}
                  variant="secondary"
                  size="sm"
                >
                  Cancel
                </Btn>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowReplyForm(true)}
              style={{
                marginTop: '12px',
                padding: '8px 18px',
                fontFamily: F.ui,
                fontSize: '13px',
                fontWeight: 600,
                color: T.indigo,
                background: T.paper,
                border: `1px solid ${T.indigo}`,
                borderRadius: '999px',
                cursor: 'pointer',
              }}
            >
              Reply to Review
            </button>
          )}
        </>
      ) : null}
    </div>
  )
}

interface ReviewsListProps {
  reviews: ReviewCardProps['review'][]
  loading?: boolean
  canReply?: boolean
  onReply?: (reviewId: string, reply: string) => Promise<void>
  onDeleteReply?: (reviewId: string) => Promise<void>
}

export function ReviewsList({ reviews, loading, canReply, onReply, onDeleteReply }: ReviewsListProps) {
  if (loading) {
    return <LoadingState label="Loading reviews..." />
  }

  if (reviews.length === 0) {
    return (
      <div style={emptyState}>
        <div style={emptyIcon}>💬</div>
        <h3 style={emptyTitle}>No reviews yet</h3>
        <p style={emptyText}>Be the first to leave a review!</p>
      </div>
    )
  }

  return (
    <div>
      {reviews.map(review => (
        <ReviewCard
          key={review.id}
          review={review}
          canReply={canReply}
          onReply={onReply}
          onDeleteReply={onDeleteReply}
        />
      ))}
    </div>
  )
}

interface ReviewsSectionProps {
  gigId?: string
  sellerId?: string
  sellerType?: 'attorney' | 'consultant'
  canReply?: boolean
  showFilters?: boolean
}

export function ReviewsSection({
  gigId,
  sellerId,
  sellerType,
  canReply = false,
  showFilters = true,
}: ReviewsSectionProps) {
  const [reviews, setReviews] = React.useState<ReviewCardProps['review'][]>([])
  const [summary, setSummary] = React.useState<{ average: number; total: number; breakdown: { 5: number; 4: number; 3: number; 2: number; 1: number } }>({
    average: 0,
    total: 0,
    breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  })
  const [loading, setLoading] = React.useState(true)
  const [filters, setFilters] = React.useState({
    minRating: undefined as number | undefined,
    hasReply: null as boolean | null,
  })
  const [sort, setSort] = React.useState('newest')

  const loadReviews = React.useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (gigId) params.set('gig_id', gigId)
      if (sellerId && sellerType) {
        params.set('seller_id', sellerId)
        params.set('seller_type', sellerType)
      }
      if (filters.minRating) params.set('min_rating', filters.minRating.toString())
      if (filters.hasReply !== null) params.set('has_reply', filters.hasReply.toString())
      params.set('sort', sort)

      const res = await fetch(`/api/reviews?${params.toString()}`)
      const data = await res.json()

      if (data.data) {
        setReviews(data.data.reviews || [])
        setSummary({
          average: Number(data.data.average_rating) || 0,
          total: Number(data.data.total_reviews) || 0,
          breakdown: data.data.rating_breakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        })
      }
    } catch (error) {
      console.error('Failed to load reviews:', error)
    } finally {
      setLoading(false)
    }
  }, [gigId, sellerId, sellerType, filters, sort])

  React.useEffect(() => {
    loadReviews()
  }, [loadReviews])

  const handleReply = async (reviewId: string, reply: string) => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      })

      if (!res.ok) {
        throw new Error('Failed to submit reply')
      }

      await loadReviews()
    } catch (error) {
      console.error('Failed to submit reply:', error)
      throw error
    }
  }

  const handleDeleteReply = async (reviewId: string) => {
    try {
      const res = await fetch(`/api/reviews/${reviewId}/reply`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete reply')
      }

      await loadReviews()
    } catch (error) {
      console.error('Failed to delete reply:', error)
      throw error
    }
  }

  return (
    <Card style={{ padding: '24px' }}>
      <div style={containerStyle}>
        {showFilters && (
          <div style={sidebarStyle}>
            <ReviewFilters
              filters={filters}
              onFilterChange={setFilters}
              sort={sort}
              onSortChange={setSort}
              average={summary.average}
              total={summary.total}
              breakdown={summary.breakdown}
            />
          </div>
        )}

        <div style={mainStyle}>
          <div style={reviewsHeader}>
            <div>
              <h2 style={reviewsTitle}>Reviews</h2>
              <div style={reviewsCount}>{reviews.length} reviews</div>
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              style={sortSelect}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Rated</option>
              <option value="lowest">Lowest Rated</option>
            </select>
          </div>

          <ReviewsList
            reviews={reviews}
            loading={loading}
            canReply={canReply}
            onReply={handleReply}
            onDeleteReply={handleDeleteReply}
          />
        </div>
      </div>
    </Card>
  )
}
