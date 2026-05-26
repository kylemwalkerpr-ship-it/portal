// @ts-nocheck
'use client'

import React from 'react'
import Cropper, { Area } from 'react-easy-crop'
import { T, F } from './tokens'

interface CropSettings {
  aspect: number
  label: string
  description: string
  width: number
  height: number
}

const ASPECT_PRESETS: CropSettings[] = [
  { aspect: 3 / 2, label: '3:2', description: 'Standard marketplace card', width: 1200, height: 800 },
  { aspect: 4 / 3, label: '4:3', description: 'Wide gallery', width: 1200, height: 900 },
  { aspect: 16 / 9, label: '16:9', description: 'Video/landscape', width: 1280, height: 720 },
  { aspect: 1 / 1, label: '1:1', description: 'Square (social)', width: 800, height: 800 },
  { aspect: 3 / 4, label: '3:4', description: 'Portrait', width: 900, height: 1200 },
]

interface ImageCropperProps {
  imageUrl: string
  onCropComplete: (croppedBlob: Blob, dimensions: { width: number; height: number }) => void
  onCancel: () => void
}

// Client-side crop + resize using Canvas API. No server round-trip needed.
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  outputWidth: number,
  outputHeight: number,
): Promise<Blob | null> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = imageSrc
  })

  const img = await loaded
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Draw the cropped region, scaled to the exact output dimensions
  ctx.drawImage(
    img,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  )

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob)
      },
      'image/webp',
      0.92,
    )
  })
}

export default function ImageCropper({ imageUrl, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = React.useState({ x: 0, y: 0 })
  const [zoom, setZoom] = React.useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null)
  const [selectedPreset, setSelectedPreset] = React.useState<CropSettings>(ASPECT_PRESETS[0])
  const [processing, setProcessing] = React.useState(false)
  const [error, setError] = React.useState('')

  const onCropChange = (location: { x: number; y: number }) => setCrop(location)

  const onCropAreaComplete = (_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }

  const handleApply = async () => {
    if (!croppedAreaPixels) return
    setProcessing(true)
    setError('')
    try {
      const blob = await getCroppedImg(imageUrl, croppedAreaPixels, selectedPreset.width, selectedPreset.height)
      if (!blob) throw new Error('Failed to process image')
      onCropComplete(blob, { width: selectedPreset.width, height: selectedPreset.height })
    } catch (e: any) {
      setError(e.message || 'Failed to crop image')
    } finally {
      setProcessing(false)
    }
  }

  // Keyboard: Esc to close
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && !processing) handleApply()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel, processing, croppedAreaPixels])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        style={{
          background: T.paper,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '860px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          border: `1px solid ${T.rule}`,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${T.rule}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: T.vellum,
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: T.inkMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Image Editor
            </div>
            <div style={{ fontSize: '14px', color: T.ink, fontWeight: 600, marginTop: '2px' }}>
              Crop &amp; resize your image
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: T.inkMuted,
              padding: '4px 8px',
              fontFamily: 'inherit',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Aspect presets */}
        <div style={{
          padding: '12px 20px',
          borderBottom: `1px solid ${T.ruleSoft}`,
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          background: T.paper2,
        }}>
          {ASPECT_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setSelectedPreset(preset)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                border: `1px solid ${selectedPreset.label === preset.label ? T.indigo : T.rule}`,
                background: selectedPreset.label === preset.label ? `${T.indigo}15` : T.vellum,
                color: selectedPreset.label === preset.label ? T.indigo : T.inkMid,
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: F.ui,
                transition: 'all 120ms',
              }}
            >
              <span style={{ fontWeight: 700 }}>{preset.label}</span>
              <span style={{ marginLeft: '6px', color: T.inkMuted, fontWeight: 400 }}>
                {preset.description}
              </span>
            </button>
          ))}
        </div>

        {/* Cropper area */}
        <div style={{
          position: 'relative',
          flex: 1,
          minHeight: '360px',
          background: '#1a1a2e',
        }}>
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={selectedPreset.aspect}
            onCropChange={onCropChange}
            onZoomChange={setZoom}
            onCropComplete={onCropAreaComplete}
            cropShape="rect"
            showGrid={true}
            style={{
              containerStyle: { background: '#1a1a2e' },
              cropAreaStyle: { border: '2px solid #fff', boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)' },
            }}
          />
        </div>

        {/* Controls */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${T.rule}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          background: T.vellum,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '200px' }}>
            <span style={{ fontSize: '12px', color: T.inkMid, fontWeight: 600, whiteSpace: 'nowrap' }}>
              Zoom
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1, accentColor: T.indigo, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '11px', color: T.inkMuted, minWidth: '30px', textAlign: 'right' }}>
              {zoom.toFixed(1)}x
            </span>
          </div>

          <div style={{ fontSize: '12px', color: T.inkMuted }}>
            Output: <strong style={{ color: T.ink }}>{selectedPreset.width} × {selectedPreset.height}</strong> px · WebP
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: T.brick }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                border: `1px solid ${T.rule}`,
                background: T.paper,
                color: T.ink,
                fontSize: '13px',
                fontWeight: 600,
                cursor: processing ? 'not-allowed' : 'pointer',
                fontFamily: F.ui,
                opacity: processing ? 0.5 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={processing || !croppedAreaPixels}
              style={{
                padding: '9px 22px',
                borderRadius: '10px',
                border: 'none',
                background: processing ? T.inkMuted : T.indigo,
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: (processing || !croppedAreaPixels) ? 'not-allowed' : 'pointer',
                fontFamily: F.ui,
                opacity: (processing || !croppedAreaPixels) ? 0.5 : 1,
              }}
            >
              {processing ? 'Processing...' : `Apply ${selectedPreset.label}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
