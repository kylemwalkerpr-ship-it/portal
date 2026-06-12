'use client'
import React from 'react'

const HERO_VIDEO = '/seo-intro-hero.mp4'
const HERO_POSTER = '/seo-intro-hero-poster.jpg'

export default function SectionVideoBackdrop({
  opacity = 0.82,
}: {
  opacity?: number
}) {
  return (
    <>
      <video
        aria-hidden="true"
        className="ys-bg-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={HERO_POSTER}
        disablePictureInPicture
        controls={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity,
          filter: 'saturate(0.95) contrast(1.04) brightness(0.96)',
          pointerEvents: 'none',
        }}
      >
        <source src={HERO_VIDEO} type="video/mp4" />
      </video>
    </>
  )
}
