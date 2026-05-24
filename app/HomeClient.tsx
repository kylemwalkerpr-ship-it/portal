'use client'

import React from 'react'
import Nav from '@/components/design/landing/Nav'
import Hero from '@/components/design/landing/Hero'
import StatsBand from '@/components/design/landing/StatsBand'
import PopularCategories from '@/components/design/landing/PopularCategories'
import FeaturedServices from '@/components/design/landing/FeaturedServices'
import TwoPractices from '@/components/design/landing/TwoPractices'
import HowItWorks from '@/components/design/landing/HowItWorks'
import MemberAccessBand from '@/components/design/landing/MemberAccessBand'
import FeaturedProviders from '@/components/design/landing/FeaturedProviders'
import Testimonials from '@/components/design/landing/Testimonials'
import TrustStrip from '@/components/design/landing/TrustStrip'
import PaymentMethods from '@/components/design/landing/PaymentMethods'
import FAQ from '@/components/design/landing/FAQ'
import FinalCTA from '@/components/design/landing/FinalCTA'
import MemberSignInModal from '@/components/design/landing/MemberSignInModal'
import type { LandingStat } from '@/components/design/landing/data/stats'
import type { FeaturedGig } from '@/components/design/landing/data/featured-services'
import type { FeaturedProvider } from '@/components/design/landing/data/featured-providers'
import type { Testimonial } from '@/components/design/landing/data/testimonials'

interface HomeClientProps {
  stats: LandingStat[]
  categoryCounts: Record<string, number>
  gigs: FeaturedGig[]
  providers: FeaturedProvider[]
  testimonials: Testimonial[]
}

export default function HomeClient({ stats, categoryCounts, gigs, providers, testimonials }: HomeClientProps) {
  const [signInOpen, setSignInOpen] = React.useState(false)

  return (
    <>
      <Nav onOpenSignIn={() => setSignInOpen(true)} />
      {/* Sticky cascade: every section below pins under the nav as the
          user scrolls; later sections paint over earlier ones, producing
          a card-stack effect. Inner sections keep their full-bleed
          backgrounds, so each one occludes the previous one cleanly. */}
      <div className="stack-section"><Hero onSignup={() => { window.location.href = '/sign-up/student' }} /></div>
      <div className="stack-section"><StatsBand stats={stats} /></div>
      <div className="stack-section"><PopularCategories counts={categoryCounts} /></div>
      <div className="stack-section"><FeaturedServices gigs={gigs} /></div>
      <div className="stack-section"><TwoPractices /></div>
      <div className="stack-section"><HowItWorks /></div>
      <div className="stack-section"><MemberAccessBand onOpenSignIn={() => setSignInOpen(true)} /></div>
      <div className="stack-section"><FeaturedProviders providers={providers} /></div>
      <div className="stack-section"><Testimonials testimonials={testimonials} /></div>
      <div className="stack-section"><TrustStrip /></div>
      <div className="stack-section"><PaymentMethods /></div>
      <div className="stack-section"><FAQ /></div>
      <div className="stack-section"><FinalCTA /></div>
      <MemberSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  )
}
