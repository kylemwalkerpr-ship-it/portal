'use client'
import React from 'react'

const HERO_VIDEO = '/seo-intro-hero.mp4'
const HERO_POSTER = '/seo-intro-hero-poster.jpg'

interface SectionVideoBackdropProps {
  overlay?: string
  opacity?: number
}

export default function SectionVideoBackdrop({
  overlay = 'linear-gradient(135deg, rgba(250,250,248,0.72), rgba(241,238,230,0.58))',
  opacity = 0.62,
}: SectionVideoBackdropProps) {
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
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: overlay,
          pointerEvents: 'none',
        }}
      />
    </>
  )
}
