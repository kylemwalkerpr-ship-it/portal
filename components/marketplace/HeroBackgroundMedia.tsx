'use client'

import { useEffect, useRef, useState } from 'react'

const frameStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  display: 'block',
} as const

/**
 * Progressive enhancement for the Marketplace hero.
 *
 * The poster is always present, so an interrupted/cancelled MP4 request never
 * leaves the hero blank. The video starts only after mount, requests metadata
 * rather than eagerly preloading the whole file, and is removed after a media
 * or autoplay failure instead of remaining as a repeatedly failing resource.
 * A genuine network outage can still surface once in browser diagnostics; the
 * component's job is to contain that failure instead of making the UI depend on it.
 */
export function HeroBackgroundMedia() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (failed) return
    const video = videoRef.current
    if (!video) return

    let active = true
    const frame = window.requestAnimationFrame(() => {
      void video.play().catch(() => {
        if (active) setFailed(true)
      })
    })

    return () => {
      active = false
      window.cancelAnimationFrame(frame)
      video.pause()
    }
  }, [failed])

  return (
    <>
      <div
        className="hero-media-poster"
        aria-hidden="true"
        style={{
          ...frameStyle,
          background: "url('/hero-poster.jpg') center / cover no-repeat",
        }}
      />
      {!failed && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="metadata"
          poster="/hero-poster.jpg"
          onError={() => setFailed(true)}
          aria-hidden="true"
          style={{ ...frameStyle, objectFit: 'cover' }}
        >
          <source src="/hero-bg.mp4" type="video/mp4" />
        </video>
      )}
    </>
  )
}
