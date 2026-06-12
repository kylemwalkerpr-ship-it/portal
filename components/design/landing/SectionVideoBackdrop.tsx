'use client'
import React from 'react'
import { LandingPhotoSlideshow } from './LandingPhotoSlideshow'

export default function SectionVideoBackdrop({
  opacity = 0.82,
}: {
  opacity?: number
}) {
  return <LandingPhotoSlideshow opacity={opacity} />
}
