// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import { Card, Btn, Input, Textarea, Badge, ProgressBar } from '../design/shared'
import { T, F } from './tokens'
import { CATEGORIES, getCategoryById, getCategorySourceLabels, getSubcategoryById } from '@/lib/categories'
import { ProfileCompletenessBanner } from './ProfileCompletenessBanner'

const wizardContainer: CSSProperties = {
  maxWidth: '800px',
  margin: '0 auto',
}

const headerStyle: CSSProperties = {
  marginBottom: '32px',
}

const titleStyle: CSSProperties = {
  fontFamily: F.display,
  fontSize: '32px',
  fontWeight: 500,
  margin: '0 0 8px',
  color: T.ink,
}

const subtitleStyle: CSSProperties = {
  fontSize: '15px',
  color: T.inkMid,
  margin: 0,
}

const progressContainer: CSSProperties = {
  marginBottom: '32px',
}

const stepIndicator: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '16px',
}

const stepDot: CSSProperties = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  fontWeight: 700,
  background: T.paper2,
  color: T.inkMid,
  border: `2px solid ${T.rule}`,
}

const stepDotActive: CSSProperties = {
  background: T.indigo,
  color: '#fff',
  borderColor: T.indigo,
}

const stepDotCompleted: CSSProperties = {
  background: T.moss,
  color: '#fff',
  borderColor: T.moss,
}

const stepLabel: CSSProperties = {
  fontSize: '11px',
  color: T.inkMid,
  textAlign: 'center',
  marginTop: '8px',
  fontFamily: F.mono,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const stepLabelActive: CSSProperties = {
  color: T.ink,
  fontWeight: 600,
}

const formSection: CSSProperties = {
  marginBottom: '24px',
}

const formLabel: CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 600,
  color: T.ink,
  marginBottom: '8px',
}

const formHint: CSSProperties = {
  fontSize: '12px',
  color: T.inkMid,
  marginTop: '4px',
}

const formError: CSSProperties = {
  fontSize: '12px',
  color: T.brick,
  marginTop: '4px',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  border: `1px solid ${T.ruleSoft}`,
  borderRadius: '10px',
  background: T.paper2,
  color: T.ink,
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: '120px',
  resize: 'vertical',
}

const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const buttonContainer: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: '32px',
  paddingTop: '24px',
  borderTop: `1px solid ${T.rule}`,
}

const STEPS = [
  { id: 'category', title: 'Category', description: 'Choose your service category' },
  { id: 'basics', title: 'Basics', description: 'Title, pitch, and description' },
  { id: 'pricing', title: 'Pricing', description: 'Set up your pricing tiers' },
  { id: 'details', title: 'Details', description: 'FAQ, requirements, and media' },
  { id: 'review', title: 'Review', description: 'Preview and publish' },
]

const BUILDER_DRAFT_KEY = 'ys_marketplace_gig_builder_draft'

function loadPersistedDraft(existingGig: any) {
  if (existingGig || typeof window === 'undefined') return null
  try {
    return JSON.parse(window.localStorage.getItem(BUILDER_DRAFT_KEY) || 'null')
  } catch {
    return null
  }
}

interface GigBuilderWizardProps {
  gigId?: string
  existingGig?: any
  onComplete?: (gigId: string) => void
  onCancel?: () => void
}

export function GigBuilderWizard({ gigId, existingGig, onComplete, onCancel }: GigBuilderWizardProps) {
  const [currentStep, setCurrentStep] = React.useState(0)
  const persistedDraft = loadPersistedDraft(existingGig)
  const [gigData, setGigData] = React.useState({
    category: existingGig?.category || persistedDraft?.category || '',
    subcategory: existingGig?.subcategory || persistedDraft?.subcategory || '',
    jurisdiction: existingGig?.jurisdiction || persistedDraft?.jurisdiction || '',
    title: existingGig?.title || persistedDraft?.title || '',
    tagline: existingGig?.tagline || persistedDraft?.tagline || '',
    pitch: existingGig?.pitch || persistedDraft?.pitch || '',
    description: existingGig?.description || persistedDraft?.description || '',
    tags: existingGig?.tags || persistedDraft?.tags || [],
    tiers: existingGig?.tiers || persistedDraft?.tiers || [
      { tier: 'basic', title: 'Basic', description: '', price: 2500, delivery_days: 7, revisions: 1, features: [], is_active: true },
      { tier: 'standard', title: 'Standard', description: '', price: 5000, delivery_days: 14, revisions: 2, features: [], is_active: true },
      { tier: 'premium', title: 'Premium', description: '', price: 10000, delivery_days: 21, revisions: 3, features: [], is_active: true },
    ],
    faq: existingGig?.faq || persistedDraft?.faq || [],
    requirements: existingGig?.requirements || persistedDraft?.requirements || '',
    gallery_images: existingGig?.gallery_images || persistedDraft?.gallery_images || [],
    video_url: existingGig?.video_url || persistedDraft?.video_url || '',
    seo_title: existingGig?.seo_title || persistedDraft?.seo_title || '',
    seo_description: existingGig?.seo_description || persistedDraft?.seo_description || '',
  })
  const [currentGigId, setCurrentGigId] = React.useState<string | undefined>(gigId)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = React.useState('')
  const [profileReady, setProfileReady] = React.useState(true)
  const handleReadyChange = React.useCallback((ready: boolean) => setProfileReady(ready), [])

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 0) {
      if (!gigData.category) newErrors.category = 'Please select a category'
      if (!gigData.subcategory) newErrors.subcategory = 'Please select a subcategory'
      if (!['us', 'uk', 'ca'].includes(gigData.jurisdiction)) {
        newErrors.jurisdiction = 'Pick the jurisdiction this brief serves'
      }
    }

    if (step === 1) {
      if (!gigData.title.trim()) newErrors.title = 'Title is required'
      if (gigData.title.length < 20) newErrors.title = 'Title must be at least 20 characters'
      if (gigData.title.length > 80) newErrors.title = 'Title must be 80 characters or fewer'
      if (!gigData.tagline.trim()) newErrors.tagline = 'Tagline / Pitch is required'
      if (gigData.tagline.length < 40) newErrors.tagline = 'Tagline must be at least 40 characters'
      if (gigData.tagline.length > 160) newErrors.tagline = 'Tagline must be 160 characters or fewer'
      if (!gigData.description.trim()) newErrors.description = 'Description is required'
      if (gigData.description.length < 300) newErrors.description = 'Description must be at least 300 characters'
      if (gigData.description.length > 2500) newErrors.description = 'Description must be 2500 characters or fewer'
      if (gigData.tags.length < 3) newErrors.tags = 'Add at least 3 tags'
      if (gigData.tags.length > 5) newErrors.tags = 'Maximum 5 tags allowed'
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

    if (step === 3) {
      if (!gigData.requirements.trim()) newErrors.requirements = 'Tell clients what you need from them before you can start'
      if ((gigData.gallery_images || []).length < 1) newErrors.gallery_images = 'Add at least one gallery image'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  React.useEffect(() => {
    if (gigId || existingGig || typeof window === 'undefined') return
    window.localStorage.setItem(BUILDER_DRAFT_KEY, JSON.stringify(gigData))
  }, [gigData, gigId, existingGig])

  // For published / existing gigs we allow free movement between steps —
  // the user is editing a real record, they shouldn't have to re-prove a
  // step to revisit it. New-gig drafts still enforce sequential validation
  // so a half-filled draft can't accidentally publish.
  const isExistingGig = Boolean(gigId || existingGig?.id || currentGigId)
  const isPublished = (existingGig?.status || gigData.status) === 'active'

  const handleJumpToStep = (target: number) => {
    if (target === currentStep) return
    if (isExistingGig || target < currentStep) {
      // Backward navigation always allowed; forward navigation on an
      // existing gig also allowed (record is already saved).
      setCurrentStep(target)
      return
    }
    // Forward jump on a new draft — validate every step in between.
    for (let s = currentStep; s < target; s++) {
      if (!validateStep(s)) {
        setCurrentStep(s)
        return
      }
    }
    setCurrentStep(target)
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

  // Update an existing gig in-place without touching its publish status.
  // Used when the user opens a live gig in the wizard to tweak something
  // — they don't want a "Publish" button that flips state, they want
  // their edits committed against the current row.
  const handleUpdate = async () => {
    if (!currentGigId) return handleSaveDraft()
    setSaving(true)
    setAutoSaveStatus('Saving changes…')
    try {
      const payload = { ...gigData }
      // Don't override status — let the gig stay in whatever lifecycle
      // state it was in (active, paused, draft).
      delete (payload as any).status
      const res = await fetch(`/api/gigs/${currentGigId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error?.message || data?.error || 'Failed to update gig.')
      }
      setAutoSaveStatus('Changes saved')
      if (typeof window !== 'undefined') window.localStorage.removeItem(BUILDER_DRAFT_KEY)
      setTimeout(() => setAutoSaveStatus(''), 2200)
      if (onComplete) onComplete(currentGigId)
    } catch (e: any) {
      setAutoSaveStatus(`Error: ${e.message}`)
    } finally {
      setSaving(false)
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

      const url = currentGigId ? `/api/gigs/${currentGigId}` : '/api/gigs'
      const method = currentGigId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data?.error?.message || data?.error || 'Failed to save draft')
      }

      // /api/gigs uses the apiEnvelope shape: { data: { gig }, error, meta }.
      // Older code paths returned { gig } directly, so accept both for safety.
      const data = await res.json()
      const savedGigId = data?.data?.gig?.id || data?.gig?.id || currentGigId
      if (savedGigId && !currentGigId) setCurrentGigId(savedGigId)

      setAutoSaveStatus('Draft saved!')
      if (typeof window !== 'undefined') window.localStorage.removeItem(BUILDER_DRAFT_KEY)
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
    setSaving(true)
    setAutoSaveStatus('Publishing...')
    try {
      // Step 1: save draft (creates gig if new, or patches existing)
      const draftPayload = { ...gigData, status: 'draft' }
      const draftUrl = currentGigId ? `/api/gigs/${currentGigId}` : '/api/gigs'
      const draftMethod = currentGigId ? 'PATCH' : 'POST'

      const draftRes = await fetch(draftUrl, {
        method: draftMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload),
      })
      if (!draftRes.ok) {
        const d = await draftRes.json()
        throw new Error(d?.error?.message || d?.error || 'Failed to save gig before publishing')
      }
      const draftData = await draftRes.json()
      // apiEnvelope shape: { data: { gig }, error, meta }. Fall back to the
      // flat { gig } shape in case the route is ever rolled back.
      const resolvedGigId = draftData?.data?.gig?.id || draftData?.gig?.id || currentGigId
      if (!resolvedGigId) {
        throw new Error('Could not resolve the new gig ID from the save response. Refresh and try again.')
      }
      if (!currentGigId) setCurrentGigId(resolvedGigId)

      // Step 2: call the publish endpoint
      const publishRes = await fetch(`/api/gigs/${resolvedGigId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!publishRes.ok) {
        const d = await publishRes.json()
        throw new Error(d?.error?.message || d?.error || 'Failed to publish gig')
      }

      setAutoSaveStatus('Published!')
      if (typeof window !== 'undefined') window.localStorage.removeItem(BUILDER_DRAFT_KEY)
      setTimeout(() => setAutoSaveStatus(''), 3000)

      if (onComplete && resolvedGigId) {
        onComplete(resolvedGigId)
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

  // Upload a local file into the gig's gallery. Requires a gig row to exist
  // because /api/gigs/[id]/gallery is gig-scoped. If we're still building a
  // brand-new gig (no currentGigId yet), persist a draft first so the upload
  // has somewhere to attach. Returns the absolute URL the wizard should
  // append to gallery_images, or throws with a user-facing message on error.
  const uploadGalleryFile = async (file: File): Promise<string> => {
    let gigIdForUpload = currentGigId
    if (!gigIdForUpload) {
      const draftPayload = { ...gigData, status: 'draft' }
      const res = await fetch('/api/gigs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftPayload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message || body?.error || 'Could not save draft before upload.')
      }
      const body = await res.json()
      gigIdForUpload = body?.data?.gig?.id || body?.gig?.id
      if (!gigIdForUpload) throw new Error('Draft saved but no gig ID returned.')
      setCurrentGigId(gigIdForUpload)
    }

    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/gigs/${gigIdForUpload}/gallery`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error?.message || body?.error || 'Upload failed.')
    }
    const body = await res.json()
    // /api/gigs/[id]/gallery returns the updated gig with gallery_images
    // containing the newest entry last. Pick the last one's URL.
    const gallery = body?.data?.gig?.gallery_images || body?.gig?.gallery_images || []
    const latest = gallery[gallery.length - 1]
    if (!latest) throw new Error('Uploaded, but no image URL was returned.')
    return typeof latest === 'string' ? latest : (latest.url || latest)
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

      <ProfileCompletenessBanner onReadyChange={handleReadyChange} />

      <div style={progressContainer}>
        <ProgressBar value={progress} />
        <div style={stepIndicator}>
          {STEPS.map((step, index) => {
            // Steps are click-jumpable on an existing gig (any direction)
            // and backward-jumpable on a new draft. Forward jumps on a
            // new draft validate intermediate steps in sequence so we
            // can't end up in an "invisible failure" state.
            const clickable = isExistingGig || index <= currentStep ||
              // Forward navigation if every step before the target is
              // already valid — visual affordance only; the actual
              // validation runs inside handleJumpToStep.
              false
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => handleJumpToStep(index)}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  cursor: clickable ? 'pointer' : 'default',
                  padding: 0, fontFamily: 'inherit', textAlign: 'center',
                  opacity: clickable ? 1 : 0.65,
                }}
                aria-current={index === currentStep ? 'step' : undefined}
                title={clickable
                  ? `Jump to: ${step.title}`
                  : `Complete previous steps first`}
              >
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
              </button>
            )
          })}
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
            errors={errors}
            onChange={updateGigData}
            onAddFAQ={addFAQ}
            onUpdateFAQ={updateFAQ}
            onRemoveFAQ={removeFAQ}
            onUploadFile={uploadGalleryFile}
            onPersistGallery={async (next: any[]) => {
              if (!currentGigId) return
              try {
                await fetch(`/api/gigs/${currentGigId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ gallery_images: next }),
                })
              } catch { /* non-fatal; the next save will resync */ }
            }}
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
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {currentStep > 0 && (
              <Btn variant="secondary" onClick={handleBack} disabled={saving}>
                Back
              </Btn>
            )}
            {/* For an existing gig, an Update button is always available
                — the user shouldn't have to walk to the final step to
                commit a typo fix on step 1. For new drafts, Save Draft
                is also available everywhere so the user can step away
                without losing work. */}
            {isExistingGig && (
              <Btn variant="secondary" onClick={handleUpdate} disabled={saving}>
                {saving ? 'Saving…' : (isPublished ? 'Update Gig' : 'Save Changes')}
              </Btn>
            )}
            {!isExistingGig && (
              <Btn variant="secondary" onClick={handleSaveDraft} disabled={saving}>
                {saving ? 'Saving…' : 'Save Draft'}
              </Btn>
            )}
            {currentStep < STEPS.length - 1 ? (
              <Btn variant="primary" onClick={handleNext} disabled={saving}>
                Next
              </Btn>
            ) : (
              // Final step: published gigs use Update (above) — the
              // primary CTA flips between Publish (for unpublished gigs)
              // and Update Gig (for already-live ones) so the
              // commit-to-live action is always one click away.
              isPublished ? (
                <Btn
                  variant="primary"
                  onClick={handleUpdate}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Update Gig'}
                </Btn>
              ) : (
                <Btn
                  variant="primary"
                  onClick={handlePublish}
                  disabled={saving || !profileReady}
                  title={!profileReady ? 'Complete your profile to ≥75% (and set your handle) before publishing.' : undefined}
                >
                  {saving ? 'Publishing…' : profileReady ? 'Publish Gig' : 'Profile incomplete'}
                </Btn>
              )
            )}
          </div>
        </div>

        {autoSaveStatus && (
          <div style={{ marginTop: '16px', fontSize: '13px', color: autoSaveStatus.includes('Error') ? T.brick : T.moss }}>
            {autoSaveStatus}
          </div>
        )}
      </Card>
    </div>
  )
}

function CategoryStep({ gigData, errors, onChange }: any) {
  const selectedCategory = getCategoryById(gigData.category)
  const selectedSubcategory = selectedCategory && gigData.subcategory
    ? getSubcategoryById(selectedCategory.id, gigData.subcategory)
    : null
  const sourceLabels = getCategorySourceLabels(gigData.subcategory || gigData.category).slice(0, 8)

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: T.ink }}>
        Choose Your Category
      </h2>

      <div style={formSection}>
        <label style={formLabel}>Category *</label>
        <select
          value={gigData.category}
          onChange={e => {
            onChange('category', e.target.value)
            onChange('subcategory', '')
          }}
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
          <label style={formLabel}>Subcategory *</label>
          <select
            value={gigData.subcategory}
            onChange={e => onChange('subcategory', e.target.value)}
            style={selectStyle}
          >
            <option value="">Select a subcategory</option>
            {selectedCategory.subcategories.map(sub => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
          {errors.subcategory && <div style={formError}>{errors.subcategory}</div>}
        </div>
      )}

      <div style={formSection}>
        <label style={formLabel}>Jurisdiction *</label>
        <select
          value={gigData.jurisdiction}
          onChange={e => onChange('jurisdiction', e.target.value)}
          style={selectStyle}
        >
          <option value="">Select where this brief is licensed to serve</option>
          <option value="us">United States</option>
          <option value="uk">United Kingdom</option>
          <option value="ca">Canada</option>
        </select>
        <p style={{ fontSize: '12px', color: T.inkMuted, margin: '6px 0 0' }}>
          Required. Clients filter the marketplace by jurisdiction — gigs without one are hidden from the country browse.
        </p>
        {errors.jurisdiction && <div style={formError}>{errors.jurisdiction}</div>}
      </div>

      {sourceLabels.length > 0 && (
        <div style={{ padding: '16px', background: T.vellum2, border: `1px solid ${T.rule}`, borderRadius: '12px', marginTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: T.ink, marginBottom: '10px' }}>
            Matched to existing YouSafe offerings
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {sourceLabels.map(label => (
              <Badge key={label} color="gray">
                {label}
              </Badge>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: T.inkMuted, margin: '10px 0 0' }}>
            This keeps marketplace gigs aligned with services already sold across the portal.
          </p>
        </div>
      )}

      {selectedSubcategory && (
        <div style={{ padding: '16px', background: `${T.moss}10`, border: `1px solid ${T.moss}33`, borderRadius: '12px', marginTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: T.ink, marginBottom: '4px' }}>
            Recommended positioning
          </div>
          <p style={{ fontSize: '13px', color: T.inkMuted, margin: 0 }}>
            Lead with a concrete outcome for {selectedSubcategory.name.toLowerCase()}, then separate document prep, advisory time, and attorney review into tiers.
          </p>
        </div>
      )}

      <div style={{ padding: '16px', background: `${T.indigo}08`, borderRadius: '12px', marginTop: '16px' }}>
        <p style={{ fontSize: '13px', color: T.ink, margin: 0 }}>
          <strong>Tip:</strong> Choose the category that best describes your service. This helps
          clients find you when they're searching for specific services.
        </p>
      </div>
    </div>
  )
}

function BasicsStep({ gigData, errors, onChange }: any) {
  const [tagInput, setTagInput] = React.useState('')

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase()
    if (!tag) return
    if (gigData.tags.length >= 5) return
    if (!gigData.tags.includes(tag)) {
      onChange('tags', [...gigData.tags, tag])
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    onChange('tags', gigData.tags.filter((t: string) => t !== tag))
  }

  const descLen = gigData.description.length
  const descColor = descLen < 300 ? T.brick : descLen > 2500 ? T.brick : T.inkMuted

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: T.ink }}>
        Service Basics
      </h2>

      <div style={formSection}>
        <label style={formLabel}>Gig Title * <span style={{ fontWeight: 400, color: T.inkMuted }}>(20–80 chars)</span></label>
        <input
          type="text"
          value={gigData.title}
          onChange={e => onChange('title', e.target.value)}
          placeholder="e.g., Study Permit Document Review and Feedback"
          style={inputStyle}
          maxLength={80}
        />
        <div style={formHint}>
          {gigData.title.length}/80 characters
        </div>
        {errors.title && <div style={formError}>{errors.title}</div>}
      </div>

      <div style={formSection}>
        <label style={formLabel}>Tagline / Pitch * <span style={{ fontWeight: 400, color: T.inkMuted }}>(40–160 chars)</span></label>
        <textarea
          value={gigData.tagline}
          onChange={e => onChange('tagline', e.target.value)}
          placeholder="A clear, compelling pitch that appears in search results and on your gig card"
          style={{ ...textareaStyle, minHeight: '80px' }}
          maxLength={160}
        />
        <div style={{ ...formHint, color: gigData.tagline.length < 40 || gigData.tagline.length > 160 ? T.brick : T.inkMuted }}>
          {gigData.tagline.length}/160 characters (min 40)
        </div>
        {errors.tagline && <div style={formError}>{errors.tagline}</div>}
      </div>

      <div style={formSection}>
        <label style={formLabel}>Detailed Description * <span style={{ fontWeight: 400, color: T.inkMuted }}>(300–2500 chars)</span></label>
        <textarea
          value={gigData.description}
          onChange={e => onChange('description', e.target.value)}
          placeholder="Describe your service in detail. What do clients get? What's included? What makes your service unique?"
          style={{ ...textareaStyle, minHeight: '160px' }}
          maxLength={2500}
        />
        <div style={{ ...formHint, color: descColor }}>
          {descLen}/2500 characters
          {descLen < 300 && <span> — {300 - descLen} more needed</span>}
        </div>
        {errors.description && <div style={formError}>{errors.description}</div>}
      </div>

      <div style={formSection}>
        <label style={formLabel}>Tags * <span style={{ fontWeight: 400, color: T.inkMuted }}>(3–5 tags)</span></label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {gigData.tags.map((tag: string) => (
            <span
              key={tag}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '4px 10px', background: `${T.indigo}20`, borderRadius: '20px',
                fontSize: '13px', color: T.ink, border: `1px solid ${T.indigo}40`,
              }}
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: '14px', lineHeight: 1, padding: '0 2px' }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {gigData.tags.length < 5 && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag(tagInput)
                }
              }}
              placeholder="Type a tag and press Enter"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() => addTag(tagInput)}
              style={{
                padding: '10px 16px', background: T.indigo, color: '#fff',
                border: 'none', borderRadius: '10px', fontSize: '13px',
                fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Add
            </button>
          </div>
        )}
        <div style={formHint}>
          {gigData.tags.length}/5 tags — add 3–5 relevant tags to help clients find your service
        </div>
        {errors.tags && <div style={formError}>{errors.tags}</div>}
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
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: T.ink }}>
        Pricing Tiers
      </h2>

      <p style={{ fontSize: '14px', color: T.inkMuted, marginBottom: '24px' }}>
        Create up to 3 pricing tiers with different scopes and delivery times. At least one tier must be active.
      </p>

      {gigData.tiers.map((tier: any, index: number) => (
        <Card
          key={index}
          style={{
            padding: '20px',
            marginBottom: '16px',
            border: `1px solid ${tier.is_active ? T.indigo : T.rule}`,
            background: tier.is_active ? `${T.indigo}08` : T.vellum,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: T.ink }}>
              {TIER_NAMES[tier.tier as keyof typeof TIER_NAMES] || tier.tier}
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: T.inkMuted }}>
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
              <label style={formLabel}>Tier Title *</label>
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

          <div style={{ marginBottom: '16px' }}>
            <label style={formLabel}>Tier Description</label>
            <textarea
              value={tier.description || ''}
              onChange={e => onTierChange(index, 'description', e.target.value)}
              placeholder="What's included in this tier?"
              style={{ ...textareaStyle, minHeight: '72px' }}
            />
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

function DetailsStep({ gigData, errors = {}, onChange, onAddFAQ, onUpdateFAQ, onRemoveFAQ, onUploadFile, onPersistGallery }: any) {
  const [imageUrlInput, setImageUrlInput] = React.useState('')
  const [uploading, setUploading] = React.useState(false)
  const [uploadError, setUploadError] = React.useState('')
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const images = gigData.gallery_images || []
  const canAddMore = images.length < 3

  const addImageUrl = () => {
    const url = imageUrlInput.trim()
    if (!url || !canAddMore) return
    // Store as a {url} object so marketplace renderers (which all read
    // gig.gallery_images[0]?.url) can pick the cover up. Pushing a bare
    // string instead — which this used to do — left the cover invisible
    // on every gig card because "https://…"?.url is undefined.
    onChange('gallery_images', [...images, { url }])
    setImageUrlInput('')
  }

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset the input so picking the same file twice still fires onChange.
    e.target.value = ''

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be 5 MB or less.')
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Use JPG, PNG, or WEBP.')
      return
    }

    setUploadError('')
    setUploading(true)
    try {
      if (!onUploadFile) throw new Error('Upload is unavailable. Use the URL field instead.')
      const url = await onUploadFile(file)
      // Same fix as addImageUrl — store as {url} so the marketplace card's
      // gig.gallery_images[0]?.url access path actually finds the cover.
      onChange('gallery_images', [...images, { url, name: file.name, size: file.size }])
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = (index: number) => {
    onChange('gallery_images', images.filter((_: string, i: number) => i !== index))
  }

  const moveToFirst = (index: number) => {
    const next = [...images]
    const [item] = next.splice(index, 1)
    next.unshift(item)
    onChange('gallery_images', next)
    // Persist the new cover immediately if this gig is already in the
    // database. Without this, the "Set as cover" button only reordered
    // local state — the marketplace card kept showing the old cover
    // until the user clicked Save / Publish. Fire-and-forget; the
    // local state is already updated optimistically.
    if (typeof onPersistGallery === 'function') {
      onPersistGallery(next)
    }
  }

  const resolveImageUrl = (img: any): string => {
    if (typeof img === 'string') return img
    if (img?.url) return img.url
    return ''
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: T.ink }}>
        Additional Details
      </h2>

      <div style={formSection}>
        <label style={formLabel}>Client Requirements *</label>
        <textarea
          value={gigData.requirements}
          onChange={e => onChange('requirements', e.target.value)}
          placeholder="What information or documents do clients need to provide?&#10;&#10;Example:&#10;- Current visa status&#10;- Passport copy&#10;- Previous refusal letters (if applicable)"
          style={{ ...textareaStyle, minHeight: '100px' }}
        />
        <div style={formHint}>
          Help clients understand what they need to provide before you can start.
        </div>
        {errors.requirements && <div style={formError}>{errors.requirements}</div>}
      </div>

      <div style={formSection}>
        <label style={formLabel}>
          Gallery Images *{' '}
          <span style={{ fontWeight: 400, color: T.inkMuted }}>
            (1 required, up to 3 — first image is your cover photo)
          </span>
        </label>
        {errors.gallery_images && <div style={{ ...formError, marginBottom: '8px' }}>{errors.gallery_images}</div>}
        {uploadError && <div style={{ ...formError, marginBottom: '8px' }}>{uploadError}</div>}

        {/* Upload from device — primary path. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFilePick}
          style={{ display: 'none' }}
          disabled={!canAddMore}
        />
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !canAddMore}
            style={{
              padding: '10px 16px', background: T.indigo, color: '#fff',
              border: 'none', borderRadius: '10px', fontSize: '13px',
              fontWeight: 600, cursor: (uploading || !canAddMore) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
              opacity: (uploading || !canAddMore) ? 0.5 : 1,
            }}
          >
            {uploading ? 'Uploading…' : 'Upload from device'}
          </button>
          <span style={{ alignSelf: 'center', fontSize: '12px', color: T.inkMuted }}>
            JPG, PNG, or WEBP · max 5 MB · {images.length}/3 images
          </span>
        </div>

        {/* Fallback: paste a URL */}
        {canAddMore && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="url"
              value={imageUrlInput}
              onChange={e => setImageUrlInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addImageUrl() } }}
              placeholder="Or paste an image URL: https://…"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={addImageUrl}
              style={{
                padding: '10px 16px', background: 'transparent', color: T.indigo,
                border: `1px solid ${T.indigo}`, borderRadius: '10px', fontSize: '13px',
                fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              Add URL
            </button>
          </div>
        )}

        {images.length > 0 ? (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {images.map((img: any, i: number) => {
              const url = resolveImageUrl(img)
              const isCover = i === 0
              return (
                <div
                  key={i}
                  style={{
                    position: 'relative', width: '140px',
                    borderRadius: '10px', overflow: 'hidden',
                    border: `2px solid ${isCover ? T.indigo : T.rule}`,
                    background: T.vellum2,
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  <div style={{ width: '100%', height: '100px', position: 'relative', overflow: 'hidden' }}>
                    <img
                      src={url}
                      alt={`Gallery ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    {isCover && (
                      <div
                        style={{
                          position: 'absolute', top: '4px', left: '4px',
                          background: T.indigo, color: '#fff',
                          fontSize: '10px', fontWeight: 700,
                          padding: '2px 7px', borderRadius: '4px',
                          letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}
                      >
                        Cover
                      </div>
                    )}
                    <button
                      onClick={() => removeImage(i)}
                      style={{
                        position: 'absolute', top: '4px', right: '4px',
                        background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                        borderRadius: '50%', width: '22px', height: '22px',
                        cursor: 'pointer', fontSize: '13px', lineHeight: 1, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div style={{ padding: '6px 8px', background: isCover ? `${T.indigo}08` : T.paper, borderTop: `1px solid ${T.ruleSoft}` }}>
                    {!isCover && (
                      <button
                        type="button"
                        onClick={() => moveToFirst(i)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: '11px', color: T.indigo, fontWeight: 600,
                          padding: 0, fontFamily: 'inherit', width: '100%',
                          textAlign: 'center',
                        }}
                      >
                        Set as cover
                      </button>
                    )}
                    {isCover && (
                      <span style={{ fontSize: '10px', color: T.indigo, fontWeight: 600, display: 'block', textAlign: 'center', letterSpacing: '0.02em' }}>
                        Gig cover photo
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: T.inkMuted, background: T.vellum2, borderRadius: '12px', fontSize: '13px', border: `2px dashed ${T.rule}` }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🖼️</div>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: T.ink }}>Add your first gallery image</p>
            <p style={{ margin: 0 }}>Upload a photo from your device or paste an image URL above.</p>
            <p style={{ margin: '8px 0 0', fontSize: '11px' }}>The first image becomes the cover on your gig card.</p>
          </div>
        )}
        <div style={formHint}>{images.length}/3 images · first image = cover photo on marketplace cards</div>
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

      <div style={formSection}>
        <label style={formLabel}>SEO Title (optional)</label>
        <input
          type="text"
          value={gigData.seo_title}
          onChange={e => onChange('seo_title', e.target.value)}
          placeholder="Optimised title for search engines (leave blank to use gig title)"
          style={inputStyle}
          maxLength={80}
        />
        <div style={formHint}>{(gigData.seo_title || '').length}/80 characters</div>
      </div>

      <div style={formSection}>
        <label style={formLabel}>SEO Description (optional)</label>
        <textarea
          value={gigData.seo_description}
          onChange={e => onChange('seo_description', e.target.value)}
          placeholder="A short meta description for search engines (160 chars recommended)"
          style={{ ...textareaStyle, minHeight: '80px' }}
          maxLength={300}
        />
        <div style={formHint}>{(gigData.seo_description || '').length}/300 characters</div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <label style={formLabel}>FAQ</label>
          <Btn variant="secondary" size="sm" onClick={onAddFAQ}>
            + Add Question
          </Btn>
        </div>

        {gigData.faq.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: T.inkMuted, background: T.vellum2, borderRadius: '12px' }}>
            No FAQ items yet. Add common questions clients might have.
          </div>
        ) : (
          gigData.faq.map((item: any, index: number) => (
            <Card key={index} style={{ padding: '16px', marginBottom: '12px' }}>
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
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
                  <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
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
    </div>
  )
}

function ReviewStep({ gigData, onEdit }: any) {
  const category = getCategoryById(gigData.category)

  const activeTiers = gigData.tiers.filter((t: any) => t.is_active && t.price > 0 && t.delivery_days >= 1)

  const checks = [
    { label: 'Title (20–80 chars)', ok: gigData.title.length >= 20 && gigData.title.length <= 80, step: 1 },
    { label: 'Tagline / Pitch (40–160 chars)', ok: gigData.tagline.length >= 40 && gigData.tagline.length <= 160, step: 1 },
    { label: 'Description (300–2500 chars)', ok: gigData.description.length >= 300 && gigData.description.length <= 2500, step: 1 },
    { label: 'Category selected', ok: !!gigData.category, step: 0 },
    { label: 'Subcategory selected', ok: !!gigData.subcategory, step: 0 },
    { label: 'Tags (3–5)', ok: gigData.tags.length >= 3 && gigData.tags.length <= 5, step: 1 },
    { label: 'At least one complete pricing tier', ok: activeTiers.length >= 1, step: 2 },
    { label: 'Requirements filled in', ok: !!gigData.requirements.trim(), step: 3 },
    { label: 'Cover image added', ok: (gigData.gallery_images || []).length >= 1, step: 3 },
  ]

  const allPassed = checks.every(c => c.ok)

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: T.ink }}>
        Review Your Gig
      </h2>

      <Card style={{ padding: '24px', marginBottom: '24px', border: `1px solid ${allPassed ? T.moss : T.rule}` }}>
        <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: T.ink }}>
          Publish Checklist
        </h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {checks.map(check => (
            <div
              key={check.label}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}
            >
              <span style={{
                width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                background: check.ok ? T.moss : T.brick,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700,
              }}>
                {check.ok ? '✓' : '✗'}
              </span>
              <span style={{ color: check.ok ? T.ink : T.brick, flex: 1 }}>{check.label}</span>
              {!check.ok && (
                <button
                  onClick={() => onEdit(check.step)}
                  style={{
                    background: 'none', border: `1px solid ${T.rule}`, borderRadius: '6px',
                    padding: '2px 8px', fontSize: '11px', cursor: 'pointer', color: T.inkMuted,
                  }}
                >
                  Fix
                </button>
              )}
            </div>
          ))}
        </div>
        {allPassed && (
          <div style={{ marginTop: '12px', padding: '10px 14px', background: `${T.moss}15`, borderRadius: '8px', fontSize: '13px', color: T.moss, fontWeight: 600 }}>
            All checks passed — ready to publish!
          </div>
        )}
      </Card>

      {/* Cover image preview */}
      {(gigData.gallery_images || []).length > 0 && (
        <Card style={{ padding: '24px', marginBottom: '24px', overflow: 'hidden' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '8px', display: 'block' }}>
            Cover Image
          </label>
          <div
            style={{
              width: '100%', maxHeight: '280px', borderRadius: '12px', overflow: 'hidden',
              border: `1px solid ${T.rule}`, background: T.vellum2,
            }}
          >
            <img
              src={typeof gigData.gallery_images[0] === 'string' ? gigData.gallery_images[0] : (gigData.gallery_images[0]?.url || '')}
              alt="Gig cover"
              style={{ width: '100%', height: '100%', objectFit: 'cover', maxHeight: '280px' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          {(gigData.gallery_images || []).length > 1 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              {gigData.gallery_images.slice(1).map((img: any, i: number) => {
                const url = typeof img === 'string' ? img : (img?.url || '')
                return (
                  <div
                    key={i}
                    style={{
                      width: '60px', height: '45px', borderRadius: '6px', overflow: 'hidden',
                      border: `1px solid ${T.rule}`, background: T.vellum2,
                    }}
                  >
                    <img src={url} alt={`Gallery ${i + 2}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      <Card style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
              Category
            </label>
            <div style={{ fontSize: '15px', color: T.ink }}>
              {category?.icon} {category?.name || gigData.category}
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
              Title
            </label>
            <div style={{ fontSize: '18px', fontWeight: 700, color: T.ink }}>
              {gigData.title}
            </div>
          </div>

          {gigData.tagline && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
                Tagline / Pitch
              </label>
              <div style={{ fontSize: '14px', color: T.ink }}>{gigData.tagline}</div>
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
              Description
            </label>
            <div style={{ fontSize: '14px', color: T.ink, lineHeight: 1.6, maxHeight: '200px', overflow: 'auto' }}>
              {gigData.description}
            </div>
          </div>

          {gigData.tags.length > 0 && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
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
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: T.ink }}>
          Pricing Tiers
        </h3>
        {gigData.tiers
          .filter((t: any) => t.is_active)
          .map((tier: any, index: number) => (
            <div
              key={index}
              style={{
                padding: '16px',
                background: T.vellum2,
                borderRadius: '12px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, color: T.ink }}>{tier.title}</span>
                <span style={{ fontWeight: 900, color: T.ink }}>
                  ${(tier.price / 100).toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: T.inkMuted, marginBottom: '8px' }}>
                {tier.delivery_days} day delivery · {tier.revisions >= 999 ? 'Unlimited' : `${tier.revisions} revision${tier.revisions !== 1 ? 's' : ''}`}
              </div>
              {tier.features.length > 0 && (
                <div style={{ fontSize: '13px', color: T.ink }}>
                  {tier.features.slice(0, 3).map((f: string, i: number) => (
                    <div key={i}>✓ {f}</div>
                  ))}
                  {tier.features.length > 3 && (
                    <div style={{ color: T.inkMuted }}>+{tier.features.length - 3} more</div>
                  )}
                </div>
              )}
            </div>
          ))}
      </Card>

      <Card style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px', color: T.ink }}>
          Additional Details
        </h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {gigData.requirements && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
                Requirements
              </label>
              <div style={{ fontSize: '14px', color: T.ink }}>{gigData.requirements}</div>
            </div>
          )}
          {gigData.video_url && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
                Video
              </label>
              <a href={gigData.video_url} target="_blank" rel="noreferrer" style={{ color: T.indigo, fontSize: '14px' }}>
                {gigData.video_url}
              </a>
            </div>
          )}
          {gigData.faq.length > 0 && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: T.inkMuted, marginBottom: '4px' }}>
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
