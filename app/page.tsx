// @ts-nocheck
'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import LandingPage from '@/components/design/landing'

export default function Home() {
  const router = useRouter()
  return (
    <LandingPage
      onLogin={(lane = 'student') => router.push(`/sign-in/${lane}`)}
      onSignup={(lane = 'student') => router.push(`/sign-up/${lane}`)}
    />
  )
}
