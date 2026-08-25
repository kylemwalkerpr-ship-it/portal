// @ts-nocheck
'use client'

import React from 'react'
import ImageCropper from './ImageCropper'
import { T, F } from './tokens'

interface GalleryImage {
  id?: string
  url: string
  name?: string
  size?: number
  pending?: boolean
  alt?: string
}

interface GalleryManagerProps {
  images: GalleryImage[]
  maxImages?: number
  uploading: boolean
  onUploadFile: (file: File) => Promise<string>
  onUploadResized?: (file: File, presetName: string, width: number, height: number) => Promise<string>
  onAddUrl: (url: string) => void
  onRemove: (index: number) => void
  onReorder: (images: GalleryImage[]) => void
  onPersistGallery?: (images: GalleryImage[]) => void
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024
const MARKETPLACE_DIMENSIONS = {
  card: { width: 1200, height: 800, label: 'Marketplace card (3:2)' },
  gallery: { width: 1200, height: 900, label: 'Gallery wide (4:3)' },
  square: { width: 800, height: 800, label: 'Square (1:1)' },
} as const

export default function GalleryManager({
  images,
  maxImages = 3,
  uploading,
  onUploadFile,
  onUploadResized,
  onAddUrl,
  onRemove,
  onReorder,
  onPersistGallery,
}: GalleryManagerProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [urlInput, setUrlInput] = React.useState('')
  const [uploadError, setUploadError] = React.useState('')
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [dropIndex, setDropIndex] = React.useState<number | null>(null)
  const [croppingIndex, setCroppingIndex] = React.useState<number | null>(null)
  const canAddMore = images.length < maxImages

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (file.size > MAX_FILE_SIZE) {
      setUploadError('Image must be 5 MB or less.')
      return
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError('Use JPG, PNG, or WEBP.')
      return
    }

    setUploadError('')
    const previewId = `pending-${crypto.randomUUID()}`
    const previewUrl = URL.createObjectURL(file)
    const optimisticImage: GalleryImage = {
      id: previewId,
      url: previewUrl,
      name: file.name,
      size: file.size,
      pending: true,
    }
    onReorder([...images, optimisticImage])

    try {
      const url = await onUploadFile(file)
      onReorder((prev) =>
        Array.isArray(prev)
          ? prev.map((img) =>
              img.id === previewId
                ? { url, name: file.name, size: file.size }
                : img,
            )
          : prev,
      )
      try {
        URL.revokeObjectURL(previewUrl)
      } catch {}
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed.')
      onReorder((prev) =>
        Array.isArray(prev)
          ? prev.filter((img) => img.id !== previewId)
          : prev,
      )
      try {
        URL.revokeObjectURL(previewUrl)
      } catch {}
    }
  }

  const handleAddUrl = () => {
    const url = urlInput.trim()
    if (!url || !canAddMore) return
    onAddUrl(url)
    setUrlInput('')
  }

  // Drag-and-drop reorder
  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDropIndex(index)
  }

  const handleDrop = () => {
    if (dragIndex === null || dropIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      setDropIndex(null)
      return
    }
    const next = [...images]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(dropIndex, 0, moved)
    onReorder(next)
    if (typeof onPersistGallery === 'function') {
      onPersistGallery(next)
    }
    setDragIndex(null)
    setDropIndex(null)
  }

  const resolveImageUrl = (img: GalleryImage): string => {
    if (typeof img === 'string') return img
    return img?.url || ''
  }

  const handleCropComplete = async (index: number, blob: Blob, dimensions: { width: number; height: number }) => {
    const file = new File([blob], `cropped-${dimensions.width}x${dimensions.height}.webp`, {
      type: 'image/webp',
    })
    try {
      let url: string
      if (typeof onUploadResized === 'function') {
        const presetName = dimensions.width >= 1280 && dimensions.width / dimensions.height >= 1.7
          ? 'landscape'
          : dimensions.width >= 1000 && dimensions.width / dimensions.height >= 1.3
          ? 'card'
          : dimensions.width === dimensions.height
          ? 'square'
          : dimensions.width > dimensions.height
          ? 'gallery'
          : 'portrait'
        url = await onUploadResized(file, presetName, dimensions.width, dimensions.height)
      } else {
        url = await onUploadFile(file)
      }
      onReorder((prev) =>
        Array.isArray(prev)
          ? prev.map((img, i) => (i === index ? { url, name: `optimized-${dimensions.width}x${dimensions.height}.webp`, size: blob.size } : img))
          : prev,
      )
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to process cropped image')
    }
    setCroppingIndex(null)
  }

  return (
    <div>
      {uploadError && (
        <div style={{ fontSize: '12px', color: T.brick, marginBottom: '8px', padding: '8px 12px', background: `${T.brick}08`, borderRadius: '8px' }}>
          {uploadError}
        </div>
      )}

      {/* File upload + URL input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFilePick}
        style={{ display: 'none' }}
        disabled={!canAddMore}
      />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !canAddMore}
          style={{
            padding: '10px 18px',
            background: T.indigo,
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: (uploading || !canAddMore) ? 'not-allowed' : 'pointer',
            opacity: (uploading || !canAddMore) ? 0.5 : 1,
            fontFamily: F.ui,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {uploading ? 'Uploading…' : 'Upload image'}
        </button>
        <span style={{ alignSelf: 'center', fontSize: '12px', color: T.inkMuted }}>
          JPG, PNG, WEBP · max 5 MB · {images.length}/{maxImages}
        </span>
      </div>

      {/* URL input (fallback) */}
      {canAddMore && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddUrl()
              }
            }}
            placeholder="Or paste an image URL..."
            style={{
              flex: 1,
              padding: '10px 14px',
              border: `1px solid ${T.ruleSoft}`,
              borderRadius: '10px',
              background: T.paper2,
              color: T.ink,
              fontSize: '13px',
              fontFamily: F.ui,
            }}
          />
          <button
            type="button"
            onClick={handleAddUrl}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              color: T.indigo,
              border: `1px solid ${T.indigo}`,
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: F.ui,
            }}
          >
            Add URL
          </button>
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 ? (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {images.map((img, i) => {
            const url = resolveImageUrl(img)
            const isCover = i === 0
            const isDragOver = dropIndex === i && dragIndex !== i

            return (
              <div
                key={img.id || i}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={handleDrop}
                onDragEnd={() => { setDragIndex(null); setDropIndex(null) }}
                style={{
                  position: 'relative',
                  width: '160px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  border: `2px solid ${
                    isDragOver ? T.indigo : isCover ? T.indigo : T.rule
                  }`,
                  background: T.vellum2,
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: dragIndex === i ? 'grabbing' : 'grab',
                  transition: 'border-color 150ms, transform 150ms, box-shadow 150ms',
                  transform: dragIndex === i ? 'scale(1.05)' : 'none',
                  boxShadow: dragIndex === i ? '0 8px 24px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                <div style={{ width: '100%', height: '112px', position: 'relative', overflow: 'hidden' }}>
                  <img
                    src={url}
                    alt={img.alt || `Gallery ${i + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      opacity: img.pending ? 0.5 : 1,
                      transition: 'opacity 200ms',
                    }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent && !parent.querySelector('[data-gallery-err]')) {
                        const fb = document.createElement('div')
                        fb.setAttribute('data-gallery-err', '1')
                        fb.style.cssText =
                          'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(212,86,46,0.12);color:T.brick;font-size:10px;text-align:center;padding:4px;font-family:inherit;'
                        fb.textContent = "Can't load"
                        parent.appendChild(fb)
                      }
                    }}
                  />
                  {img.pending && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(15,23,42,0.5)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 600,
                        gap: '6px',
                      }}
                    >
                      <span
                        style={{
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff',
                          animation: 'spin 0.75s linear infinite',
                        }}
                      />
                      Uploading…
                    </div>
                  )}
                  {isCover && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '4px',
                        left: '4px',
                        background: T.indigo,
                        color: '#fff',
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Cover
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div style={{
                  padding: '6px 6px',
                  background: isCover ? `${T.indigo}06` : T.paper,
                  borderTop: `1px solid ${T.ruleSoft}`,
                  display: 'flex',
                  gap: '4px',
                  flexWrap: 'wrap',
                }}>
                  <button
                    type="button"
                    onClick={() => setCroppingIndex(i)}
                    disabled={img.pending}
                    title="Crop & resize for marketplace"
                    style={{
                      flex: 1,
                      background: 'none',
                      border: 'none',
                      cursor: img.pending ? 'not-allowed' : 'pointer',
                      fontSize: '10px',
                      color: T.indigo,
                      fontWeight: 600,
                      padding: '3px 4px',
                      fontFamily: F.ui,
                      borderRadius: '4px',
                      opacity: img.pending ? 0.5 : 1,
                    }}
                  >
                    ✂️ Resize
                  </button>
                  {!isCover && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...images]
                        const [item] = next.splice(i, 1)
                        next.unshift(item)
                        onReorder(next)
                        if (typeof onPersistGallery === 'function') {
                          onPersistGallery(next)
                        }
                      }}
                      disabled={img.pending}
                      title="Set as cover photo"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: img.pending ? 'not-allowed' : 'pointer',
                        fontSize: '10px',
                        color: T.indigo,
                        fontWeight: 600,
                        padding: '3px 4px',
                        fontFamily: F.ui,
                        borderRadius: '4px',
                        opacity: img.pending ? 0.5 : 1,
                      }}
                    >
                      ⭐ Cover
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    title="Remove image"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '10px',
                      color: T.brick,
                      fontWeight: 600,
                      padding: '3px 4px',
                      fontFamily: F.ui,
                      borderRadius: '4px',
                    }}
                  >
                    🗑
                  </button>
                </div>

                {/* Dimension badge */}
                <div style={{
                  fontSize: '9px',
                  color: T.inkMuted,
                  padding: '2px 6px 4px',
                  background: T.paper,
                  textAlign: 'center',
                  borderTop: `1px solid ${T.ruleSoft}`,
                  fontFamily: F.mono,
                }}>
                  {isCover ? '1200×800 px (card)' : 'Gallery image'}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '32px',
            textAlign: 'center',
            color: T.inkMuted,
            background: T.vellum2,
            borderRadius: '12px',
            fontSize: '13px',
            border: `2px dashed ${T.rule}`,
            cursor: 'pointer',
            transition: 'border-color 150ms, background 150ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = T.indigo
            e.currentTarget.style.background = `${T.indigo}04`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = T.rule
            e.currentTarget.style.background = T.vellum2
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🖼️</div>
          <div style={{ fontWeight: 600, color: T.ink, marginBottom: '4px' }}>
            Add your first gallery image
          </div>
          <p style={{ margin: '0 0 4px' }}>
            Upload from your device or paste an image URL above.
          </p>
          <p style={{ fontSize: '11px', color: T.inkMuted, margin: '6px 0 0' }}>
            First image = cover photo on marketplace cards · Drag to reorder
          </p>
          <p style={{ fontSize: '10px', color: T.inkMuted, margin: '2px 0 0' }}>
            Recommended: 1200×800px (3:2) for best display · WebP format
          </p>
        </div>
      )}

      {/* Image cropping modal */}
      {croppingIndex !== null && images[croppingIndex] && (
        <ImageCropper
          imageUrl={resolveImageUrl(images[croppingIndex])}
          onCropComplete={(blob, dims) => handleCropComplete(croppingIndex, blob, dims)}
          onCancel={() => setCroppingIndex(null)}
        />
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
