// @ts-nocheck
'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import LandingPage from '@/components/design/landing'

export default function Home() {
  const router = useRouter()
  return (
    <LandingPage
      onLogin={() => router.push('/sign-in/student')}
      onSignup={() => router.push('/sign-up/student')}
    />
  )
}
