// @ts-nocheck
'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { GigBuilderWizard } from './GigBuilderWizard'

export function GigBuilderWizardNew() {
  const router = useRouter()
  return (
    <GigBuilderWizard
      onComplete={(gigId: string) => router.push(`/dashboard/gigs/${gigId}/edit`)}
      onCancel={() => router.push('/dashboard/gigs')}
    />
  )
}
