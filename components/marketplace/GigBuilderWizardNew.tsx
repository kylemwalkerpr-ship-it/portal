// @ts-nocheck
'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { GigBuilderWizard } from './GigBuilderWizard'

interface GigBuilderWizardNewProps {
  role: 'attorney' | 'consultant'
}

export function GigBuilderWizardNew({ role }: GigBuilderWizardNewProps) {
  const router = useRouter()
  return (
    <GigBuilderWizard
      role={role}
      onComplete={(gigId: string) => router.push(`/dashboard/gigs/${gigId}/edit`)}
      onCancel={() => router.push('/dashboard/gigs')}
    />
  )
}
