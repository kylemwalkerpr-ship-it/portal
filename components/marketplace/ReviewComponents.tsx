'use client'
// @ts-nocheck
import React from 'react'
import { C, Badge, Card, Input, Textarea, Btn, LoadingState } from '../design/shared'

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
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
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
  fontSize: '64px',
  fontWeight: 900,
  lineHeight: 1,
  color: C.text,
}

const ratingMeta = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const ratingStars = {
  fontSize: '24px',
  color: '#FFD700',
}

const ratingCount = {
  fontSize: '14px',
  color: C.textMuted,
}

const ratingBarContainer = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const ratingBarRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
}

const ratingBarLabel = {
  fontSize: '13px',
  fontWeight: 600,
  width: '20px',
  textAlign: 'right',
  color: C.text,
}

const ratingBarTrack = {
  flex: 1,
  height: '8px',
  background: `${C.border}`,
  borderRadius: '4px',
  overflow: 'hidden',
}

const ratingBarFill = (percent: number) => ({
  height: '100%',
  background: '#FFD700',
  borderRadius: '4px',
  transition: 'width 300ms ease',
  width: `${percent}%`,
})

const ratingBarCount = {
  fontSize: '13px',
  color: C.textMuted,
  width: '40px',
  textAlign: 'right',
}

const filterSection = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
  padding: '20px',
}

const filterTitle = {
  fontSize: '14px',
  fontWeight: 700,
  margin: '0 0 16px',
  color: C.text,
}

const filterGroup = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginBottom: '20px',
}

const filterLabel = {
  fontSize: '13px',
  fontWeight: 600,
  margin: '0 0 8px',
  color: C.text,
}

const filterOption = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  color: C.text,
  cursor: 'pointer',
}

const filterCheckbox = {
  width: '16px',
  height: '16px',
  cursor: 'pointer',
}

const reviewsHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '24px',
}

const reviewsTitle = {
  fontSize: '20px',
  fontWeight: 700,
  margin: 0,
  color: C.text,
}

const reviewsCount = {
  fontSize: '14px',
  color: C.textMuted,
}

const sortSelect = {
  padding: '8px 12px',
  borderRadius: '8px',
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  fontSize: '13px',
  cursor: 'pointer',
}

const reviewCard = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
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
  width: '48px',
  height: '48px',
  borderRadius: '50%',
  background: `${C.cyan}22`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '16px',
  fontWeight: 700,
  color: C.cyan,
}

const reviewAuthorInfo = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const reviewAuthorName = {
  fontSize: '15px',
  fontWeight: 700,
  color: C.text,
}

const reviewDate = {
  fontSize: '12px',
  color: C.textMuted,
}

const reviewRating = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '18px',
  color: '#FFD700',
}

const reviewTitle = {
  fontSize: '16px',
  fontWeight: 700,
  margin: '0 0 8px',
  color: C.text,
}

const reviewComment = {
  fontSize: '14px',
  lineHeight: 1.6,
  color: C.text,
  margin: '0 0 16px',
}

const reviewBadges = {
  display: 'flex',
  gap: '8px',
  marginBottom: '16px',
}

const reviewReply = {
  background: `${C.cyan}08`,
  border: `1px solid ${C.cyan}22`,
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
  fontSize: '13px',
  fontWeight: 700,
  color: C.cyan,
}

const replyText = {
  fontSize: '14px',
  lineHeight: 1.5,
  color: C.text,
  margin: 0,
}

const replyForm = {
  marginTop: '16px',
}

const replyTextarea = {
  width: '100%',
  padding: '12px',
  borderRadius: '8px',
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  fontSize: '14px',
  fontFamily: C.sans,
  resize: 'vertical',
  minHeight: '80px',
}

const replyButtons = {
  display: 'flex',
  gap: '8px',
  marginTop: '12px',
}

const emptyState = {
  textAlign: 'center',
  padding: '48px 24px',
  color: C.textMuted,
}

const emptyIcon = {
  fontSize: '48px',
  marginBottom: '16px',
}

const emptyTitle = {
  fontSize: '18px',
  fontWeight: 700,
  margin: '0 0 8px',
  color: C.text,
}

const emptyText = {
  fontSize: '14px',
  margin: 0,
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
}

export function ReviewFilters({ filters, onFilterChange, sort, onSortChange }: ReviewFiltersProps) {
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
      <div style={ratingSummary}>
        <div style={ratingHeader}>
          <div style={ratingBig}>4.8</div>
          <div style={ratingMeta}>
            <div style={ratingStars}>★★★★★</div>
            <div style={ratingCount}>Based on 128 reviews</div>
          </div>
        </div>
        <RatingBreakdown breakdown={{ 5: 98, 4: 20, 3: 6, 2: 3, 1: 1 }} total={128} />
      </div>

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
          <span style={{ color: C.border }}>{'★'.repeat(5 - review.rating)}</span>
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
              <span style={{ fontSize: '12px', color: C.textMuted }}>
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
                fontSize: '12px',
                color: C.textMuted,
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
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                color: C.cyan,
                background: 'none',
                border: `1px solid ${C.cyan}`,
                borderRadius: '8px',
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
    <div style={containerStyle}>
      {showFilters && (
        <div style={sidebarStyle}>
          <ReviewFilters
            filters={filters}
            onFilterChange={setFilters}
            sort={sort}
            onSortChange={setSort}
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
  )
}
