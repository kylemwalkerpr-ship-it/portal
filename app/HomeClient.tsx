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
      <Hero onSignup={() => { window.location.href = '/sign-up/student' }} />
      <StatsBand stats={stats} />
      <PopularCategories counts={categoryCounts} />
      <FeaturedServices gigs={gigs} />
      <TwoPractices />
      <HowItWorks />
      <MemberAccessBand onOpenSignIn={() => setSignInOpen(true)} />
      <FeaturedProviders providers={providers} />
      <Testimonials testimonials={testimonials} />
      <TrustStrip />
      <PaymentMethods />
      <FAQ />
      <FinalCTA />
      <MemberSignInModal open={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  )
}
