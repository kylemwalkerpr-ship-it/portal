'use client'
// @ts-nocheck
import React from 'react'
import { C, Card, Button, Input, Textarea, Badge, LoadingState } from '../shared'

const containerStyle = {
  maxWidth: '600px',
  margin: '0 auto',
}

const formStyle = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
  padding: '32px',
}

const titleStyle = {
  fontSize: '24px',
  fontWeight: 700,
  margin: '0 0 8px',
  color: C.text,
}

const subtitleStyle = {
  fontSize: '14px',
  color: C.textMuted,
  margin: '0 0 32px',
}

const formGroup = {
  marginBottom: '24px',
}

const labelStyle = {
  fontSize: '14px',
  fontWeight: 600,
  display: 'block',
  marginBottom: '8px',
  color: C.text,
}

const requiredStyle = {
  color: '#E53E3E',
  marginLeft: '4px',
}

const ratingStars = {
  display: 'flex',
  gap: '8px',
}

const starButton = {
  fontSize: '32px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0',
  color: C.border,
  transition: 'color 200ms ease',
}

const starButtonActive = {
  color: '#FFD700',
}

const starButtonHover = {
  color: '#FFA500',
}

const ratingLabels = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '8px',
  fontSize: '12px',
  color: C.textMuted,
}

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: '8px',
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  fontSize: '14px',
  fontFamily: C.sans,
}

const textareaStyle = {
  ...inputStyle,
  minHeight: '120px',
  resize: 'vertical',
}

const hintStyle = {
  fontSize: '12px',
  color: C.textMuted,
  marginTop: '4px',
}

const errorStyle = {
  fontSize: '12px',
  color: '#E53E3E',
  marginTop: '4px',
}

const verifiedBadge = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  background: `${C.green}15`,
  border: `1px solid ${C.green}30`,
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  color: C.green,
  marginBottom: '24px',
}

const buttonGroup = {
  display: 'flex',
  gap: '12px',
  marginTop: '32px',
}

const guidelinesStyle = {
  background: `${C.cyan}08`,
  border: `1px solid ${C.cyan}22`,
  borderRadius: '12px',
  padding: '16px',
  marginBottom: '24px',
}

const guidelinesTitle = {
  fontSize: '14px',
  fontWeight: 700,
  margin: '0 0 8px',
  color: C.text,
}

const guidelinesList = {
  fontSize: '13px',
  color: C.textMuted,
  margin: 0,
  paddingLeft: '20px',
  lineHeight: 1.6,
}

interface ReviewFormProps {
  gigId: string
  gigTitle?: string
  orderId?: string
  isVerifiedPurchase?: boolean
  onSuccess?: () => void
  onCancel?: () => void
}

export function ReviewForm({
  gigId,
  gigTitle,
  orderId,
  isVerifiedPurchase = false,
  onSuccess,
  onCancel,
}: ReviewFormProps) {
  const [rating, setRating] = React.useState(0)
  const [hoverRating, setHoverRating] = React.useState(0)
  const [title, setTitle] = React.useState('')
  const [comment, setComment] = React.useState('')
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [submitting, setSubmitting] = React.useState(false)
  const [submitted, setSubmitted] = React.useState(false)

  const ratingLabels = ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent']

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (rating === 0) {
      newErrors.rating = 'Please select a rating'
    }

    if (comment.length < 10) {
      newErrors.comment = 'Review must be at least 10 characters'
    }

    if (comment.length > 1000) {
      newErrors.comment = 'Review must be less than 1000 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gig_id: gigId,
          order_id: orderId,
          rating,
          title: title || undefined,
          comment,
          is_verified_purchase: isVerifiedPurchase,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.message || 'Failed to submit review')
      }

      setSubmitted(true)
      onSuccess?.()
    } catch (error: any) {
      setErrors({ submit: error.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={containerStyle}>
        <Card style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>✓</div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px', color: C.text }}>
            Review Submitted!
          </h2>
          <p style={{ fontSize: '14px', color: C.textMuted, margin: '0 0 24px' }}>
            Thank you for your feedback. Your review will be visible to other users.
          </p>
          <Button onClick={onCancel} variant="primary">
            Close
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={formStyle}>
        <h2 style={titleStyle}>Write a Review</h2>
        <p style={subtitleStyle}>
          Share your experience with {gigTitle || 'this service'}
        </p>

        {isVerifiedPurchase && (
          <div style={verifiedBadge}>
            <span>✓</span>
            <span>Verified Purchase</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={formGroup}>
            <label style={labelStyle}>
              Overall Rating
              <span style={requiredStyle}>*</span>
            </label>
            <div style={ratingStars}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  style={{
                    ...starButton,
                    ...(star <= (hoverRating || rating) ? starButtonActive : {}),
                    ...(star <= hoverRating && star > rating ? starButtonHover : {}),
                  }}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                >
                  ★
                </button>
              ))}
            </div>
            <div style={ratingLabels}>
              {ratingLabels.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>
            {errors.rating && <div style={errorStyle}>{errors.rating}</div>}
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>Review Title (Optional)</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Summarize your experience"
              maxLength={100}
            />
            <div style={hintStyle}>{title.length}/100 characters</div>
          </div>

          <div style={formGroup}>
            <label style={labelStyle}>
              Your Review
              <span style={requiredStyle}>*</span>
            </label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Tell others about your experience. What did you like? What could be improved?"
              style={textareaStyle}
            />
            <div style={hintStyle}>{comment.length}/1000 characters</div>
            {errors.comment && <div style={errorStyle}>{errors.comment}</div>}
          </div>

          <div style={guidelinesStyle}>
            <h4 style={guidelinesTitle}>Review Guidelines</h4>
            <ul style={guidelinesList}>
              <li>Be honest and specific about your experience</li>
              <li>Focus on the service quality and communication</li>
              <li>Avoid personal attacks or offensive language</li>
              <li>Don't include personal information or contact details</li>
              <li>Only review services you've actually used</li>
            </ul>
          </div>

          {errors.submit && (
            <div style={{ ...errorStyle, marginBottom: '16px' }}>{errors.submit}</div>
          )}

          <div style={buttonGroup}>
            <Button
              type="submit"
              variant="primary"
              disabled={submitting}
              loading={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Review'}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="secondary"
                onClick={onCancel}
                disabled={submitting}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

interface ReviewModalProps extends ReviewFormProps {
  isOpen: boolean
  onClose: () => void
}

export function ReviewModal({ isOpen, onClose, ...props }: ReviewModalProps) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.bg,
          borderRadius: '16px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <ReviewForm {...props} onCancel={onClose} />
      </div>
    </div>
  )
}
