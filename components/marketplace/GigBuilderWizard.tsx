'use client'
// @ts-nocheck
import React from 'react'
import { C, Card, Btn, Input, Textarea, Badge, ProgressBar } from '../design/shared'
import { CATEGORIES, getCategoryById } from '@/lib/categories'

const wizardContainer = {
  maxWidth: '800px',
  margin: '0 auto',
}

const headerStyle = {
  marginBottom: '32px',
}

const titleStyle = {
  fontFamily: C.serif,
  fontSize: '32px',
  fontWeight: 500,
  margin: '0 0 8px',
  color: C.text,
}

const subtitleStyle = {
  fontSize: '15px',
  color: C.textMuted,
  margin: 0,
}

const progressContainer = {
  marginBottom: '32px',
}

const stepIndicator = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '16px',
}

const stepDot = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  fontWeight: 700,
  background: C.surface2,
  color: C.textMuted,
  border: `2px solid ${C.border}`,
}

const stepDotActive = {
  background: C.cyan,
  color: '#fff',
  borderColor: C.cyan,
}

const stepDotCompleted = {
  background: C.green,
  color: '#fff',
  borderColor: C.green,
}

const stepLabel = {
  fontSize: '12px',
  color: C.textMuted,
  textAlign: 'center',
  marginTop: '8px',
}

const stepLabelActive = {
  color: C.text,
  fontWeight: 600,
}

const formSection = {
  marginBottom: '24px',
}

const formLabel = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 600,
  color: C.text,
  marginBottom: '8px',
}

const formHint = {
  fontSize: '12px',
  color: C.textMuted,
  marginTop: '4px',
}

const formError = {
  fontSize: '12px',
  color: C.red,
  marginTop: '4px',
}

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  border: `1px solid ${C.border2}`,
  borderRadius: '10px',
  background: C.surface2,
  color: C.text,
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const textareaStyle = {
  ...inputStyle,
  minHeight: '120px',
  resize: 'vertical',
}

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
}

const buttonContainer = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '32px',
  paddingTop: '24px',
  borderTop: `1px solid ${C.border}`,
}

const STEPS = [
  { id: 'category', title: 'Category', description: 'Choose your service category' },
  { id: 'basics', title: 'Basics', description: 'Title, pitch, and description' },
  { id: 'pricing', title: 'Pricing', description: 'Set up your pricing tiers' },
  { id: 'details', title: 'Details', description: 'FAQ, requirements, and media' },
  { id: 'review', title: 'Review', description: 'Preview and publish' },
]

interface GigBuilderWizardProps {
  gigId?: string
  existingGig?: any
  onComplete?: (gigId: string) => void
  onCancel?: () => void
}

export function GigBuilderWizard({ gigId, existingGig, onComplete, onCancel }: GigBuilderWizardProps) {
  const [currentStep, setCurrentStep] = React.useState(0)
  const [gigData, setGigData] = React.useState({
    category: existingGig?.category || '',
    subcategory: existingGig?.subcategory || '',
    title: existingGig?.title || '',
    pitch: existingGig?.pitch || '',
    description: existingGig?.description || '',
    tags: existingGig?.tags || [],
    tiers: existingGig?.tiers || [
      { tier: 'basic', title: 'Basic', price: 2500, delivery_days: 7, revisions: 1, features: [], is_active: true },
      { tier: 'standard', title: 'Standard', price: 5000, delivery_days: 14, revisions: 2, features: [], is_active: true },
      { tier: 'premium', title: 'Premium', price: 10000, delivery_days: 21, revisions: 3, features: [], is_active: true },
    ],
    faq: existingGig?.faq || [],
    requirements: existingGig?.requirements || '',
    gallery_images: existingGig?.gallery_images || [],
    video_url: existingGig?.video_url || '',
    seo_title: existingGig?.seo_title || '',
    seo_description: existingGig?.seo_description || '',
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = React.useState('')

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 0) {
      if (!gigData.category) newErrors.category = 'Please select a category'
    }

    if (step === 1) {
      if (!gigData.title.trim()) newErrors.title = 'Title is required'
      if (gigData.title.length < 10) newErrors.title = 'Title must be at least 10 characters'
      if (gigData.title.length > 120) newErrors.title = 'Title must be less than 120 characters'
      if (!gigData.pitch.trim()) newErrors.pitch = 'Pitch is required'
      if (gigData.pitch.length < 30) newErrors.pitch = 'Pitch must be at least 30 characters'
      if (!gigData.description.trim()) newErrors.description = 'Description is required'
      if (gigData.description.length < 100) newErrors.description = 'Description must be at least 100 characters'
    }

    if (step === 2) {
      const activeTiers = gigData.tiers.filter((t: any) => t.is_active)
      if (activeTiers.length === 0) newErrors.tiers = 'At least one pricing tier must be active'
      activeTiers.forEach((tier: any, index: number) => {
        if (!tier.title.trim()) newErrors[`tier_${index}_title`] = 'Tier title is required'
        if (!tier.price || tier.price < 100) newErrors[`tier_${index}_price`] = 'Price must be at least $1.00'
        if (!tier.delivery_days || tier.delivery_days < 1) newErrors[`tier_${index}_delivery`] = 'Delivery time is required'
      })
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < STEPS.length - 1) {
        setCurrentStep(currentStep + 1)
      }
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    setAutoSaveStatus('Saving...')
    try {
      const payload = {
        ...gigData,
        status: 'draft',
      }

      const url = gigId ? `/api/gigs/${gigId}` : '/api/gigs'
      const method = gigId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save draft')
      }

      const data = await res.json()
      const savedGigId = data.gig?.id || gigId

      setAutoSaveStatus('Draft saved!')
      setTimeout(() => setAutoSaveStatus(''), 3000)

      if (onComplete && savedGigId) {
        onComplete(savedGigId)
      }
    } catch (e: any) {
      setAutoSaveStatus(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!validateStep(STEPS.length - 1)) return

    setSaving(true)
    setAutoSaveStatus('Publishing...')
    try {
      const payload = {
        ...gigData,
        status: 'active',
      }

      const url = gigId ? `/api/gigs/${gigId}` : '/api/gigs'
      const method = gigId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to publish gig')
      }

      const data = await res.json()
      const savedGigId = data.gig?.id || gigId

      setAutoSaveStatus('Published!')
      setTimeout(() => setAutoSaveStatus(''), 3000)

      if (onComplete && savedGigId) {
        onComplete(savedGigId)
      }
    } catch (e: any) {
      setAutoSaveStatus(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const updateGigData = (field: string, value: any) => {
    setGigData(prev => ({ ...prev, [field]: value }))
  }

  const updateTier = (index: number, field: string, value: any) => {
    setGigData(prev => ({
      ...prev,
      tiers: prev.tiers.map((tier: any, i: number) =>
        i === index ? { ...tier, [field]: value } : tier
      ),
    }))
  }

  const addFAQ = () => {
    setGigData(prev => ({
      ...prev,
      faq: [...prev.faq, { question: '', answer: '' }],
    }))
  }

  const updateFAQ = (index: number, field: string, value: string) => {
    setGigData(prev => ({
      ...prev,
      faq: prev.faq.map((item: any, i: number) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }))
  }

  const removeFAQ = (index: number) => {
    setGigData(prev => ({
      ...prev,
      faq: prev.faq.filter((_: any, i: number) => i !== index),
    }))
  }

  const progress = ((currentStep + 1) / STEPS.length) * 100

  return (
    <div style={wizardContainer}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>{gigId ? 'Edit Your Gig' : 'Create a New Gig'}</h1>
        <p style={subtitleStyle}>
          {gigId ? 'Update your service details and pricing' : 'Set up your service with clear scope and pricing'}
        </p>
      </div>

      <div style={progressContainer}>
        <ProgressBar value={progress} />
        <div style={stepIndicator}>
          {STEPS.map((step, index) => (
            <div key={step.id} style={{ flex: 1 }}>
              <div
                style={{
                  ...stepDot,
                  ...(index < currentStep ? stepDotCompleted : {}),
                  ...(index === currentStep ? stepDotActive : {}),
                }}
              >
                {index < currentStep ? '✓' : index + 1}
              </div>
              <div
                style={{
                  ...stepLabel,
                  ...(index === currentStep ? stepLabelActive : {}),
                }}
              >
                {step.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Card style={{ padding: '32px' }}>
        {currentStep === 0 && (
          <CategoryStep
            gigData={gigData}
            errors={errors}
            onChange={updateGigData}
          />
        )}

        {currentStep === 1 && (
          <BasicsStep
            gigData={gigData}
            errors={errors}
            onChange={updateGigData}
          />
        )}

        {currentStep === 2 && (
          <PricingStep
            gigData={gigData}
            errors={errors}
            onChange={updateGigData}
            onTierChange={updateTier}
          />
        )}

        {currentStep === 3 && (
          <DetailsStep
            gigData={gigData}
            onChange={updateGigData}
            onAddFAQ={addFAQ}
            onUpdateFAQ={updateFAQ}
            onRemoveFAQ={removeFAQ}
          />
        )}

        {currentStep === 4 && (
          <ReviewStep
            gigData={gigData}
            onEdit={(step) => setCurrentStep(step)}
          />
        )}

        <div style={buttonContainer}>
          <Btn variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Btn>
          <div style={{ display: 'flex', gap: '12px' }}>
            {currentStep > 0 && (
              <Btn variant="secondary" onClick={handleBack} disabled={saving}>
                Back
              </Btn>
            )}
            {currentStep < STEPS.length - 1 ? (
              <Btn variant="primary" onClick={handleNext} disabled={saving}>
                Next
              </Btn>
            ) : (
              <>
                <Btn variant="secondary" onClick={handleSaveDraft} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Draft'}
                </Btn>
                <Btn variant="primary" onClick={handlePublish} disabled={saving}>
                  {saving ? 'Publishing...' : 'Publish Gig'}
                </Btn>
              </>
            )}
          </div>
        </div>

        {autoSaveStatus && (
          <div style={{ marginTop: '16px', fontSize: '13px', color: autoSaveStatus.includes('Error') ? C.red : C.green }}>
            {autoSaveStatus}
          </div>
        )}
      </Card>
    </div>
  )
}

function CategoryStep({ gigData, errors, onChange }: any) {
  const selectedCategory = getCategoryById(gigData.category)

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: C.text }}>
        Choose Your Category
      </h2>

      <div style={formSection}>
        <label style={formLabel}>Category *</label>
        <select
          value={gigData.category}
          onChange={e => onChange('category', e.target.value)}
          style={selectStyle}
        >
          <option value="">Select a category</option>
          {CATEGORIES.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.icon} {cat.name}
            </option>
          ))}
        </select>
        {errors.category && <div style={formError}>{errors.category}</div>}
      </div>

      {selectedCategory && (
        <div style={formSection}>
          <label style={formLabel}>Subcategory</label>
          <select
            value={gigData.subcategory}
            onChange={e => onChange('subcategory', e.target.value)}
            style={selectStyle}
          >
            <option value="">Select a subcategory (optional)</option>
            {selectedCategory.subcategories.map(sub => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ padding: '16px', background: `${C.cyan}08`, borderRadius: '12px', marginTop: '16px' }}>
        <p style={{ fontSize: '13px', color: C.text, margin: 0 }}>
          <strong>Tip:</strong> Choose the category that best describes your service. This helps
          clients find you when they're searching for specific services.
        </p>
      </div>
    </div>
  )
}

function BasicsStep({ gigData, errors, onChange }: any) {
  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: C.text }}>
        Service Basics
      </h2>

      <div style={formSection}>
        <label style={formLabel}>Gig Title *</label>
        <input
          type="text"
          value={gigData.title}
          onChange={e => onChange('title', e.target.value)}
          placeholder="e.g., Study Permit Document Review"
          style={inputStyle}
          maxLength={120}
        />
        <div style={formHint}>
          {gigData.title.length}/120 characters
        </div>
        {errors.title && <div style={formError}>{errors.title}</div>}
      </div>

      <div style={formSection}>
        <label style={formLabel}>One-Line Pitch *</label>
        <textarea
          value={gigData.pitch}
          onChange={e => onChange('pitch', e.target.value)}
          placeholder="A clear, compelling description that appears in search results"
          style={{ ...textareaStyle, minHeight: '80px' }}
          maxLength={300}
        />
        <div style={formHint}>
          {gigData.pitch.length}/300 characters
        </div>
        {errors.pitch && <div style={formError}>{errors.pitch}</div>}
      </div>

      <div style={formSection}>
        <label style={formLabel}>Detailed Description *</label>
        <textarea
          value={gigData.description}
          onChange={e => onChange('description', e.target.value)}
          placeholder="Describe your service in detail. What do clients get? What's included? What makes your service unique?"
          style={textareaStyle}
        />
        <div style={formHint}>
          {gigData.description.length} characters
        </div>
        {errors.description && <div style={formError}>{errors.description}</div>}
      </div>

      <div style={formSection}>
        <label style={formLabel}>Tags</label>
        <input
          type="text"
          value={gigData.tags.join(', ')}
          onChange={e => onChange('tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
          placeholder="visa, documents, review (comma-separated)"
          style={inputStyle}
        />
        <div style={formHint}>
          Add up to 5 relevant tags to help clients find your service
        </div>
      </div>
    </div>
  )
}

function PricingStep({ gigData, errors, onChange, onTierChange }: any) {
  const TIER_NAMES = {
    basic: 'Basic',
    standard: 'Standard',
    premium: 'Premium',
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: C.text }}>
        Pricing Tiers
      </h2>

      <p style={{ fontSize: '14px', color: C.textMuted, marginBottom: '24px' }}>
        Create up to 3 pricing tiers with different scopes and delivery times. At least one tier must be active.
      </p>

      {gigData.tiers.map((tier: any, index: number) => (
        <Card
          key={index}
          style={{
            padding: '20px',
            marginBottom: '16px',
            border: `1px solid ${tier.is_active ? C.cyan : C.border}`,
            background: tier.is_active ? `${C.cyan}08` : C.surface,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: C.text }}>
              {TIER_NAMES[tier.tier as keyof typeof TIER_NAMES] || tier.tier}
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: C.textMuted }}>
              <input
                type="checkbox"
                checked={tier.is_active}
                onChange={e => onTierChange(index, 'is_active', e.target.checked)}
              />
              Active
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={formLabel}>Tier Title</label>
              <input
                type="text"
                value={tier.title}
                onChange={e => onTierChange(index, 'title', e.target.value)}
                placeholder="e.g., Starter Package"
                style={inputStyle}
              />
              {errors[`tier_${index}_title`] && <div style={formError}>{errors[`tier_${index}_title`]}</div>}
            </div>
            <div>
              <label style={formLabel}>Price (USD) *</label>
              <input
                type="number"
                value={tier.price / 100}
                onChange={e => onTierChange(index, 'price', Math.round(parseFloat(e.target.value || '0') * 100))}
                placeholder="25.00"
                min="1"
                step="0.01"
                style={inputStyle}
              />
              {errors[`tier_${index}_price`] && <div style={formError}>{errors[`tier_${index}_price`]}</div>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={formLabel}>Delivery Days *</label>
              <input
                type="number"
                value={tier.delivery_days}
                onChange={e => onTierChange(index, 'delivery_days', parseInt(e.target.value) || 1)}
                placeholder="7"
                min="1"
                style={inputStyle}
              />
              {errors[`tier_${index}_delivery`] && <div style={formError}>{errors[`tier_${index}_delivery`]}</div>}
            </div>
            <div>
              <label style={formLabel}>Revisions</label>
              <input
                type="number"
                value={tier.revisions}
                onChange={e => onTierChange(index, 'revisions', parseInt(e.target.value) || 0)}
                placeholder="1"
                min="0"
                style={inputStyle}
              />
              <div style={formHint}>Enter 999 for unlimited</div>
            </div>
          </div>

          <div>
            <label style={formLabel}>Features (one per line)</label>
            <textarea
              value={tier.features.join('\n')}
              onChange={e => onTierChange(index, 'features', e.target.value.split('\n').map(f => f.trim()).filter(Boolean))}
              placeholder="Document review&#10;Written feedback&#10;One revision round"
              style={{ ...textareaStyle, minHeight: '100px' }}
            />
            <div style={formHint}>
              List what's included in this tier. Each line becomes a feature bullet.
            </div>
          </div>
        </Card>
      ))}

      {errors.tiers && <div style={formError}>{errors.tiers}</div>}
    </div>
  )
}

function DetailsStep({ gigData, onChange, onAddFAQ, onUpdateFAQ, onRemoveFAQ }: any) {
  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700', marginBottom: '24px', color: C.text }}>
        Additional Details
      </h2>

      <div style={formSection}>
        <label style={formLabel}>Client Requirements</label>
        <textarea
          value={gigData.requirements}
          onChange={e => onChange('requirements', e.target.value)}
          placeholder="What information or documents do clients need to provide?&#10;&#10;Example:&#10;- Current visa status&#10;- Passport copy&#10;- Previous refusal letters (if applicable)"
          style={{ ...textareaStyle, minHeight: '100px' }}
        />
        <div style={formHint}>
          Help clients understand what they need to provide before you can start.
        </div>
      </div>

      <div style={formSection}>
        <label style={formLabel}>Video URL (optional)</label>
        <input
          type="url"
          value={gigData.video_url}
          onChange={e => onChange('video_url', e.target.value)}
          placeholder="https://youtube.com/watch?v=..."
          style={inputStyle}
        />
        <div style={formHint}>
          Add a video introduction to showcase your service (YouTube, Vimeo, etc.)
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <label style={formLabel}>FAQ</label>
          <Btn variant="secondary" size="sm" onClick={onAddFAQ}>
            + Add Question
          </Btn>
        </div>

        {gigData.faq.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, background: C.surface2, borderRadius: '12px' }}>
            No FAQ items yet. Add common questions clients might have.
          </div>
        ) : (
          gigData.faq.map((item: any, index: number) => (
            <Card key={index} style={{ padding: '16px', marginBottom: '12px' }}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
                    Question
                  </label>
                  <input
                    type="text"
                    value={item.question}
                    onChange={e => onUpdateFAQ(index, 'question', e.target.value)}
                    placeholder="What's included in this service?"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
                    Answer
                  </label>
                  <textarea
                    value={item.answer}
                    onChange={e => onUpdateFAQ(index, 'answer', e.target.value)}
                    placeholder="This service includes document review, written feedback, and one revision round."
                    style={{ ...textareaStyle, minHeight: '60px' }}
                  />
                </div>
              </div>
              <Btn
                variant="danger"
                size="sm"
                onClick={() => onRemoveFAQ(index)}
                style={{ marginTop: '12px' }}
              >
                Remove
              </Btn>
            </Card>
          ))
        )}
      </div>

      <div style={{ padding: '16px', background: `${C.cyan}08`, borderRadius: '12px' }}>
        <p style={{ fontSize: '13px', color: C.text, margin: 0 }}>
          <strong>Note:</strong> Gallery images will be added after publishing. You can upload
          images and manage your gig gallery from the gig management page.
        </p>
      </div>
    </div>
  )
}

function ReviewStep({ gigData, onEdit }: any) {
  const category = getCategoryById(gigData.category)

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700', marginBottom: '24px', color: C.text }}>
        Review Your Gig
      </h2>

      <Card style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
              Category
            </label>
            <div style={{ fontSize: '15px', color: C.text }}>
              {category?.icon} {category?.name || gigData.category}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
              Title
            </label>
            <div style={{ fontSize: '18px', fontWeight: 700, color: C.text }}>
              {gigData.title}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
              Pitch
            </label>
            <div style={{ fontSize: '14px', color: C.text }}>{gigData.pitch}</div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
              Description
            </label>
            <div style={{ fontSize: '14px', color: C.text, lineHeight: 1.6, maxHeight: '200px', overflow: 'auto' }}>
              {gigData.description}
            </div>
          </div>

          {gigData.tags.length > 0 && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
                Tags
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {gigData.tags.map((tag: string, index: number) => (
                  <Badge key={index} color="cyan">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card style={{ padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: C.text }}>
          Pricing Tiers
        </h3>
        {gigData.tiers
          .filter((t: any) => t.is_active)
          .map((tier: any, index: number) => (
            <div
              key={index}
              style={{
                padding: '16px',
                background: C.surface2,
                borderRadius: '12px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, color: C.text }}>{tier.title}</span>
                <span style={{ fontWeight: 900, color: C.text }}>
                  ${(tier.price / 100).toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: C.textMuted, marginBottom: '8px' }}>
                {tier.delivery_days} day delivery · {tier.revisions >= 999 ? 'Unlimited' : `${tier.revisions} revision${tier.revisions !== 1 ? 's' : ''}`}
              </div>
              {tier.features.length > 0 && (
                <div style={{ fontSize: '13px', color: C.text }}>
                  {tier.features.slice(0, 3).map((f: string, i: number) => (
                    <div key={i}>✓ {f}</div>
                  ))}
                  {tier.features.length > 3 && (
                    <div style={{ color: C.textMuted }}>+{tier.features.length - 3} more</div>
                  )}
                </div>
              )}
            </div>
          ))}
      </Card>

      <Card style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: C.text }}>
          Additional Details
        </h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {gigData.requirements && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
                Requirements
              </label>
              <div style={{ fontSize: '14px', color: C.text }}>{gigData.requirements}</div>
            </div>
          )}
          {gigData.video_url && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
                Video
              </label>
              <a href={gigData.video_url} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontSize: '14px' }}>
                {gigData.video_url}
              </a>
            </div>
          )}
          {gigData.faq.length > 0 && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>
                FAQ ({gigData.faq.length} questions)
              </label>
            </div>
          )}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        <Btn variant="secondary" onClick={() => onEdit(0)}>
          Edit Category
        </Btn>
        <Btn variant="secondary" onClick={() => onEdit(1)}>
          Edit Basics
        </Btn>
        <Btn variant="secondary" onClick={() => onEdit(2)}>
          Edit Pricing
        </Btn>
        <Btn variant="secondary" onClick={() => onEdit(3)}>
          Edit Details
        </Btn>
      </div>
    </div>
  )
}
