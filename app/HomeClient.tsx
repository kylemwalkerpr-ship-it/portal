// @ts-nocheck
'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import LandingPage from '@/components/design/landing'

/**
 * Client half of the landing route. Kept as a separate file so the
 * route's page.tsx can be a server component that emits translated
 * <title>, <meta description>, and a server-rendered intro block.
 */
export default function HomeClient() {
  const router = useRouter()
  return (
    <LandingPage
      onLogin={(lane = 'student') => router.push(`/sign-in/${lane}`)}
      onSignup={(lane = 'student') => router.push(`/sign-up/${lane}`)}
    />
  )
}
